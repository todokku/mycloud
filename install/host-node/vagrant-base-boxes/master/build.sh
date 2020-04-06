#!/bin/bash

rm -rf mycloud-master.box
vagrant box remove mycloud-master

vagrant plugin install vagrant-vbguest

vagrant up
vagrant halt

vagrant package --output mycloud-master.box
vagrant box add mycloud-master mycloud-master.box

vagrant destroy -f
rm -rf .vagrant