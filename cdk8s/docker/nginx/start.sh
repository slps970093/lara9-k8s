#!/bin/bash

supervisord -n -c /var/www/html/cdk8s/docker/nginx/supervisord.conf

