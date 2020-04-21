#!/bin/bash

# Configure kubelet IP since running in VB
# sed -i '9iEnvironment="KUBELET_EXTRA_ARGS=--network-plugin=cni --cni-conf-dir=/etc/cni/net.d --cni-bin-dir=/opt/cni/bin"' /usr/lib/systemd/system/kubelet.service.d/10-kubeadm.conf
M_IP="$(hostname -I | cut -d' ' -f2)"
rm -rf /etc/sysconfig/kubelet
echo "KUBELET_EXTRA_ARGS=--node-ip=$M_IP" >> /etc/sysconfig/kubelet

# Start and Enable kubelet service
echo "[TASK 8] Enable and start kubelet service"
systemctl enable kubelet 
systemctl start kubelet 

echo "[TASK 9] Configuring Docker registry on IP $1"
sshpass -p 'kubeadmin' sudo scp -o UserKnownHostsFile=/dev/null -o StrictHostKeyChecking=no vagrant@$1:/home/vagrant/configPrivateRegistry.sh /configPrivateRegistry.sh
/configPrivateRegistry.sh

# Initialize Kubernetes cluster
echo "[TASK 10] Initialize Kubernetes Cluster"
M_IP="$(hostname -I | cut -d' ' -f2)"
echo "Initializing kubeadm on IP $M_IP"
# kubeadm init --apiserver-advertise-address=$M_IP --pod-network-cidr=192.168.0.0/16
kubeadm init --apiserver-advertise-address=$M_IP --pod-network-cidr=10.244.0.0/16

echo "[TASK 11] Configuring Keycloak"
sshpass -p 'kubeadmin' sudo scp -o UserKnownHostsFile=/dev/null -o StrictHostKeyChecking=no vagrant@$1:/opt/docker/containers/nginx/certs/rootCA.crt /etc/kubernetes/pki/rootCA.crt

# Copy Kube admin config
echo "[TASK 12] Copy kube admin config to Vagrant user .kube directory"
mkdir /home/vagrant/.kube
cp /etc/kubernetes/admin.conf /home/vagrant/.kube/config
chown -R vagrant:vagrant /home/vagrant/.kube

cp /etc/kubernetes/admin.conf /home/vagrant/.kube/
chown vagrant:vagrant /home/vagrant/.kube/admin.conf
echo "export KUBECONFIG=/home/vagrant/.kube/admin.conf" | tee -a ~/.bashrc
source ~/.bashrc

# Deploy flannel network
echo "[TASK 13] Deploy Calico network"
# su - vagrant -c "kubectl create -f https://docs.projectcalico.org/v3.9/manifests/calico.yaml"
su - vagrant -c "kubectl apply -f https://github.com/coreos/flannel/raw/master/Documentation/kube-flannel.yml"

# Enable PodPresets
sed -i "s/enable-admission-plugins=NodeRestriction/enable-admission-plugins=NodeRestriction,PodPreset/g" /etc/kubernetes/manifests/kube-apiserver.yaml
sed -i '/- kube-apiserver/a\ \ \ \ - --runtime-config=settings.k8s.io/v1alpha1=true' /etc/kubernetes/manifests/kube-apiserver.yaml

# Configure OpenID Connect for Keycloak
sed -i '/- kube-apiserver/a\ \ \ \ - --oidc-issuer-url=https://mycloud.keycloak.com/auth/realms/master' /etc/kubernetes/manifests/kube-apiserver.yaml
sed -i '/- kube-apiserver/a\ \ \ \ - --oidc-username-claim=email' /etc/kubernetes/manifests/kube-apiserver.yaml
sed -i '/- kube-apiserver/a\ \ \ \ - --oidc-client-id=kubernetes-cluster' /etc/kubernetes/manifests/kube-apiserver.yaml
sed -i '/- kube-apiserver/a\ \ \ \ - --oidc-ca-file=/etc/kubernetes/pki/rootCA.crt' /etc/kubernetes/manifests/kube-apiserver.yaml

# Install Gluster client
echo "[TASK 14] Install Gluster engine"
yum install -y -q centos-release-gluster
yum install -y -q glusterfs-server
systemctl disable glusterd
systemctl stop glusterd

/home/vagrant/gentoken.sh