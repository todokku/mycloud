#!/bin/bash

download_rpm() {
    mkdir /var/tmp/rpms/$1
    yumdownloader --assumeyes --destdir=/var/tmp/rpms/$1 --resolve $1
}

fetch_docker_images() {
    docker pull $1:$2
    docker save -o /var/tmp/docker-images/$3-$2.tar $1:$2
    docker rmi $1:$2
    docker images purge
}

# Add docker repo first
yum-config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo
yum update

# ********** FETCH REQUIRED RMP PACKAGES ************
yum install -y yum-utils

IFS=$'\r\n' GLOBIGNORE='*' command eval  'RPM_LIST=($(cat /var/tmp/rpms/rpm-list.cfg))'
for PACKAGE in "${RPM_LIST[@]}"; do :
   download_rpm $PACKAGE
done

# ********** FETCH REQUIRED DOCKER CONTAINERS ************
yum install -y docker-ce
systemctl enable docker
systemctl start docker

IFS=$'\r\n' GLOBIGNORE='*' command eval  'DIMG_LIST=($(cat /var/tmp/docker-images/image-list.cfg))'
for PACKAGE in "${RPM_LIST[@]}"; do :
   D_IMG=$(echo $PACKAGE | cut -d' ' -f1)
   D_VER=$(echo $PACKAGE | cut -d' ' -f2)
   F_NAME=$(echo $PACKAGE | cut -d' ' -f3)
   fetch_docker_images $D_IMG $D_VER $F_NAME
done