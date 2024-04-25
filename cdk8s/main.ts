import { Construct } from 'constructs';
import {ApiObject, App, Chart, ChartProps} from 'cdk8s';
import {
    IntOrString,
    KubeConfigMap,
    KubeDeployment,
    KubeHorizontalPodAutoscalerV2,
    KubeIngress,
    KubeService
} from "./imports/k8s";
import {ServiceType} from "cdk8s-plus-25";

export class MyChart extends Chart {
  constructor(scope: Construct, id: string, props: ChartProps = { }) {
    super(scope, id, props);

    // define resources here

      const nginxCfg = {
          label: {
              app: `nginx-${id}`
          },
          namespace: "<<NAMESPACE>>",
          replicas: {
              min: 1,
              max: 50
          }
      }

      const phpFpmCfg = {
          label: {
              app: `php-fpm-${id}`
          },
          namespace: "<<NAMESPACE>>",
          replicas: {
              min: 1,
              max: 50
          }
      }

      const cfgMapNginx = new KubeConfigMap(this,'nginx-configmap', {
          metadata: {
              namespace: nginxCfg.namespace,
              name: "nginx-configmap"
          },
          data: {
              "default": `
server {
    listen   80; ## listen for ipv4; this line is default and implied
    listen   [::]:80 default ipv6only=on; ## listen for ipv6

    root /usr/share/nginx/html/public;
    index index.php index.html index.htm;

    # Make site accessible from http://localhost/
    server_name _;

    # Disable sendfile as per https://docs.vagrantup.com/v2/synced-folders/virtualbox.html
    sendfile off;

    # Security - Hide nginx version number in error pages and Server header
    server_tokens off;

    # Add stdout logging
    error_log /dev/stdout info;
    access_log /dev/stdout;

    # reduce the data that needs to be sent over network
    gzip on;
    gzip_min_length 10240;
    gzip_proxied expired no-cache no-store private auth;
    gzip_types text/plain text/css text/xml application/json text/javascript application/x-javascript application/xml;
    gzip_disable "MSIE [1-6]\\.";

    location / {
        # First attempt to serve request as file, then
        # as directory, then fall back to index.php
        # try_files $uri $uri/ /index.php?$query_string $uri/index.html;

        try_files $uri $uri/ /index.php?$query_string;
    }

    # redirect server error pages to the static page /50x.html
    #
    error_page   500 502 503 504  /50x.html;
    location = /50x.html {
        root   /usr/share/nginx/html;
    }

    # pass the PHP scripts to FastCGI server listening on socket
    #
    location ~ \\.php$ {
        try_files $uri $uri/ /index.php?$query_string;
        fastcgi_split_path_info ^(.+\\.php)(/.+)$;
        fastcgi_pass unix:/run/php/php8.2-fpm.sock;
        fastcgi_index index.php;
        include fastcgi_params;
        fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name;
        fastcgi_param PATH_INFO $fastcgi_path_info;

        fastcgi_read_timeout 600s;
        fastcgi_buffering off;
    }

        location ~* \\.(jpg|jpeg|gif|png|css|js|ico|xml)$ {
                expires           5d;
        }

    # deny access to . files, for security
    #
    location ~ /\\. {
            log_not_found off;
            deny all;
    }
}
              `,
              "nginx.conf": `
user  nginx;
worker_processes  1;

error_log  /var/log/nginx/error.log notice;
pid        /var/run/nginx.pid;


events {
    worker_connections  1024;
}


http {
    include       /etc/nginx/mime.types;
    default_type  application/octet-stream;

    log_format  main  '$remote_addr - $remote_user [$time_local] "$request" '
                      '$status $body_bytes_sent "$http_referer" '
                      '"$http_user_agent" "$http_x_forwarded_for"';

    access_log  /var/log/nginx/access.log  main;

    client_max_body_size 10M;
    sendfile        on;
    #tcp_nopush     on;

    keepalive_timeout  65;

    #gzip  on;

    include /etc/nginx/conf.d/*.conf;
}
              `
          }
      })

      // https://serverfault.com/questions/884256/how-and-where-to-configure-pm-max-children-for-php-fpm-with-docker
      const cfgMapPhpFpm = new KubeConfigMap(this,"php-fpm-configmap", {
          metadata: {
              namespace: phpFpmCfg.namespace,
              name: "php-fpm-configmap"
          },
          data: {
              "www.conf": `
                [global]

                [www]
                user = www-data
                group = www-data
                listen = 0.0.0.0:9000
                pm.status_path=/status

                pm = dynamic
                pm.max_children = 5
                pm.start_servers = 2
                pm.min_spare_servers = 1
                pm.max_spare_servers = 3
                pm.max_requests = 500

                request_terminate_timeout = 60
                request_slowlog_timeout = 3
                slowlog = log/$pool.slowlog.log
              `
          }
      })

      const secretName = "laravel-secrets";

      const secretStore = new ApiObject(this, 'secret-store', {
          apiVersion: 'external-secrets.io/v1beta1',
          kind: 'SecretStore',
          metadata: {
              namespace: phpFpmCfg.namespace,
              name: "cdk8s-laravel-secret-store"
          },
          spec: {
              provider: {
                  aws: {
                      service: "SecretsManager",
                      region: "<<AWS_REGION>>",
                  }
              }
          }
      });

      new ApiObject(this, "external-secret", {
          apiVersion: 'external-secrets.io/v1beta1',
          kind: 'ExternalSecret',
          metadata: {
              namespace: phpFpmCfg.namespace,
              name: 'cdk8s-laravel-external-secret'
          },
          spec: {
              refreshInterval: "5m",
              secretStoreRef: {
                  name: secretStore.metadata.name,
                  kind: secretStore.kind
              },
              target: {
                  name: secretName,
                  creationPolicy: "Owner"
              },
              dataFrom: [
                  {
                      extract: {
                          key: "<<AWS_SECRET_MANAGER_NAME>>"
                      }
                  }
              ]
          }
      })

      // deploy
      const deployNginx = new KubeDeployment(this, "nginx-deploy", {
          metadata: {
              namespace: nginxCfg.namespace
          },
          spec: {
              selector: { matchLabels: nginxCfg.label },
              template: {
                  metadata: { labels: nginxCfg.label },
                  spec: {
                      containers: [
                          {
                              name: "nginx",
                              image: "<<NGINX_DOCKER_IMAGE_URL>>",
                              ports: [ { containerPort: 80 } ],
                              volumeMounts: [
                                  {
                                      name: "nginx-site",
                                      mountPath: "/etc/nginx/sites-available"
                                  },
                                  {
                                      name: "nginx-cfg",
                                      mountPath: "/etc/nginx/nginx.conf",
                                      subPath: "nginx.conf"
                                  }
                              ]
                          },
                      ],
                      volumes: [
                          {
                              name: "nginx-site",
                              configMap: {
                                  name: cfgMapNginx.name,
                                  items: [
                                      {
                                          key: "default",
                                          path: "default"
                                      }
                                  ]
                              }
                          },
                          {
                              name: "nginx-cfg",
                              configMap: {
                                  name: cfgMapNginx.name,
                                  items: [
                                      {
                                          key: "nginx.conf",
                                          path: "nginx.conf"
                                      }
                                  ]
                              }
                          }
                      ]
                  }
              }
          }
      })

      const deployPhpFpm = new KubeDeployment(this,"php-fpm-deploy", {
          metadata: {
              namespace: phpFpmCfg.namespace
          },
          spec: {
              selector: { matchLabels: phpFpmCfg.label },
              template: {
                  metadata: { labels: phpFpmCfg.label },
                  spec: {
                      // serviceAccount: "<<SERVICE_ACCOUNT>>",
                      containers: [
                          {
                              name: "php-fpm",
                              image: "<<PHP_FPM_DOCKER_IMAGE_URL>>",
                              envFrom: [
                                  {
                                      secretRef: {
                                          name: secretName
                                      }
                                  }
                              ],
                              volumeMounts: [
                                  {
                                      name: "fpm-config",
                                      mountPath: "/usr/local/etc/php-fpm.d/"
                                  }
                              ],
                              ports: [ { containerPort: 9000 } ]
                          }
                      ],
                      volumes: [
                          {
                              name: "fpm-config",
                              configMap: {
                                  name: cfgMapPhpFpm.name,
                                  items: [
                                      {
                                          key: "www.conf",
                                          path: "www.conf"
                                      }
                                  ]
                              }
                          }
                      ]
                  }
              }
          }
      })

      // service
      const servNginx = new KubeService(this, 'nginx-serv', {
          metadata: {
              namespace: nginxCfg.namespace,
              name: "nginx-serv"
          },
          spec: {
              type: ServiceType.NODE_PORT,
              ports: [
                  {
                      name: "http-port",
                      port: 80,
                      targetPort: IntOrString.fromNumber(80),
                      protocol: "TCP"
                  }
              ]
          }
      })

      new KubeService(this, 'php-fpm-serv', {
          metadata: {
              namespace: phpFpmCfg.namespace,
              name: "php-fpm-serv"
          },
          spec: {
              type: ServiceType.NODE_PORT,
              ports: [
                  {
                      name: "fpm-port",
                      port: 9000,
                      targetPort: IntOrString.fromNumber(9000),
                      protocol: "TCP"
                  }
              ]
          }
      });

      // HPA
      new KubeHorizontalPodAutoscalerV2(this, "nginx-hpa", {
          metadata: {
              namespace: nginxCfg.namespace,
              name: "nginx-hpa"
          },
          spec: {
              scaleTargetRef: {
                  apiVersion: deployNginx.apiVersion,
                  kind: deployNginx.kind,
                  name: deployNginx.name
              },
              metrics: [
                  {
                      resource: {
                          name: "CPU",
                          target: {
                              averageUtilization: 50,
                              type: "Utilization"
                          }
                      },
                      type: "Resource"
                  }
              ],
              minReplicas: nginxCfg.replicas.min,
              maxReplicas: nginxCfg.replicas.max,
              behavior: {
                  scaleUp: {
                      stabilizationWindowSeconds: 10,
                      policies: [
                          {
                              type: "Percent",
                              value: 100,
                              periodSeconds: 15
                          },
                          {
                              type: "Pods",
                              value: 4,
                              periodSeconds: 15
                          }
                      ]
                  },
                  scaleDown: {
                      stabilizationWindowSeconds: 300,
                      policies: [
                          {
                              type: "Pods",
                              value: 1,
                              periodSeconds: 300
                          }
                      ]
                  }
              }
          }
      });

      new KubeHorizontalPodAutoscalerV2(this, "php-fpm-hpa", {
          metadata: {
              namespace: phpFpmCfg.namespace,
              name: "php-fpm-hpa"
          },
          spec: {
              scaleTargetRef: {
                  apiVersion: deployPhpFpm.apiVersion,
                  kind: deployPhpFpm.kind,
                  name: deployPhpFpm.name
              },
              metrics: [
                  {
                      resource: {
                          name: "CPU",
                          target: {
                              averageUtilization: 50,
                              type: "Utilization"
                          }
                      },
                      type: "Resource"
                  }
              ],
              minReplicas: phpFpmCfg.replicas.min,
              maxReplicas: phpFpmCfg.replicas.max,
              behavior: {
                  scaleUp: {
                      stabilizationWindowSeconds: 10,
                      policies: [
                          {
                              type: "Percent",
                              value: 100,
                              periodSeconds: 15
                          },
                          {
                              type: "Pods",
                              value: 4,
                              periodSeconds: 15
                          }
                      ]
                  },
                  scaleDown: {
                      stabilizationWindowSeconds: 300,
                      policies: [
                          {
                              type: "Pods",
                              value: 1,
                              periodSeconds: 300
                          }
                      ]
                  }
              }
          }
      });

      // Ingress
      new KubeIngress(this, "nginx-ingress", {
          metadata: {
              namespace: nginxCfg.namespace,
              annotations: {
                  "alb.ingress.kubernetes.io/load-balancer-name": "<<AWS_ALB_NAME_PREFIX>>-alb",
                  "alb.ingress.kubernetes.io/scheme": "internet-facing",
                  "alb.ingress.kubernetes.io/group.name": "<<AWS_ALB_NAME_PREFIX>>-tg",
                  "alb.ingress.kubernetes.io/target-type": "ip",
                  "alb.ingress.kubernetes.io/certificate-arn": "<<AWS_CERTIFICATE_ARN>>",
                  "alb.ingress.kubernetes.io/listen-ports": '[{"HTTP": 80}, {"HTTPS":443}]',
                  "alb.ingress.kubernetes.io/ssl-redirect": "443",
                  // 缩小延迟注销时间
                  "alb.ingress.kubernetes.io/target-group-attributes": "deregistration_delay.timeout_seconds=30"
              },
          },
          spec: {
              ingressClassName: "alb",
              rules: [
                  {
                      http: {
                          paths: [
                              {
                                  path: "/",
                                  pathType: "Prefix",
                                  backend: {
                                      service: {
                                          name: servNginx.name,
                                          port: {
                                              number: 80
                                          }
                                      }
                                  }
                              }
                          ]
                      }
                  }
              ]
          }
      });

  }
}

const app = new App();
new MyChart(app, 'cdk8s');
app.synth();
