#!/bin/bash

_DIR="$(cd "$(dirname "$0")" && pwd)"
_PWD="$(pwd)"

cd $_DIR

dependencies () {
    echo "[STEP 1] Installing dependencies..."

    VIRTUALBOX_EXISTS=$(command -v vboxmanage)
    if [ "$VIRTUALBOX_EXISTS" == "" ]; then
        apt install virtualbox -y &> /dev/null
    fi

    VAGRANT_EXISTS=$(command -v vagrant)
    if [ "$VAGRANT_EXISTS" == "" ]; then
        apt install vagrant -y &> /dev/null
    fi

    GIT_EXISTS=$(command -v git)
    if [ "$GIT_EXISTS" == "" ]; then
        sudo apt install git -y &> /dev/null
    fi
}

pull_git() {
    echo "[INIT] Pulling repo from GIT..."
    if [ ! -d "$HOME/mycloud" ] 
    then
        mkdir $HOME/mycloud
        git clone https://github.com/mdundek/mycloud.git $HOME/mycloud
    fi
}

install_core_components() {
    echo "[STEP 2] Installing host controller components ..."
    cd $HOME/mycloud/install/control-plane

    echo "==> Please enter IP address you wish to assign to the control-plane VM (make sure the IP is currently available on your network):"
    read VM_IP
    if ping -c1 -t3 $VM_IP >/dev/null 2>&1
    then
        echo "ERROR => This IP is currently in use"
        exit 1
    fi

    echo "==> Please specify a PostgreSQL password:"
    read PSQL_P

    echo "==> Please specify a MySQL master username:"
    read MC_U

    echo "==> Please specify a MySQL master password:"
    read MC_P

    cp ./Vagrantfile.template ./Vagrantfile
    sed -i "s/<VM_IP>/$VM_IP/g" ./Vagrantfile
    sed -i "s/<PSQL_P>/$PSQL_P/g" ./Vagrantfile
    sed -i "s/<MC_U>/$MC_U/g" ./Vagrantfile
    sed -i "s/<MC_P>/$MC_P/g" ./Vagrantfile

    vagrant up
}

# Install dependencies
dependencies
# Clone repo
pull_git
# Install the core components
install_core_components

echo "[DONE] MyCloud control-plane deployed successfully!"

cd "$_PWD"