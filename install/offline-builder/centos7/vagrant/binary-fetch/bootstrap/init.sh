#!/bin/bash

# Add extra repos first
DOCKER_REPO_EXISTS=$(yum repolist | grep "docker-ce-stable/x86_64")
if [ "$DOCKER_REPO_EXISTS" == "" ]; then
    yum-config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo
fi

K8S_REPO_EXISTS=$(yum repolist | grep "kubernetes")
if [ "$K8S_REPO_EXISTS" == "" ]; then
    cat <<EOF > /etc/yum.repos.d/kubernetes.repo
[kubernetes]
name=Kubernetes
baseurl=https://packages.cloud.google.com/yum/repos/kubernetes-el7-x86_64
enabled=1
gpgcheck=1
repo_gpgcheck=1
gpgkey=https://packages.cloud.google.com/yum/doc/yum-key.gpg https://packages.cloud.google.com/yum/doc/rpm-package-key.gpg
EOF
fi

yum -y update

# ********** FETCH REQUIRED RMP PACKAGES ************
WGET_EXISTS=$(command -v wget)
if [ "$WGET_EXISTS" == "" ]; then
    yum install -y yum-utils wget
fi

EPEL_EXISTS=$(yum repolist | grep "epel/x86_64")
if [ "$EPEL_EXISTS" == "" ]; then
    yum -y install https://dl.fedoraproject.org/pub/epel/epel-release-latest-7.noarch.rpm
fi