FROM php:8.2-fpm
# 參考
# https://learnku.com/articles/31344
COPY ./ /var/www/html

RUN apt-get update -y &&\
    apt-get install wget gnupg2 -y

# filebeat
RUN wget -qO - https://artifacts.elastic.co/GPG-KEY-elasticsearch | apt-key add - &&\
    echo "deb https://artifacts.elastic.co/packages/8.x/apt stable main" | tee -a /etc/apt/sources.list.d/elastic-8.x.list &&\
    apt-get update -y &&\
    apt-get install -y -f vim curl apt-transport-https filebeat

# GD EXT
RUN apt-get install -y --no-install-recommends libfreetype6-dev libjpeg62-turbo-dev libpng-dev \
    && docker-php-ext-configure gd  \
    && docker-php-ext-install -j$(nproc) gd

RUN docker-php-ext-install -j$(nproc) bcmath calendar exif gettext sockets dba mysqli pcntl pdo_mysql shmop sysvmsg sysvsem sysvshm iconv

# supervisor
RUN apt-get install supervisor python3 python3-pip git pipx -y &&\
    pipx ensurepath &&\
    pipx install git+https://github.com/coderanger/supervisor-stdout

# redis EXT
RUN pecl install redis && docker-php-ext-enable redis

# clear and setting
RUN chmod a+x /var/www/html/cdk8s/docker/php-fpm/start.sh &&\
    apt-get clean &&\
    apt-get autoremove &&\
    rm -rf /var/lib/apt/lists/* &&\
    rm -rf /tmp/pear

CMD ["/var/www/html/cdk8s/docker/php-fpm/start.sh"]
