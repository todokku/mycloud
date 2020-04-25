#!/bin/bash

# Add extra repos first
yum-config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo
cat <<EOF > /etc/yum.repos.d/kubernetes.repo
[kubernetes]
name=Kubernetes
baseurl=https://packages.cloud.google.com/yum/repos/kubernetes-el7-x86_64
enabled=1
gpgcheck=1
repo_gpgcheck=1
gpgkey=https://packages.cloud.google.com/yum/doc/yum-key.gpg https://packages.cloud.google.com/yum/doc/rpm-package-key.gpg
EOF

yum -y update
yum -y update kernel

# ********** FETCH REQUIRED RMP PACKAGES ************
yum install -y yum-utils wget
yum -y install https://dl.fedoraproject.org/pub/epel/epel-release-latest-7.noarch.rpm