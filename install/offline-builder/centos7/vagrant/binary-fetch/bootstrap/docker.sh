#!/bin/bash

fetch_docker_images() {
    if [ ! -f /var/tmp/docker-images/$3-$2.tar ]; then
        echo "==> Downloading image $1:$2"
        docker pull $1:$2
        docker save -o /var/tmp/docker-images/$3-$2.tar $1:$2
        docker rmi $1:$2
        docker images purge
    else
        echo "==> Image $1:$2 already present, skipping"
    fi
}

DOCKER_EXISTS=$(command -v docker)
if [ "$DOCKER_EXISTS" == "" ]; then
    echo "==> Installing Docker..."
    # ********** FETCH REQUIRED DOCKER CONTAINERS ************
    yum install -y docker-ce
    systemctl enable docker
    systemctl start docker
fi


IFS=$'\r\n' GLOBIGNORE='*' command eval  'DIMG_LIST=($(cat /var/tmp/docker-images/image-list.cfg))'
for PACKAGE in "${DIMG_LIST[@]}"; do :
    if [[ "$PACKAGE" =~ ^#.*  ]]; then
        echo "Skipping image $PACKAGE"
    else
        D_IMG=$(echo $PACKAGE | cut -d' ' -f1)
        D_VER=$(echo $PACKAGE | cut -d' ' -f2)
        F_NAME=$(echo $PACKAGE | cut -d' ' -f3)
        fetch_docker_images $D_IMG $D_VER $F_NAME
    fi
done