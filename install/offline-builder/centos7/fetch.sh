#!/bin/bash

fetch_repo() {
    mkdir /var/tmp/rpms/$1
    mkdir /var/tmp/rpms/$1-installroot
    yum install --downloadonly --installroot=/var/tmp/rpms/$1-installroot --releasever=7 --downloaddir=/var/tmp/rpms/$1 $1
    tar -czvf /var/tmp/rpms/$1.tar.gz /var/tmp/rpms/$1
    rm -rf /var/tmp/rpms/$1
    rm -rf /var/tmp/rpms/$1-installroot
}

fetch_docker_images() {
    docker pull $1:$2
    docker save -o /var/tmp/docker-images/$1-$2.tar $1:$2
    docker rmi $1:$2
    docker images purge
}

yum-config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo
yum update
yum install -y docker-ce
systemctl enable docker
systemctl start docker

# fetch_repo createrepo
# fetch_repo yum-utils
# fetch_repo device-mapper-persistent-data
# fetch_repo lvm2
# fetch_repo git
# fetch_repo wget
# fetch_repo docker-ce
# fetch_repo sshpass

fetch_docker_images registry 2.7.1
fetch_docker_images postgres 12.2-alpine
fetch_docker_images jboss/keycloak 9.0.3
fetch_docker_images nginx 1.17.10-alpine
fetch_docker_images eclipse-mosquitto 1.6
fetch_docker_images node 12.16.2