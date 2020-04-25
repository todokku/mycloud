#!/bin/bash

yum -y update
yum -y update kernel

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

# Add extra repos first
yum-config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo
yum update

# ********** FETCH REQUIRED RMP PACKAGES ************
yum install -y yum-utils wget
yum -y install https://dl.fedoraproject.org/pub/epel/epel-release-latest-7.noarch.rpm

mkdir /var/tmp/rpms/epel-release-latest-7
wget https://dl.fedoraproject.org/pub/epel/epel-release-latest-7.noarch.rpm -O /var/tmp/rpms/epel-release-latest-7/epel-release-latest-7.noarch.rpm

mkdir /var/tmp/rpms/virtualbox
wget https://download.virtualbox.org/virtualbox/6.1.4/VirtualBox-6.1-6.1.4_136177_el7-1.x86_64.rpm -O /var/tmp/rpms/virtualbox/VirtualBox-6.1-6.1.4_136177_el7-1.x86_64.rpm

mkdir /var/tmp/rpms/vagrant
wget https://releases.hashicorp.com/vagrant/2.2.7/vagrant_2.2.7_x86_64.rpm -O /var/tmp/rpms/vagrant/vagrant_2.2.7_x86_64.rpm

IFS=$'\r\n' GLOBIGNORE='*' command eval  'RPM_LIST=($(cat /var/tmp/rpms/rpm-list.cfg))'
for PACKAGE in "${RPM_LIST[@]}"; do :
    if [[ "$PACKAGE" =~ ^#.*  ]]; then
        echo "Skipping docker $PACKAGE"
    else
        download_rpm $PACKAGE
    fi
done

# ********** FETCH REQUIRED DOCKER CONTAINERS ************
yum install -y docker-ce
systemctl enable docker
systemctl start docker

IFS=$'\r\n' GLOBIGNORE='*' command eval  'DIMG_LIST=($(cat /var/tmp/docker-images/image-list.cfg))'
for PACKAGE in "${RPM_LIST[@]}"; do :
    if [[ "$PACKAGE" =~ ^#.*  ]]; then
        echo "Skipping dependency $PACKAGE"
    else
        D_IMG=$(echo $PACKAGE | cut -d' ' -f1)
        D_VER=$(echo $PACKAGE | cut -d' ' -f2)
        F_NAME=$(echo $PACKAGE | cut -d' ' -f3)
        fetch_docker_images $D_IMG $D_VER $F_NAME
    fi
done

# Cleanup
yum -y install yum-utils
package-cleanup -y --oldkernels --count=1
yum -y autoremove
yum -y remove yum-utils
yum clean all
rm -rf /tmp/*
rm -f /var/log/wtmp /var/log/btmp

cat /dev/null > ~/.bash_history && history -c
history -c