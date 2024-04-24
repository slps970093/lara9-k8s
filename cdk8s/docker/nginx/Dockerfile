FROM nginx:1.25.5

# filebeat
RUN wget -qO - https://artifacts.elastic.co/GPG-KEY-elasticsearch | apt-key add - &&\
    echo "deb https://artifacts.elastic.co/packages/8.x/apt stable main" | tee -a /etc/apt/sources.list.d/elastic-8.x.list &&\
    apt-get update -y &&\
    apt-get install -y -f vim curl apt-transport-https filebeat \

# supervisor
RUN apt-get install supervisor python3 python3-pip git -y &&\
    pip install git+https://github.com/coderanger/supervisor-stdout &&\
    apt-get clean &&\
    apt-get autoremove &&\
    rm -rf /var/lib/apt/lists/* &&\
    rm -rf /tmp/pear
