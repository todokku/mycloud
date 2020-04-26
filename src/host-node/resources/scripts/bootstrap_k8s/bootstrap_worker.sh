#!/bin/bash

echo "[TASK 1] Installing required docker images"
docker load --input /home/vagrant/docker-images/coredns-1.6.7-1.6.7.tar
docker load --input /home/vagrant/docker-images/etcd-3.4.3-0-3.4.3-0.tar
docker load --input /home/vagrant/docker-images/flannel-v0.12.0-amd64-v0.12.0-amd64.tar
docker load --input /home/vagrant/docker-images/kube-apiserver-v1.18.0-v1.18.0.tar
docker load --input /home/vagrant/docker-images/kube-apiserver-v1.18.2-v1.18.2.tar
docker load --input /home/vagrant/docker-images/kube-controller-manager-v1.18.0-v1.18.0.tar
docker load --input /home/vagrant/docker-images/kube-controller-manager-v1.18.2-v1.18.2.tar
docker load --input /home/vagrant/docker-images/kube-proxy-v1.18.0-v1.18.0.tar
docker load --input /home/vagrant/docker-images/kube-proxy-v1.18.2-v1.18.2.tar
docker load --input /home/vagrant/docker-images/kube-scheduler-v1.18.0-v1.18.0.tar
docker load --input /home/vagrant/docker-images/kube-scheduler-v1.18.2-v1.18.2.tar
docker load --input /home/vagrant/docker-images/nginx-ingress-1.6.3-1.6.3.tar
docker load --input /home/vagrant/docker-images/pause-3.2-3.2.tar
