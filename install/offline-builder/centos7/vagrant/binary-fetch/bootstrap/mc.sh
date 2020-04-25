#!/bin/bash

DOCKER_EXISTS=$(command -v docker)
if [ "$DOCKER_EXISTS" == "" ]; then
    # ********** FETCH REQUIRED DOCKER CONTAINERS ************
    yum install -y docker-ce
    systemctl enable docker
    systemctl start docker
fi

# Build & export mycloud docker images
cd /home/vagrant/mycloud/src/api
docker build -t mycloud-api:0.9 .
if [ $? -ne 0 ]; then
    echo "Error building MyCloud API docker image"
    exit 1
fi
docker save -o /var/tmp/docker-images/mycloud-api-0.9.tar mycloud-api:0.9
docker rmi mycloud-api:0.9
docker images purge

cd /home/vagrant/mycloud/src/task-controller
docker build -t mycloud-ctrl:0.9 .
if [ $? -ne 0 ]; then
    echo "Error building MyCloud Ctrl docker image"
    exit 1
fi
docker save -o /var/tmp/docker-images/mycloud-ctrl-0.9.tar mycloud-ctrl:0.9
docker rmi mycloud-ctrl:0.9
docker images purge