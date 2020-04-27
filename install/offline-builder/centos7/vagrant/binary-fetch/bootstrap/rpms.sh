#!/bin/bash

if [ ! -d "/var/tmp/rpms/epel-release-latest-7" ]; then
    mkdir /var/tmp/rpms/epel-release-latest-7
fi
if [ -z "$(ls /var/tmp/rpms/epel-release-latest-7)" ]; then 
   wget https://dl.fedoraproject.org/pub/epel/epel-release-latest-7.noarch.rpm -O /var/tmp/rpms/epel-release-latest-7/epel-release-latest-7.noarch.rpm
fi


if [ ! -d "/var/tmp/rpms/virtualbox" ]; then
    mkdir /var/tmp/rpms/virtualbox
fi
if [ -z "$(ls /var/tmp/rpms/virtualbox)" ]; then 
   wget https://download.virtualbox.org/virtualbox/6.1.4/VirtualBox-6.1-6.1.4_136177_el7-1.x86_64.rpm -O /var/tmp/rpms/virtualbox/VirtualBox-6.1-6.1.4_136177_el7-1.x86_64.rpm
fi


if [ ! -d "/var/tmp/rpms/vagrant" ]; then
    mkdir /var/tmp/rpms/vagrant
fi
if [ -z "$(ls /var/tmp/rpms/vagrant)" ]; then 
    wget https://releases.hashicorp.com/vagrant/2.2.7/vagrant_2.2.7_x86_64.rpm -O /var/tmp/rpms/vagrant/vagrant_2.2.7_x86_64.rpm
fi

download_rpm() {
    if [ ! -d "/var/tmp/rpms/$1" ]; then
        mkdir /var/tmp/rpms/$1
    fi
    if [ -z "$(ls /var/tmp/rpms/$1)" ]; then 
        yumdownloader --assumeyes --destdir=/var/tmp/rpms/$1 --resolve $1
    fi
}

yum install -y centos-release-gluster

IFS=$'\r\n' GLOBIGNORE='*' command eval  'RPM_LIST=($(cat /var/tmp/rpms/rpm-list.cfg))'
for PACKAGE in "${RPM_LIST[@]}"; do :
    if [[ "$PACKAGE" =~ ^#.*  ]]; then
        echo "==> Skipping rpm $PACKAGE"
    else
        echo "==> Downloading package $PACKAGE"
        download_rpm $PACKAGE
    fi
done