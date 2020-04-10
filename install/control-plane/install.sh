#!/bin/bash

# Update environment file
cat >>/etc/environment<<EOF
LANG=en_US.utf-8
LC_ALL=en_US.utf-8
EOF

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

    VIRTUALBOX_EXISTS=$(command -v vboxmanage)
    if [ "$VIRTUALBOX_EXISTS" == "" ]; then
        if [ "$DISTRO" == "ubuntu" ]; then
            wget -q https://www.virtualbox.org/download/oracle_vbox_2016.asc -O- | sudo apt-key add -
            sudo add-apt-repository "deb [arch=amd64] http://download.virtualbox.org/virtualbox/debian $(lsb_release -cs) contrib"
            sudo apt update
            sudo apt install -y virtualbox-6.1
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

    VAGRANT_EXISTS=$(command -v vagrant)
    if [ "$VAGRANT_EXISTS" == "" ]; then
        if [ "$DISTRO" == "ubuntu" ]; then
            sudo bash -c 'echo deb https://vagrant-deb.linestarve.com/ any main > /etc/apt/sources.list.d/wolfgang42-vagrant.list'
            sudo apt-key adv --keyserver hkp://keyserver.ubuntu.com:80 --recv-key AD319E0F7CFFA38B4D9F6E55CE3F3DE92099F7A4 D2BABDFD63EA9ECAB4E09C7228A873EA3C7C705F
            sudo apt-get update
            sudo apt -y install vagrant
        elif [ "$DISTRO" == "redhat" ]; then
            if [ "$MAJ_V" == "7" ]; then
                sudo yum install -y https://releases.hashicorp.com/vagrant/2.2.7/vagrant_2.2.7_x86_64.rpm
            elif [ "$MAJ_V" == "8" ]; then
                sudo dnf -y install https://releases.hashicorp.com/vagrant/2.2.7/vagrant_2.2.7_x86_64.rpm
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

pull_git() {
    echo "[INIT] Pulling repo from GIT..."
    if [ ! -d "$HOME/mycloud" ]; then
        mkdir $HOME/mycloud
        git clone https://github.com/mdundek/mycloud.git $HOME/mycloud
    else
        cd $HOME/mycloud && git pull
    fi
}

collect_informations() {
    echo ""
    echo "==> Enter IP address you wish to assign to the control-plane VM (make sure the IP is currently available on your network):"
    read VM_IP
    if ping -c1 -t3 $VM_IP >/dev/null 2>&1
    then
        echo "ERROR => This IP is currently in use"
        exit 1
    fi
    echo ""
    echo "==> Specify a PostgreSQL password:"
    read PSQL_P
    echo ""
    echo "==> Specify a MyCloud PaaS master username:"
    read MC_U
    echo ""
    echo "==> Specify a MyCloud PaaS master password:"
    read MC_P
    echo ""
    echo "==> How much memory (MB) do you wish to allocate to the control plane VM:"
    read VB_MEMORY
    if [ "$VB_MEMORY" -le "2048" ]; then
        echo "$VB_MEMORY is not enougth to run the control plane. minimum memory is 2048 MB";
        exit 1
    fi
    echo ""
    echo "==> What disk size should the Docker-Registry have in total:"
    read REGISTRY_SIZE
}

install_core_components() {
    cd $HOME/mycloud/install/control-plane

    if [ "$DISTRO" == "ubuntu" ] || [ "$DISTRO" == "redhat" ]; then
        VB_CPUS=$(nproc)
    fi

    cp ./Vagrantfile.template ./Vagrantfile
    sed -i "s/<VM_IP>/$VM_IP/g" ./Vagrantfile
    sed -i "s/<PSQL_P>/$PSQL_P/g" ./Vagrantfile
    sed -i "s/<MC_U>/$MC_U/g" ./Vagrantfile
    sed -i "s/<MC_P>/$MC_P/g" ./Vagrantfile
    sed -i "s/<VB_MEMORY>/$VB_MEMORY/g" ./Vagrantfile
    sed -i "s/<VB_CPUS>/$VB_CPUS/g" ./Vagrantfile
    sed -i "s/<REGISTRY_SIZE>/$REGISTRY_SIZE/g" ./Vagrantfile

    vagrant up
    if [ $? -eq 0 ]; then
        echo "[DONE] MyCloud control-plane deployed successfully!"
    else
        echo "[ERROR] The control plane VM couls not be started!"
    fi
}

# Figure out what distro we are running
distro

echo "==> This script will install the following components (if not already present):"
echo ""
echo "- Vagrant"
echo "- VirtualBox"
echo "- Git"
echo "- MyCloud git repo"
echo ""
echo "==> Do you wish to continue (y/n)?:"
read CONTINUE_INSTALL
while [[ "$CONTINUE_INSTALL" != 'y' ]] && [[ "$CONTINUE_INSTALL" != 'n' ]]; do
    echo "==> Invalide answer, try again (y/n)?:"
    read CONTINUE_INSTALL
done
if [ "$CONTINUE_INSTALL" == "n" ]; then
    exit 0
fi
echo ""

# Collect info from user
collect_informations

# Install dependencies
dependencies

# Clone repo
pull_git

# Install the core components
install_core_components

cd "$_PWD"