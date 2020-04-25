#!/bin/bash

mkdir /var/tmp/rpms/epel-release-latest-7
wget https://dl.fedoraproject.org/pub/epel/epel-release-latest-7.noarch.rpm -O /var/tmp/rpms/epel-release-latest-7/epel-release-latest-7.noarch.rpm

mkdir /var/tmp/rpms/virtualbox
wget https://download.virtualbox.org/virtualbox/6.1.4/VirtualBox-6.1-6.1.4_136177_el7-1.x86_64.rpm -O /var/tmp/rpms/virtualbox/VirtualBox-6.1-6.1.4_136177_el7-1.x86_64.rpm

mkdir /var/tmp/rpms/vagrant
wget https://releases.hashicorp.com/vagrant/2.2.7/vagrant_2.2.7_x86_64.rpm -O /var/tmp/rpms/vagrant/vagrant_2.2.7_x86_64.rpm

download_rpm() {
    mkdir /var/tmp/rpms/$1
    yumdownloader --assumeyes --destdir=/var/tmp/rpms/$1 --resolve $1
}

IFS=$'\r\n' GLOBIGNORE='*' command eval  'RPM_LIST=($(cat /var/tmp/rpms/rpm-list.cfg))'
for PACKAGE in "${RPM_LIST[@]}"; do :
    if [[ "$PACKAGE" =~ ^#.*  ]]; then
        echo "Skipping docker $PACKAGE"
    else
        download_rpm $PACKAGE
    fi
done