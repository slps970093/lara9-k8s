#!/bin/bash

chown -Rf www-data:www-data /var/www/html/storage
chown -Rf www-data:www-data /var/www/html/bootstrap
chown -Rf www-data:www-data /var/www/html/public

supervisord -n -c /var/www/html/cdk8s/docker/php82-fpm/supervisord.conf
