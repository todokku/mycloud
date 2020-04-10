#!/bin/bash

DIR="$(cd "$(dirname "$0")" && pwd)"
_PWD="$(pwd)"

cd $DIR

git pull
docker build -t mycloud-ctrl:0.9 .
docker rm -f mycloud-ctrl
docker run -d \
    --name mycloud-ctrl \
    --restart unless-stopped \
    --network host \
    -e DB_HOST=192.168.0.97 \
    -e DB_USER=postgres \
    -e DB_PASS=postgrespass \
    -e MOSQUITTO_IP=192.168.0.97 \
    -e DHCP_MASK=192.168.0 \
    -e NGINX_HOST_IP=192.168.0.97 \
    -e ENABLE_NGINX_STREAM_DOMAIN_NAME=false \
    -v /var/run/docker.sock:/var/run/docker.sock \
    -v /home/vagrant/.mycloud/nginx:/usr/src/app/nginx \
    mycloud-ctrl:0.9

cd "$_PWD" 

docker logs -f mycloud-ctrl
