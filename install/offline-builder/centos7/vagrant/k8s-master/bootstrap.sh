#!/bin/bash

# Update environment file
cat >>/etc/environment<<EOF
LANG=en_US.utf-8
LC_ALL=en_US.utf-8
EOF

yum install -y --cacheonly --disablerepo=* /home/vagrant/rpms/yum-utils/*.rpm
yum install -y --cacheonly --disablerepo=* /home/vagrant/rpms/device-mapper-persistent-data/*.rpm
yum install -y --cacheonly --disablerepo=* /home/vagrant/rpms/lvm2/*.rpm
yum install -y --cacheonly --disablerepo=* /home/vagrant/rpms/sshpass/*.rpm
yum install -y --cacheonly --disablerepo=* /home/vagrant/rpms/unzip/*.rpm
yum install -y --cacheonly --disablerepo=* /home/vagrant/rpms/centos-release-gluster/*.rpm
yum install -y --cacheonly --disablerepo=* /home/vagrant/rpms/glusterfs-server/*.rpm
# yum install -y --cacheonly --disablerepo=* /home/vagrant/rpms/docker-ce/*.rpm

systemctl disable glusterd
systemctl stop glusterd

usermod -aG docker vagrant

# Enable docker service
echo "[TASK 2] Enable and start docker service"
systemctl enable docker >/dev/null 
systemctl start docker

# Disable SELinux
echo "[TASK 3] Disable SELinux"
setenforce 0
sed -i --follow-symlinks 's/^SELINUX=enforcing/SELINUX=disabled/' /etc/sysconfig/selinux

# Stop and disable firewalld
# echo "[TASK 4] Stop and Disable firewalld"
systemctl disable firewalld
systemctl stop firewalld

# Add sysctl settings
echo "[TASK 4] Add sysctl settings"
cat >>/etc/sysctl.d/kubernetes.conf<<EOF
net.bridge.bridge-nf-call-ip6tables = 1
net.bridge.bridge-nf-call-iptables = 1
EOF
sysctl --system >/dev/null 

# Disable swap
echo "[TASK 5] Disable and turn off SWAP"
sed -i '/swap/d' /etc/fstab
swapoff -a

# Install Kubernetes
echo "[TASK 7] Install Kubernetes (kubeadm, kubelet and kubectl)"
yum install -y --cacheonly --disablerepo=* /home/vagrant/rpms/kubeadm/*.rpm
yum install -y --cacheonly --disablerepo=* /home/vagrant/rpms/kubelet/*.rpm
yum install -y --cacheonly --disablerepo=* /home/vagrant/rpms/kubectl/*.rpm

systemctl start kubelet
kubeadm config images pull
systemctl stop kubelet

# Enable ssh password authentication
echo "[TASK 8] Enable ssh password authentication"
sed -i 's/^PasswordAuthentication no/PasswordAuthentication yes/' /etc/ssh/sshd_config
systemctl reload sshd

# Set Root password
echo "[TASK 9] Set root password"
echo "kubeadmin" | passwd --stdin vagrant

# # Install Gluster client
# echo "[TASK 10] Install Gluster engine"
# yum install -y -q centos-release-gluster glusterfs-server
# systemctl disable glusterd
# systemctl stop glusterd

cat <<EOT >> /home/vagrant/getnodes.sh
#!/bin/bash
kubectl get nodes | grep 'worker.' | awk '{print \$1}' | rev | cut -d. -f1 | rev | tr '\n' ','
EOT
chmod +x /home/vagrant/getnodes.sh

echo "[TASK 11] Generate and save cluster join command to /joincluster.sh"
cat <<EOT >> /home/vagrant/gentoken.sh
#!/bin/bash
kubeadm token create --print-join-command > /joincluster.sh
EOT
chmod +x /home/vagrant/gentoken.sh

echo "[TASK 12] Install third party resources"
echo "export PATH=$PATH:/usr/local/bin/" >> /etc/environment
export PATH=$PATH:/usr/local/bin/
curl https://raw.githubusercontent.com/helm/helm/master/scripts/get-helm-3 | bash

# Cleanup
echo "[TASK 13] Cleanup"
package-cleanup -y --oldkernels --count=1
yum -y autoremove
yum -y remove yum-utils
yum clean all
rm -rf /tmp/*
rm -f /var/log/wtmp /var/log/btmp

cat /dev/null > ~/.bash_history && history -c
history -c