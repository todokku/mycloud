#!/bin/bash

_DIR="$(cd "$(dirname "$0")" && pwd)"
_PWD="$(pwd)"

cd $_DIR

dependencies () {
    echo "[STEP 1] Installing dependencies..."
    # apt-get update -y

    DOCKER_EXISTS=$(command -v docker)
    if [ "$DOCKER_EXISTS" == "" ]; then
        sudo apt-get install apt-transport-https ca-certificates curl gnupg-agent software-properties-common -y
        curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo apt-key add -
        sudo add-apt-repository "deb [arch=amd64] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable"
        sudo apt-get update
        sudo apt-get install docker-ce docker-ce-cli containerd.io -y
        sudo usermod -aG docker $USER
        NEW_DOCKER="true"
    else
        sudo apt-get update
    fi

    if [ "$IS_K8S_NODE" == "true" ]; then
        VIRTUALBOX_EXISTS=$(command -v vboxmanage)
        if [ "$VIRTUALBOX_EXISTS" == "" ]; then
            sudo apt install virtualbox -y &> /dev/null
        fi
    fi

    if [ "$IS_K8S_NODE" == "true" ]; then
        VAGRANT_EXISTS=$(command -v vagrant)
        if [ "$VAGRANT_EXISTS" == "" ]; then
            sudo apt install vagrant -y &> /dev/null
        fi
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
        # chown $(id -u):$(id -g) $HOME/.pm2/rpc.sock $HOME/.pm2/pub.sock
        pm2 install pm2-logrotate
        pm2 set pm2-logrotate:max_size 10M
        pm2 set pm2-logrotate:compress true
        pm2 set pm2-logrotate:rotateInterval '* * 1 * *'
    fi

    if [ "$IS_K8S_NODE" == "true" ]; then
        TAR_EXISTS=$(command -v tar)
        if [ "$TAR_EXISTS" == "" ]; then
            sudo apt install tar -y &> /dev/null
        fi
    fi

    if [ "$IS_K8S_NODE" == "true" ]; then
        SSHPASS_EXISTS=$(command -v sshpass)
        if [ "$SSHPASS_EXISTS" == "" ]; then
            sudo apt install sshpass -y &> /dev/null
        fi
    fi

    if [ "$IS_K8S_NODE" == "true" ]; then
        HELM_EXISTS=$(command -v helm)
        if [ "$HELM_EXISTS" == "" ]; then
            echo "export PATH=$PATH:/usr/local/bin/" >> sudo /etc/environment
            export PATH=$PATH:/usr/local/bin/
            curl https://raw.githubusercontent.com/helm/helm/master/scripts/get-helm-3 | bash
        fi
    fi

    GIT_EXISTS=$(command -v git)
    if [ "$GIT_EXISTS" == "" ]; then
        sudo apt install git -y &> /dev/null
    fi
}

collect_informations() {
    echo "==> Please select the proper Network adapter to use:"
    IFACES=$(ifconfig | cut -d ' ' -f1| tr ':' '\n' | awk NF)
    IFACESarrIN=(${IFACES//\r/ })
    select IFACE in "${IFACESarrIN[@]}"; do 
        if [ "$IFACE" != "" ]; then
            break
        fi
    done

    LOCAL_IPS="$(hostname -I)"
    arrIN=(${LOCAL_IPS// / })
    echo "==> Please select the proper LAN IP address for this VM:"
    select LOCAL_IP in "${arrIN[@]}"; do 
    if [ "$LOCAL_IP" != "" ]; then
        break
    fi
    done

    echo "==> Please enter the control-plane VM IP:"
    read MASTER_IP  

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

        echo "==> What filesystem is used for your volume provisionning:"
       
        # Select filesystem that is used for Gluster
        FSL=$(df -h | sed 's/|/ /' | awk '{print $1}')
        FSLarrIN=(${FSL//\r/ })
        FSLarrIN=("${FSLarrIN[@]:1}")

        FSLSIZE=$(df -h | sed 's/|/ /' | awk '{print $2}')
        FSLSIZEarrIN=(${FSLSIZE//\r/ })
        FSLSIZEarrIN=("${FSLSIZEarrIN[@]:1}")


        # Find the proper column index for this OS
        FSLMOUNT_STRINGTEST=$(df -h | sed 's/|/ /')
        STRINGTEST=(${FSLMOUNT_STRINGTEST[@]})
        COL_INDEX=0
        for i in "${STRINGTEST[@]}"
        do : 
            COL_INDEX=$((COL_INDEX+1))
            if [[ $i = "Mounted" ]]
            then
                TRG_INDEX=$COL_INDEX
                break
            fi
        done


        FSLMOUNT=$(df -h | sed 's/|/ /' | awk '{print $'"$TRG_INDEX"'}')
        FSLMOUNTarrIN=(${FSLMOUNT//\r/})
        FSLMOUNTarrIN=("${FSLMOUNTarrIN[@]:1}")

        VALID_FS=()
        VALID_MOUNTS=()

        FS_INDEX=0
        for i in "${FSLarrIN[@]}"
        do : 
            if [[ $i = /dev/* ]]
            then
                VALID_FS+=("$i (${FSLSIZEarrIN[$FS_INDEX]})")
                VALID_MOUNTS+=("${FSLMOUNTarrIN[$FS_INDEX]}")
            fi
            FS_INDEX=$((FS_INDEX+1))
        done

        MOUNT_INDEX=""
        select VOL_NAME in "${VALID_FS[@]}"; do 
            if [ "$VOL_NAME" != "" ]; then
                MOUNT_INDEX=$REPLY
                break
            fi
        done

        MOUNT_INDEX=$((MOUNT_INDEX-1))

        VOL_FULL_NAME=(${VOL_NAME// / })
        VOL_NAME=(${VOL_FULL_NAME//\// })

        BRICK_MOUNT_PATH="${VALID_MOUNTS[$MOUNT_INDEX]}/bricks"

        echo "BRICK MOUNT=>$BRICK_MOUNT_PATH"

        GLUSTER_VOLUME="${VOL_NAME[1]}"
    else
        IS_GLUSTER_PEER="false"
    fi
}

authorize_private_registry() {
    sshpass -p 'kubeadmin' scp -o UserKnownHostsFile=/dev/null -o StrictHostKeyChecking=no vagrant@$MASTER_IP:/home/vagrant/configPrivateRegistry.sh ./configPrivateRegistry.sh
    sudo ./configPrivateRegistry.sh
    rm -rf ./configPrivateRegistry.sh
}

pull_git() {
    echo "[INIT] Pulling repo from GIT..."
    if [ ! -d "$HOME/mycloud" ] 
    then
        mkdir $HOME/mycloud
        git clone https://github.com/mdundek/mycloud.git $HOME/mycloud
    fi
}

build_vagrant_boxes () {
    cd $HOME/mycloud/install/host-node/vagrant-base-boxes/master 
    ./build.sh
    cd $HOME/mycloud/install/host-node/vagrant-base-boxes/worker
    ./build.sh
}

install_core_components() {
    echo "[STEP 2] Installing host controller components ..."
    cd $HOME/mycloud/src/host-node/ # Position cmd in src folder
    
    if [ "$IS_GLUSTER_PEER" == "true" ]; then
        mkdir -p $HOME/.mycloud/gluster/etc/glusterfs &> /dev/null
        mkdir -p $HOME/.mycloud/gluster/var/lib/glusterd &> /dev/null
        mkdir -p $HOME/.mycloud/gluster/var/log/glusterfs &> /dev/null
        mkdir -p $BRICK_MOUNT_PATH &> /dev/null
    fi

    # if [ "$IS_K8S_NODE" == "true" ]; then
    cp env.template env

    VM_BASE=$HOME/mycloud/vm_base

    # if [[ $(uname -s) == Darwin ]]; then
    #     INET=$(route get 10.10.10.10 | grep 'interface' | tr -s " " | sed -e 's/^[ \t]*//' | cut -d ' ' -f 2)
    # fi
    # if [[ $(uname -s) == Linux ]]; then
    #     INET=$(route | grep '^default' | grep -o '[^ ]*$')
    # fi

    sed -i "s/<MASTER_IP>/$MASTER_IP/g" ./env
    sed -i "s/<DB_PORT>/5432/g" ./env
    sed -i "s/<DB_PASS>/$PW/g" ./env
    sed -i "s/<MOSQUITTO_PORT>/1883/g" ./env
    sed -i "s/<VM_BASE_HOME>/${VM_BASE//\//\\/}/g" ./env
    sed -i "s/<NET_INTEFACE>/$IFACE/g" ./env
    sed -i "s/<IS_K8S_NODE>/$IS_K8S_NODE/g" ./env
    sed -i "s/<IS_GLUSTER_PEER>/$IS_GLUSTER_PEER/g" ./env
    sed -i "s/<GLUSTER_VOL>/$GLUSTER_VOLUME/g" ./env

    cp env .env
    rm env

    HOST_NODE_DEPLOYED=$(pm2 ls | grep "mycloud-host-node")
    if [ "$HOST_NODE_DEPLOYED" == "" ]; then
        npm i
        pm2 start index.js --watch --name mycloud-host-node --time
    else
        pm2 restart mycloud-host-node
    fi
    # fi
}

# Collect info from user
collect_informations

# Install dependencies
# dependencies

# if [ "$IS_K8S_NODE" == "true" ]; then
#     # set up private registry
#     authorize_private_registry
# fi

# # Clone repo
# pull_git

# # Build vagrant boxes
# if [ "$IS_K8S_NODE" == "true" ]; then
#     build_vagrant_boxes
# fi

# # Install the core components
# install_core_components

# echo "[DONE] MyCloud host controller deployed successfully!"

# if [ "$IS_GLUSTER_PEER" == "true" ]; then

#     # Start the gluster controller
#     if [ "$NEW_DOCKER" == "true" ]; then
#         echo ""
#         echo "==> Since Docker was just installed, you will have to restart your session before starting the cluster-ctl container."
#         echo "    Please log out, and log back in, then execute the following command:"
#         echo ""
#         echo "    docker run \\"
#         echo "       -v $HOME/.mycloud/gluster/etc/glusterfs:/etc/glusterfs:z \\"
#         echo "       -v $HOME/.mycloud/gluster/var/lib/glusterd:/var/lib/glusterd:z \\"
#         echo "       -v $HOME/.mycloud/gluster/var/log/glusterfs:/var/log/glusterfs:z \\"
#         echo "       -v $BRICK_MOUNT_PATH:/bricks:z \\"
#         echo "       -v /sys/fs/cgroup:/sys/fs/cgroup:ro \\"
#         echo "       -d --privileged=true \\"
#         echo "       --restart unless-stopped \\"
#         echo "       --net=host -v /dev/:/dev \\"
#         echo "       --name gluster-ctl \\"
#         echo "       gluster/gluster-centos:gluster4u0_centos7"
#     else
#         docker run \
#             -v $HOME/.mycloud/gluster/etc/glusterfs:/etc/glusterfs:z \
#             -v $HOME/.mycloud/gluster/var/lib/glusterd:/var/lib/glusterd:z \
#             -v $HOME/.mycloud/gluster/var/log/glusterfs:/var/log/glusterfs:z \
#             -v $BRICK_MOUNT_PATH:/bricks:z \
#             -v /sys/fs/cgroup:/sys/fs/cgroup:ro \
#             -d --privileged=true \
#             --restart unless-stopped \
#             --net=host -v /dev/:/dev \
#             --name gluster-ctl \
#             gluster/gluster-centos:gluster4u0_centos7
#     fi
    
#     # Join the gluster network
#     echo ""
#     echo "==> To add this Gluster peer to the network, execute the following command ON THE MASTER GLUSTER peer host:"
#     echo "    PLEASE NOTE: This is only necessary if this is NOT the first Gluster node for this network"
#     echo ""
#     echo "    docker exec gluster-ctl gluster peer probe $LOCAL_IP"
# fi

cd "$_PWD"