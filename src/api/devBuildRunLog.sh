#!/bin/bash

DIR="$(cd "$(dirname "$0")" && pwd)"
_PWD="$(pwd)"

cd $DIR

git pull
docker build -t mycloud-api:0.9 .
docker rm -f mycloud-api
docker run -d \
    --name mycloud-api \
    --restart unless-stopped \
    --network host \
    -e DB_HOST=192.168.0.97 \
    -e NGINX_HOST_IP=192.168.0.97 \
    -e DB_USER=postgres \
    -e DB_PASS=password \
    -e MOSQUITTO_IP=192.168.0.97 \
    -e API_SYSADMIN_USER=mdundek@gmail.com \
    -e API_SYSADMIN_PASSWORD=li14ebe14 \
    -e REGISTRY_IP=192.168.0.97 \
    -e CRYPTO_KEY=YDbxyG16Q6ujlCpjXH2Pq7nPAtJF66jLGwx4RYkHqhY= \
    -e ENABLE_NGINX_STREAM_DOMAIN_NAME=false \
    -e MC_SERVICES_DIR=/usr/src/app/data/mc_services \
    -v /home/vagrant/mycloud:/usr/src/app/data \
    mycloud-api:0.9

cd "$_PWD" 

docker logs -f mycloud-api