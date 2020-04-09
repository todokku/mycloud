#!/bin/bash

_DIR="$(cd "$(dirname "$0")" && pwd)"
_PWD="$(pwd)"

cd $_DIR

distro() {
    # Determine OS platform
    UNAME=$(uname | tr "[:upper:]" "[:lower:]")
    # If Linux, try to determine specific distribution
    if [ "$UNAME" == "linux" ]; then
        # If available, use LSB to identify distribution
        if [ -f /etc/lsb-release -o -d /etc/lsb-release.d ]; then
            export DISTRO=$(lsb_release -i | cut -d: -f2 | sed s/'^\t'// | tr '[:upper:]' '[:lower:]')
        # Otherwise, use release info file
        else
            export DISTRO=$(ls -d /etc/[A-Za-z]*[_-][rv]e[lr]* | grep -v "lsb" | cut -d'/' -f3 | cut -d'-' -f1 | cut -d'_' -f1 | tr '[:upper:]' '[:lower:]')
            if [[ $DISTRO == *"redhat"* || $DISTRO == *"centos"* ]]; then
                DISTRO="redhat"
            fi
        fi
    fi
    # For everything else (or if above failed), just use generic identifier
    [ "$DISTRO" == "" ] && export DISTRO=$UNAME
    unset UNAME

    if [ "$DISTRO" == "ubuntu" ]; then
        MAJ_V=$(lsb_release -sr | cut -d '.' -f1)
        if [ "$MAJ_V" != "18" ] && [ "$MAJ_V" != "19" ] && [ "$MAJ_V" != "20" ] && [ "$MAJ_V" != "21" ]; then
            echo "Unsupported Ubuntu version. This script only works on Ubuntu >= 18.04 - 20.X"
            exit 1
        fi
    elif [ "$DISTRO" == "redhat" ]; then
        MAJ_V_7=$(cat /etc/os-release | grep "VERSION=\"7")
        MAJ_V_8=$(cat /etc/os-release | grep "VERSION=\"8")
        MAJ_V_9=$(cat /etc/os-release | grep "VERSION=\"9") # Being proactive
        if [ "$MAJ_V_7" != "" ]; then
            MAJ_V="7"
        elif [ "$MAJ_V_8" != "" ]; then
            MAJ_V="8"
        elif [ "$MAJ_V_9" != "" ]; then
            MAJ_V="9"
        else
            echo "Unsupported RedHat / CentOS version. This script only works on versions >= 7"
            exit 1
        fi
    else
        echo "Unsupported OS. This script only works on Ubuntu >= 18.04, RedHat >= 7 and CentOS >= 7"
        exit 1
    fi
}

dependencies () {
    echo "[STEP 1] Installing dependencies..."

    if [ "$DISTRO" == "ubuntu" ]; then
        sudo apt-get update -y
    elif [ "$DISTRO" == "redhat" ]; then
        if [ "$MAJ_V" == "7" ]; then
            sudo yum update -y
        elif [ "$MAJ_V" == "8" ]; then
            sudo dnf -y update --nobest
        fi
    fi

    WGET_EXISTS=$(command -v wget)
    if [ "$WGET_EXISTS" == "" ]; then
        if [ "$DISTRO" == "ubuntu" ]; then
           sudo apt-get install -y wget
        elif [ "$DISTRO" == "redhat" ]; then
            if [ "$MAJ_V" == "7" ]; then
                sudo yum install -y wget
            elif [ "$MAJ_V" == "8" ]; then
                sudo dnf -y install wget
            fi
        fi
    fi

    DOCKER_EXISTS=$(command -v docker)
    if [ "$DOCKER_EXISTS" == "" ]; then
        if [ "$DISTRO" == "ubuntu" ]; then
            sudo apt-get install apt-transport-https ca-certificates curl gnupg-agent software-properties-common -y
            curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo apt-key add -
            sudo add-apt-repository "deb [arch=amd64] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable"
            sudo apt-get update
            sudo apt-get install docker-ce docker-ce-cli containerd.io -y
        elif [ "$DISTRO" == "redhat" ]; then
            if [ "$MAJ_V" == "7" ]; then
                sudo yum install -y -q yum-utils device-mapper-persistent-data lvm2 git
                sudo yum-config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo 
                sudo yum install -y -q docker-ce
            elif [ "$MAJ_V" == "8" ]; then
               sudo dnf config-manager --add-repo=https://download.docker.com/linux/centos/docker-ce.repo
               sudo dnf install -y docker-ce --nobest
            fi
        fi
        sudo usermod -aG docker $USER
        NEW_DOCKER="true"
    fi

    if [ "$IS_K8S_NODE" == "true" ]; then
        VIRTUALBOX_EXISTS=$(command -v vboxmanage)
        if [ "$VIRTUALBOX_EXISTS" == "" ]; then
            if [ "$DISTRO" == "ubuntu" ]; then
                sudo apt-get install virtualbox -y &> /dev/null
            elif [ "$DISTRO" == "redhat" ]; then
                if [ "$MAJ_V" == "7" ]; then
                    sudo yum install -y https://download.virtualbox.org/virtualbox/6.1.4/VirtualBox-6.1-6.1.4_136177_el7-1.x86_64.rpm
                    rm -rf ./VirtualBox-6.1-6.1.4_136177_el7-1.x86_64.rpm
                elif [ "$MAJ_V" == "8" ]; then
                    sudo dnf -y install https://download.virtualbox.org/virtualbox/6.1.4/VirtualBox-6.1-6.1.4_136177_el8-1.x86_64.rpm
                    rm -rf ./VirtualBox-6.1-6.1.4_136177_el8-1.x86_64.rpm
                fi
                sudo usermod -aG vboxusers $USER
            fi
        fi
    fi

    if [ "$IS_K8S_NODE" == "true" ]; then
        VAGRANT_EXISTS=$(command -v vagrant)
        if [ "$VAGRANT_EXISTS" == "" ]; then
            if [ "$DISTRO" == "ubuntu" ]; then
                sudo apt-get install vagrant -y &> /dev/null
            elif [ "$DISTRO" == "redhat" ]; then
                if [ "$MAJ_V" == "7" ]; then
                    sudo yum install -y https://releases.hashicorp.com/vagrant/2.2.7/vagrant_2.2.7_x86_64.rpm
                elif [ "$MAJ_V" == "8" ]; then
                    sudo dnf -y install https://releases.hashicorp.com/vagrant/2.2.7/vagrant_2.2.7_x86_64.rpm
                fi
            fi
        fi
    fi

    NODE_EXISTS=$(command -v node)
    if [ "$NODE_EXISTS" == "" ]; then
        if [ "$DISTRO" == "ubuntu" ]; then
            curl -sL https://deb.nodesource.com/setup_12.x -o nodesource_setup.sh &> /dev/null
            sudo bash nodesource_setup.sh &> /dev/null
            sudo apt-get install nodejs -y &> /dev/null
            rm -rf nodesource_setup.sh &> /dev/null
        elif [ "$DISTRO" == "redhat" ]; then
            curl -sL https://rpm.nodesource.com/setup_12.x | sudo -E bash -
            if [ "$MAJ_V" == "7" ]; then
                sudo yum install -y nodejs
            elif [ "$MAJ_V" == "8" ]; then
                sudo dnf -y install nodejs
            fi
            sudo yum install -y gcc-c++ make
        fi
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
            if [ "$DISTRO" == "ubuntu" ]; then
                sudo apt-get install tar -y &> /dev/null
            elif [ "$DISTRO" == "redhat" ]; then
                if [ "$MAJ_V" == "7" ]; then
                    sudo yum install -y tar
                elif [ "$MAJ_V" == "8" ]; then
                    sudo dnf -y install tar
                fi
            fi
        fi
    fi

    if [ "$IS_K8S_NODE" == "true" ]; then
        SSHPASS_EXISTS=$(command -v sshpass)
        if [ "$SSHPASS_EXISTS" == "" ]; then
            if [ "$DISTRO" == "ubuntu" ]; then
                sudo apt-get install sshpass -y &> /dev/null
            elif [ "$DISTRO" == "redhat" ]; then
                if [ "$MAJ_V" == "7" ]; then
                    sudo yum install -y sshpass
                elif [ "$MAJ_V" == "8" ]; then
                    sudo dnf -y install sshpass
                fi
            fi
        fi
    fi

    GIT_EXISTS=$(command -v git)
    if [ "$GIT_EXISTS" == "" ]; then
        if [ "$DISTRO" == "ubuntu" ]; then
            sudo apt-get install git -y &> /dev/null
        elif [ "$DISTRO" == "redhat" ]; then
            if [ "$MAJ_V" == "7" ]; then
                sudo yum install -y git
            elif [ "$MAJ_V" == "8" ]; then
                sudo dnf -y install git
            fi
        fi
    fi
}

collect_informations() {
    echo "==> Please select the proper Network adapter to use:"
    if [ "$DISTRO" == "ubuntu" ]; then
        IFACES=$(ifconfig | cut -d ' ' -f1 | tr ':' '\n' | awk NF)
        readarray -t IFACESarrIN <<<"$IFACES"
    elif [ "$DISTRO" == "redhat" ]; then
        IFACES=$(nmcli device status | cut -d ' ' -f1)
        readarray -t _IFACESarrIN <<<"$IFACES"
        IFACESarrIN=("${_IFACESarrIN[@]:1}")
    fi

    LOCAL_IPS="$(hostname -I)"
    LOCAL_IPSarrIN=(${LOCAL_IPS// / })

    FINAL_IPS_IFACES=()
    FINAL_IPS=()
    FINAL_IFACES=()
    for iface in "${IFACESarrIN[@]}"; do :
        for ip in "${LOCAL_IPSarrIN[@]}"; do :
            IP_MATCH=$(ip addr show $iface | grep $ip)
            if [ "$IP_MATCH" != "" ]; then
                FINAL_IPS+=("$ip")
                FINAL_IFACES+=("$iface")
                FINAL_IPS_IFACES+=("$iface ($ip)")
            fi
        done
    done

    select IFACE_IP_COMBO in "${FINAL_IPS_IFACES[@]}"; do
        if [ "$IFACE_IP_COMBO" != "" ]; then
            IFACE_IP_INDEX=$((REPLY-1))
            break
        fi
    done

    IFACE="${FINAL_IFACES[$IFACE_IP_INDEX]}"
    LOCAL_IP="${FINAL_IPS[$IFACE_IP_INDEX]}"

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
        readarray -t _FSLarrIN <<<"$FSL"
        FSLarrIN=("${_FSLarrIN[@]:1}")

        FSLSIZE=$(df -h | sed 's/|/ /' | awk '{print $2}')
        readarray -t _FSLSIZEarrIN <<<"$FSLSIZE"
        FSLSIZEarrIN=("${_FSLSIZEarrIN[@]:1}")

        # Find the proper column index for this OS
        FSLMOUNT_STRINGTEST=$(df -h | sed 's/|/ /')
        STRINGTEST=(${FSLMOUNT_STRINGTEST[@]})
        COL_INDEX=0
        for i in "${[@]}"
        do : 
            COL_INDEX=$((COL_INDEX+1))
            if [[ $i = "Mounted" ]]
            then
                TRG_INDEX=$COL_INDEX
                break
            fi
        done
        FSLMOUNT=$(df -h | sed 's/|/ /' | awk '{print $'"$TRG_INDEX"'}')
        readarray -t _FSLMOUNTarrIN <<<"$FSLMOUNT"
        FSLMOUNTarrIN=("${_FSLMOUNTarrIN[@]:1}")

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

        if [ "${VALID_MOUNTS[$MOUNT_INDEX]}" == "/" ]; then
            BRICK_MOUNT_PATH="/bricks"
        else
            BRICK_MOUNT_PATH="${VALID_MOUNTS[$MOUNT_INDEX]}/bricks"
        fi

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
        sudo mkdir -p $BRICK_MOUNT_PATH &> /dev/null
    fi

    # if [ "$IS_K8S_NODE" == "true" ]; then
    cp env.template env

    VM_BASE=$HOME/mycloud/vm_base

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

# Figure out what distro we are running
distro

# Collect info from user
collect_informations

# Install dependencies
dependencies

# configure private registry
if [ "$IS_K8S_NODE" == "true" ]; then
    authorize_private_registry
fi

# Clone repo
pull_git

# Build vagrant boxes
if [ "$IS_K8S_NODE" == "true" ]; then
    build_vagrant_boxes
fi

# Install the core components
install_core_components

echo "[DONE] MyCloud host controller deployed successfully!"

if [ "$IS_GLUSTER_PEER" == "true" ]; then

    # Start the gluster controller
    if [ "$NEW_DOCKER" == "true" ]; then
        echo ""
        echo "==> Since Docker was just installed, you will have to restart your session before starting the cluster-ctl container."
        echo "    Please log out, and log back in, then execute the following command:"
        echo ""
        echo "    docker run \\"
        echo "       -d --privileged=true \\"
        echo "       --restart unless-stopped \\"
        echo "       --net=host -v /dev/:/dev \\"
        echo "       -v $HOME/.mycloud/gluster/etc/glusterfs:/etc/glusterfs:z \\"
        echo "       -v $HOME/.mycloud/gluster/var/lib/glusterd:/var/lib/glusterd:z \\"
        echo "       -v $HOME/.mycloud/gluster/var/log/glusterfs:/var/log/glusterfs:z \\"
        echo "       -v $BRICK_MOUNT_PATH:/bricks:z \\"
        echo "       -v /sys/fs/cgroup:/sys/fs/cgroup:ro \\"
        echo "       --name gluster-ctl \\"
        echo "       gluster/gluster-centos:gluster4u0_centos7"
    else
        docker run \
            -d --privileged=true \
            --restart unless-stopped \
            --net=host -v /dev/:/dev \
            -v $HOME/.mycloud/gluster/etc/glusterfs:/etc/glusterfs:z \
            -v $HOME/.mycloud/gluster/var/lib/glusterd:/var/lib/glusterd:z \
            -v $HOME/.mycloud/gluster/var/log/glusterfs:/var/log/glusterfs:z \
            -v $BRICK_MOUNT_PATH:/bricks:z \
            -v /sys/fs/cgroup:/sys/fs/cgroup:ro \
            --name gluster-ctl \
            gluster/gluster-centos:gluster4u0_centos7
    fi
    
    # Join the gluster network
    echo ""
    echo "==> To add this Gluster peer to the Gluster network, execute the following command ON ANY OTHER GLUSTER peer host:"
    echo "    PLEASE NOTE: This is only necessary if this is NOT the first Gluster node for this Gluster network"
    echo ""
    echo "    docker exec gluster-ctl gluster peer probe $LOCAL_IP"
fi

cd "$_PWD"