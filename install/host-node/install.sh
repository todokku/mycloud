#!/bin/bash

_DIR="$(cd "$(dirname "$0")" && pwd)"
_PWD="$(pwd)"

cd $_DIR

install_core_components() {
    echo "[STEP 2] Installing host controller components ..."
    cd $HOME/my-cloud/core/deploy/my-cloud-base/src # Position cmd in src folder
    
    HAS_GLUSTER_CONTAINER=$(sudo docker ps -a | grep "gluster2-ctl")
    if [ "$HAS_GLUSTER_CONTAINER" == "" ]; then
        sudo docker pull gluster/gluster-centos &> /dev/null

        mkdir -p $HOME/my-cloud/gluster/etc/glusterfs &> /dev/null
        mkdir -p $HOME/my-cloud/gluster/var/lib/glusterd &> /dev/null
        mkdir -p $HOME/my-cloud/gluster/var/log/glusterfs &> /dev/null
        mkdir -p $HOME/my-cloud/gluster/bricks &> /dev/null
    fi

    cp env-host-node-template env

    echo "==> Please enter the PostgreSQL database & Mosquitto host IP:"
    read MASTER_IP  

    echo "==> Please enter the docker registry host IP:"
    read REGISTRY_IP  
   
    echo "==> Please enter the PostgreSQL database K8S service port:"
    read POSTGRES_PORT  
    
    echo "==> Please enter the Mosquitto K8S service port:"
    read MOSQUITTO_PORT  

    echo "==> Please enter the PostgreSQL database password:"
    read PW  

    echo "==> Is this host serving as a K8S cluster node (y/n)?:"
    read IS_K8S_NODE
    while [[ "$IS_K8S_NODE" != 'y' ]] && [[ "$IS_K8S_NODE" != 'n' ]]; do
        echo "==> Invalide answer, try again (y/n)?:"
        read IS_K8S_NODE
    done
    if [ "$IS_K8S_NODE" == "y" ]; then
        IS_K8S_NODE="true"
    else
        IS_K8S_NODE="false"
    fi

    echo "==> Is this host serving as a Gluster peer (y/n)?:"
    read IS_GLUSTER_PEER
    while [[ "$IS_GLUSTER_PEER" != 'y' ]] && [[ "$IS_GLUSTER_PEER" != 'n' ]]; do
        echo "==> Invalide answer, try again (y/n)?:"
        read IS_GLUSTER_PEER
    done
    if [ "$IS_GLUSTER_PEER" == "y" ]; then
        IS_GLUSTER_PEER="true"

        echo "==> What filesystem is used for your volume provisionning (see list of available volumes with the command 'df -h')?:"
        read GLUSTER_VOLUME
        while [[ "$GLUSTER_VOLUME" == "" ]]; do
            echo "==> Invalide answer, try again:"
            read GLUSTER_VOLUME
        done
    else
        IS_GLUSTER_PEER="false"
    fi
    
    VM_BASE=$HOME/my-cloud/vm_base

    if [[ $(uname -s) == Darwin ]]; then
        INET=$(route get 10.10.10.10 | grep 'interface' | tr -s " " | sed -e 's/^[ \t]*//' | cut -d ' ' -f 2)
    fi
    if [[ $(uname -s) == Linux ]]; then
        INET=$(route | grep '^default' | grep -o '[^ ]*$')
    fi

    sed -i "s/<MASTER_IP>/$MASTER_IP/g" ./env
    sed -i "s/<REGISTRY_IP>/$REGISTRY_IP/g" ./env
    sed -i "s/<DB_PORT>/$POSTGRES_PORT/g" ./env
    sed -i "s/<DB_PASS>/$PW/g" ./env
    sed -i "s/<MOSQUITTO_PORT>/$MOSQUITTO_PORT/g" ./env
    sed -i "s/<VM_BASE_HOME>/${VM_BASE//\//\\/}/g" ./env
    sed -i "s/<NET_INTEFACE>/$INET/g" ./env
    sed -i "s/<IS_K8S_NODE>/$IS_K8S_NODE/g" ./env
    sed -i "s/<IS_GLUSTER_PEER>/$IS_GLUSTER_PEER/g" ./env
    sed -i "s/<GLUSTER_VOL>/$GLUSTER_VOLUME/g" ./env

    cp env host-node/.env
    
    rm env

    HOST_NODE_DEPLOYED=$(pm2 ls | grep "mycloud-host-node")
    if [ "$HOST_NODE_DEPLOYED" == "" ]; then
        cd host-node
        npm i
        pm2 start index.js --watch --name mycloud-host-node --time --log ../_logs/host-node.logs
        cd ..
    else
        pm2 restart mycloud-host-node
    fi

    cd .. # Back to repo root folder
}

pull_git() {
    echo "[INIT] Pulling repo from GIT..."
    if [ ! -d "$HOME/my-cloud" ] 
    then
        mkdir $HOME/my-cloud
        git clone https://gitlab.com/Dundek/k8s-cloud.git $HOME/my-cloud
    fi
}

authorize_private_registry() {
    sshpass -p 'kubeadmin' sudo scp -o UserKnownHostsFile=/dev/null -o StrictHostKeyChecking=no vagrant@192.168.0.98:/home/vagrant/configPrivateRegistry.sh ./configPrivateRegistry.sh
    sudo ./configPrivateRegistry.sh
}

dependencies () {
    echo "[STEP 1] Installing dependencies..."
    #sudo apt update

    DOCKER_EXISTS=$(command -v docker)
    if [ "$DOCKER_EXISTS" == "" ]; then
        sudo apt-get install apt-transport-https ca-certificates curl gnupg-agent software-properties-common -y
        curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo apt-key add -
        sudo add-apt-repository "deb [arch=amd64] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable"
        sudo apt-get update
        sudo apt-get install docker-ce docker-ce-cli containerd.io -y
        sudo usermod -aG docker $USER
    else
        sudo apt-get update
    fi

    VIRTUALBOX_EXISTS=$(command -v vboxmanage)
    if [ "$VIRTUALBOX_EXISTS" == "" ]; then
        apt install virtualbox -y &> /dev/null
    fi

    VAGRANT_EXISTS=$(command -v vagrant)
    if [ "$VAGRANT_EXISTS" == "" ]; then
        apt install vagrant -y &> /dev/null
    fi

    DOS2UNIX_EXISTS=$(command -v dos2unix)
    if [ "$DOS2UNIX_EXISTS" == "" ]; then
        apt install dos2unix -y &> /dev/null
    fi

    NODE_EXISTS=$(command -v node)
    if [ "$NODE_EXISTS" == "" ]; then
        curl -sL https://deb.nodesource.com/setup_12.x -o nodesource_setup.sh &> /dev/null
        sudo bash nodesource_setup.sh &> /dev/null
        sudo apt install nodejs -y &> /dev/null
        rm -rf nodesource_setup.sh &> /dev/null
    fi

    PM2_EXISTS=$(command -v pm2)
    if [ "$PM2_EXISTS" == "" ]; then
        sudo npm install pm2@latest -g &> /dev/null
        sudo chown $(id -u):$(id -g) $HOME/.pm2/rpc.sock $HOME/.pm2/pub.sock
        sudo pm2 install pm2-logrotate
        pm2 set pm2-logrotate:max_size 10M
        pm2 set pm2-logrotate:compress true
        pm2 set pm2-logrotate:rotateInterval '* * 1 * *'
    fi

    TAR_EXISTS=$(command -v tar)
    if [ "$TAR_EXISTS" == "" ]; then
        apt install tar -y &> /dev/null
    fi

    SSHPASS_EXISTS=$(command -v sshpass)
    if [ "$SSHPASS_EXISTS" == "" ]; then
        apt install sshpass -y &> /dev/null
    fi

    HELM_EXISTS=$(command -v helm)
    if [ "$HELM_EXISTS" == "" ]; then
        echo "export PATH=$PATH:/usr/local/bin/" >> /etc/environment
        export PATH=$PATH:/usr/local/bin/
        curl https://raw.githubusercontent.com/helm/helm/master/scripts/get-helm-3 | bash
    fi

    GIT_EXISTS=$(command -v git)
    if [ "$GIT_EXISTS" == "" ]; then
        sudo apt install git -y &> /dev/null
    fi
}


# Install dependencies
dependencies
# set up private registry
authorize_private_registry
# Clone repo
pull_git
# Install the core components
install_core_components

echo "[DONE] MyCloud host controller deployed successfully!"

if [ "$IS_GLUSTER_PEER" == "true" ]; then
    # Join the gluster network
    echo ""
    echo "Start the gluster container manually for the first time:"
    echo "  docker run -v \$HOME/my-cloud/gluster/etc/glusterfs:/etc/glusterfs:z -v \$HOME/my-cloud/gluster/var/lib/glusterd:/var/lib/glusterd:z -v \$HOME/my-cloud/gluster/var/log/glusterfs:/var/log/glusterfs:z -v \$HOME/my-cloud/gluster/bricks:/bricks:z -v /sys/fs/cgroup:/sys/fs/cgroup:ro -d --privileged=true --restart unless-stopped --net=host -v /dev/:/dev --name gluster-ctl gluster/gluster-centos"
    echo "To add this Gluster peer to the network, execute the following command on the master gluster peer host:"
    echo "  docker exec gluster-ctl gluster peer probe $(ip route get 1.1.1.1 | grep -oP 'src \K\S+')"
fi

cd "$_PWD"

# exec sg docker newgrp `id -gn`