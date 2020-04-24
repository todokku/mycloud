#!/bin/bash

fetch_repo() {
    mkdir /var/tmp/rpms/$1
    mkdir /var/tmp/rpms/$1-installroot
    yum install --downloadonly --installroot=/var/tmp/rpms/$1-installroot --releasever=7 --downloaddir=/var/tmp/rpms/$1 $1
    tar -czvf /var/tmp/rpms/$1.tar.gz /var/tmp/rpms/$1
    rm -rf /var/tmp/rpms/$1
    rm -rf /var/tmp/rpms/$1-installroot
}

yum-config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo

yum update

fetch_repo createrepo
fetch_repo yum-utils
fetch_repo device-mapper-persistent-data
fetch_repo lvm2
fetch_repo git
fetch_repo wget
fetch_repo docker-ce
fetch_repo sshpass
