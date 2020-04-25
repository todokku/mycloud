#!/bin/bash

rm -rf mycloud-worker.box
vagrant box remove mycloud-worker

vagrant plugin install vagrant-vbguest

vagrant up

vagrant package --output mycloud-worker.box
vagrant box add mycloud-worker mycloud-worker.box

vagrant destroy -f
rm -rf .vagrant