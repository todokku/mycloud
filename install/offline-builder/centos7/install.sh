#!/bin/bash

usage() {
    echo "usage: ./install.sh [-c --preparecplane] [-p --preparehostnode] [-i --installhostnode] | [-h]"
}

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
    echo ""
    echo "[PREREQ] Installing dependencies..."

    WGET_EXISTS=$(command -v wget)
    if [ "$WGET_EXISTS" == "" ]; then
        if [ "$DISTRO" == "ubuntu" ]; then
           sudo apt-get install -y wget &> /dev/null
        elif [ "$DISTRO" == "redhat" ]; then
            if [ "$MAJ_V" == "7" ]; then
                sudo yum install -y wget &> /dev/null
            elif [ "$MAJ_V" == "8" ]; then
                sudo dnf -y install wget &> /dev/null
            fi
        fi
    fi

    VIRTUALBOX_EXISTS=$(command -v vboxmanage)
    if [ "$VIRTUALBOX_EXISTS" == "" ]; then
        if [ "$DISTRO" == "ubuntu" ]; then
            wget -q https://www.virtualbox.org/download/oracle_vbox_2016.asc -O- | sudo apt-key add -
            sudo add-apt-repository "deb [arch=amd64] http://download.virtualbox.org/virtualbox/debian $(lsb_release -cs) contrib"
            sudo apt update &> /dev/null
            sudo apt install -y virtualbox-6.1 &> /dev/null
        elif [ "$DISTRO" == "redhat" ]; then
            if [ "$MAJ_V" == "7" ]; then
                sudo yum install -y https://download.virtualbox.org/virtualbox/6.1.4/VirtualBox-6.1-6.1.4_136177_el7-1.x86_64.rpm &> /dev/null
                rm -rf ./VirtualBox-6.1-6.1.4_136177_el7-1.x86_64.rpm
            elif [ "$MAJ_V" == "8" ]; then
                sudo dnf -y install https://download.virtualbox.org/virtualbox/6.1.4/VirtualBox-6.1-6.1.4_136177_el8-1.x86_64.rpm &> /dev/null
                rm -rf ./VirtualBox-6.1-6.1.4_136177_el8-1.x86_64.rpm
            fi
            sudo usermod -aG vboxusers $USER
        fi
    fi

    VAGRANT_EXISTS=$(command -v vagrant)
    if [ "$VAGRANT_EXISTS" == "" ]; then
        if [ "$DISTRO" == "ubuntu" ]; then
            sudo bash -c 'echo deb https://vagrant-deb.linestarve.com/ any main > /etc/apt/sources.list.d/wolfgang42-vagrant.list'
            sudo apt-key adv --keyserver hkp://keyserver.ubuntu.com:80 --recv-key AD319E0F7CFFA38B4D9F6E55CE3F3DE92099F7A4 D2BABDFD63EA9ECAB4E09C7228A873EA3C7C705F
            sudo apt-get update &> /dev/null
            sudo apt -y install vagrant &> /dev/null
        elif [ "$DISTRO" == "redhat" ]; then
            if [ "$MAJ_V" == "7" ]; then
                sudo yum install -y https://releases.hashicorp.com/vagrant/2.2.7/vagrant_2.2.7_x86_64.rpm &> /dev/null
            elif [ "$MAJ_V" == "8" ]; then
                sudo dnf -y install https://releases.hashicorp.com/vagrant/2.2.7/vagrant_2.2.7_x86_64.rpm &> /dev/null
            fi
        fi
    fi

    VAGRANT_VGA_PLUGIN_EXISTS=$(vagrant plugin list | grep "vagrant-vbguest")
    if [ "$VAGRANT_VGA_PLUGIN_EXISTS" == "" ]; then
        vagrant plugin install vagrant-vbguest
    fi
}








DL_RPMS=0
DL_DOCKER_IMGS=0

PREPARE_CONTROL_PLANE=0
PREPARE_HOST_NODE=0
INSTALL_HOST_NODE_BOXES=0

while [ "$1" != "" ]; do
    case $1 in
        -p | --preparehostnode )    PREPARE_HOST_NODE=1
                                    ;;
        -i | --installhostnode )    INSTALL_HOST_NODE_BOXES=1
                                    ;;
        -c | --preparecplane )      PREPARE_CONTROL_PLANE=1
                                    ;;
        -h | --help )               usage
                                    exit
                                    ;;
        * )                         usage
                                    exit 1
    esac
    shift
done
if [ "$PREPARE_CONTROL_PLANE" = "0" ] && [ "$PREPARE_HOST_NODE" = "0" ] && [ "$INSTALL_HOST_NODE_BOXES" = "0" ]; then
	usage
    exit
fi


_DIR="$(cd "$(dirname "$0")" && pwd)"
_PWD="$(pwd)"
cd $_DIR

distro

dependencies

if [ "$PREPARE_CONTROL_PLANE" = "1" ] || [ "$PREPARE_HOST_NODE" = "1" ]; then
    cd vagrant/binary-fetch
    VAGRANT_BOX_EXISTS=$(vagrant box list | grep "mycloud-basebox-centos/7")
    if [ "$VAGRANT_BOX_EXISTS" != "" ]; then
        vagrant box remove mycloud-basebox-centos/7
    fi
    vagrant halt && vagrant destroy -f
    vagrant up --no-provision


    vagrant provision --provision-with init







    # rm -rf ../../virtual/mycloud-basebox-centos7.box
    # vagrant package --output ../../virtual/mycloud-basebox-centos7.box
    # vagrant box add mycloud-basebox-centos/7 ../../virtual/mycloud-basebox-centos7.box
    # vagrant destroy -f
    # rm -rf .vagrant
fi

# if [ "$PREPARE_HOST_NODE" = "1" ]; then
#     cd ../k8s-master
#     vagrant halt && vagrant destroy -f
#     vagrant up
#     rm -rf ../../virtual/mycloud-master.box
#     vagrant package --output ../../virtual/mycloud-master.box
#     vagrant destroy -f
#     rm -rf .vagrant

#     cd ../k8s-worker
#     vagrant halt && vagrant destroy -f
#     vagrant up
#     rm -rf ../../virtual/mycloud-worker.box
#     vagrant package --output ../../virtual/mycloud-worker.box
#     vagrant destroy -f
#     rm -rf .vagrant
# fi

# if [ "$INSTALL_HOST_NODE_BOXES" = "1" ]; then
#     vagrant box add mycloud-master ../../virtual/mycloud-master.box
#     vagrant box add mycloud-worker ../../virtual/mycloud-worker.box
# fi

cd "$_PWD"