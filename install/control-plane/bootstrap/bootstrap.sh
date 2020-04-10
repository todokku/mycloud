#!/bin/bash

POSTGRES_PASSWORD="$1"
API_SYSADMIN_USER="$2"
API_SYSADMIN_PASSWORD="$3"

API_IP=$(hostname -I | cut -d' ' -f2)

function join_by { local IFS="$1"; shift; echo "$*"; }
arrIN=(${API_IP//./ })
IP_SUB="${arrIN[@]:(-1)}"
unset 'arrIN[${#arrIN[@]}-1]'
DHCP_MASK=$(join_by . "${arrIN[@]}")
DHCP_RESERVED="[250,251,252,253,254,$IP_SUB]"
POSTGRES_USER="postgres"
NGINX_HOST_IP="$API_IP"
DB_HOST="$API_IP"
MOSQUITTO_IP="$API_IP"
REGISTRY_IP="$API_IP"
DB_PASS=$POSTGRES_PASSWORD

# Update environment file
cat >>/etc/environment<<EOF
LANG=en_US.utf-8
LC_ALL=en_US.utf-8
EOF
echo "export TERM=xterm" >> /etc/bashrc

echo "[TASK 1] Install docker container engine"
yum install -y -q yum-utils device-mapper-persistent-data lvm2 git
yum-config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo 
yum install -y -q docker-ce >/dev/null 
usermod -aG docker vagrant

echo "[TASK 2] Enable and start docker service"
systemctl enable docker >/dev/null 
systemctl start docker

echo "[TASK 3] Stop and Disable firewalld"
systemctl disable firewalld >/dev/null 
systemctl stop firewalld

echo "[TASK 4] Disable SELinux"
setenforce 0
sed -i --follow-symlinks 's/^SELINUX=enforcing/SELINUX=disabled/' /etc/sysconfig/selinux

echo "[TASK 5] Disable and turn off SWAP"
sed -i '/swap/d' /etc/fstab
swapoff -a

echo "[TASK 6] Install sshpass"
yum install -q -y sshpass

echo "[TASK 7] Prepare environement & clone mycloud"

su - vagrant -c "mkdir /home/vagrant/mycloud"
su - vagrant -c "git clone https://github.com/mdundek/mycloud.git /home/vagrant/mycloud"

mkdir -p /home/vagrant/.mycloud/nginx/conf.d
mkdir -p /home/vagrant/.mycloud/nginx/letsencrypt

cp /home/vagrant/mycloud/install/control-plane/nginx_resources/nginx.conf /home/vagrant/.mycloud/nginx
cp /home/vagrant/mycloud/install/control-plane/nginx_resources/registry.conf /home/vagrant/.mycloud/nginx/conf.d
touch /home/vagrant/.mycloud/nginx/conf.d/default.conf
touch /home/vagrant/.mycloud/nginx/conf.d/tcp.conf

chown -R vagrant: /home/vagrant/.mycloud

sed -i "s/<MYCLOUD_API_HOST_PORT>/$API_IP:3030/g" /home/vagrant/.mycloud/nginx/conf.d/registry.conf

echo "[TASK 8] Set root password"
echo "kubeadmin" | passwd --stdin vagrant

echo "[TASK 9] Create new partition"
echo -e "o\nn\np\n1\n\n\nw" | fdisk /dev/sdb

echo "[TASK 10] Mount partition"
mkfs.xfs -i size=512 /dev/sdb1
mkdir -p /mnt/docker-registry/data
echo '/dev/sdb1 /mnt/docker-registry/data xfs defaults 1 2' >> /etc/fstab
mount -a && mount

echo "[TASK 11] Enable ssh password authentication"
sed -i 's/^PasswordAuthentication no/PasswordAuthentication yes/' /etc/ssh/sshd_config
systemctl reload sshd

echo "[TASK 12] Install solution components"
su - vagrant -c '
mkdir -p /opt/docker/containers/docker-registry/auth
mkdir -p /opt/docker/containers/nginx-registry/auth
mkdir -p /opt/docker/containers/docker-registry/certs
docker run --entrypoint htpasswd registry -Bbn mycloud_master_user mycloud_master_pass > /opt/docker/containers/docker-registry/auth/htpasswd
docker run --entrypoint htpasswd registry -bn mycloud_master_user mycloud_master_pass > /opt/docker/containers/nginx-registry/auth/htpasswd
printf "FR\nGaronne\nToulouse\nmycloud\nITLAB\nmycloud.registry.com\nmycloud@mycloud.com\n" | openssl req -newkey rsa:2048 -nodes -sha256 -x509 -days 365 \
    -keyout /opt/docker/containers/docker-registry/certs/docker-registry.key \
    -out /opt/docker/containers/docker-registry/certs/docker-registry.crt
printf "FR\nGaronne\nToulouse\nmycloud\nITLAB\nregistry.mycloud.org\nmycloud@mycloud.com\n" | openssl req -newkey rsa:2048 -nodes -sha256 -x509 -days 365 \
    -keyout /opt/docker/containers/docker-registry/certs/nginx-registry.key \
    -out /opt/docker/containers/docker-registry/certs/nginx-registry.crt
docker pull registry:2.7.1
docker run -d \
    --name docker-registry \
    --restart=always -p 5000:5000 \
    -v /mnt/docker-registry/data/:/var/lib/registry \
    -v /opt/docker/containers/docker-registry/auth:/auth \
    -e "REGISTRY_AUTH=htpasswd" -e "REGISTRY_AUTH_HTPASSWD_REALM=Registry Realm" \
    -e REGISTRY_AUTH_HTPASSWD_PATH=/auth/htpasswd \
    -e REGISTRY_STORAGE_DELETE_ENABLED=true \
    -v /opt/docker/containers/docker-registry/certs:/certs \
    -e REGISTRY_HTTP_TLS_CERTIFICATE=/certs/docker-registry.crt \
    -e REGISTRY_HTTP_TLS_KEY=/certs/docker-registry.key \
    registry:2.7.1
'

# Install Nginx
su - vagrant -c '
docker pull nginx:1.17.9-alpine
docker run -d \
    --name mycloud-nginx \
    --restart unless-stopped \
    --network host \
    -v /home/vagrant/.mycloud/nginx/conf.d:/etc/nginx/conf.d:ro \
    -v /home/vagrant/.mycloud/nginx/nginx.conf:/etc/nginx/nginx.conf \
    -v /home/vagrant/.mycloud/nginx/letsencrypt:/etc/letsencrypt \
    -v /opt/docker/containers/nginx-registry/auth:/auth \
    -v /opt/docker/containers/docker-registry/certs:/certs \
    nginx:1.17.9-alpine
'

# Install Postgres
su - vagrant -c '
docker pull postgres:12.2-alpine
mkdir -p /home/vagrant/.mycloud/postgres/data
docker run -d \
    --name mycloud-postgresql \
    --restart unless-stopped \
    --network host \
    -v /home/vagrant/.mycloud/postgres/data:/var/lib/postgresql/data \
    -e POSTGRES_PASSWORD=$POSTGRES_PASSWORD \
    -e POSTGRES_USER=$POSTGRES_USER \
    postgres:12.2-alpine
'

# Install Mosquitto
su - vagrant -c '
docker pull eclipse-mosquitto:1.6
mkdir -p /home/vagrant/.mycloud/mosquitto/config
mkdir -p /home/vagrant/.mycloud/mosquitto/data
mkdir -p /home/vagrant/.mycloud/mosquitto/log
touch /home/vagrant/.mycloud/mosquitto/log/mosquitto.log
chmod o+w /home/vagrant/.mycloud/mosquitto/log/mosquitto.log
chown 1883:1883 /home/vagrant/.mycloud/mosquitto/log -R
docker run -d \
    --name mycloud-mosquitto \
    --restart unless-stopped \
    --network host \
    -v /home/vagrant/.mycloud/postgres/data:/mosquitto/data \
    -v /home/vagrant/.mycloud/postgres/log:/mosquitto/log \
    -v /etc/localtime:/etc/localtime \
    eclipse-mosquitto:1.6
'

# Run API server
su - vagrant -c '
mkdir cd /home/vagrant/mycloud/tmp \
cd /home/vagrant/mycloud/src/api \
docker run -d \
    --name mycloud-api \
    --restart unless-stopped \
    --network host \
    -e NGINX_HOST_IP=$NGINX_HOST_IP \
    -e DB_HOST=$DB_HOST \
    -e DB_USER=$POSTGRES_USER \
    -e DB_PASS=$DB_PASS \
    -e MOSQUITTO_IP=$MOSQUITTO_IP \
    -e API_SYSADMIN_USER=$API_SYSADMIN_USER \
    -e API_SYSADMIN_PASSWORD=$API_SYSADMIN_PASSWORD \
    -e REGISTRY_IP=$REGISTRY_IP \
    -e CRYPTO_KEY=YDbxyG16Q6ujlCpjXH2Pq7nPAtJF66jLGwx4RYkHqhY= \
    -e ENABLE_NGINX_STREAM_DOMAIN_NAME=false \
    -e MC_SERVICES_DIR=/usr/src/app/data/mc_services \
    -v /home/vagrant/mycloud:/usr/src/app/data \
    mycloud-api:0.9
'

# Run controller component
su - vagrant -c '
cd /home/vagrant/mycloud/src/task-controller
docker build -t mycloud-ctrl:0.9 .
docker run -d \
    --name mycloud-ctrl \
    --restart unless-stopped \
    --network host \
    -e DB_HOST=$DB_HOST \
    -e DB_USER=$POSTGRES_USER \
    -e DB_PASS=$DB_PASS \
    -e MOSQUITTO_IP=$MOSQUITTO_IP \
    -e DHCP_MASK=$DHCP_MASK \
    -e NGINX_HOST_IP=$NGINX_HOST_IP \
    -e DHCP_RESERVED=$DHCP_RESERVED \
    -e ENABLE_NGINX_STREAM_DOMAIN_NAME=false \
    -v /var/run/docker.sock:/var/run/docker.sock \
    -v /home/vagrant/.mycloud/nginx:/usr/src/app/nginx \
    mycloud-ctrl:0.9
'

echo "[TASK 13] Generate client registry setup script"
M_IP="$(hostname -I | cut -d' ' -f2)"
CRT="$(cat /opt/docker/containers/docker-registry/certs/docker-registry.crt)"
CRT_NGINX="$(cat /opt/docker/containers/docker-registry/certs/nginx-registry.crt)"

echo "#!/bin/bash"  >> /home/vagrant/configPrivateRegistry.sh
# echo "echo \"$M_IP mycloud.registry.com registry.mycloud.org docker-registry\"  >> /etc/hosts" >> /home/vagrant/configPrivateRegistry.sh

echo "mkdir -p /etc/docker/certs.d/mycloud.registry.com:5000" >> /home/vagrant/configPrivateRegistry.sh
echo "cat <<EOT >> /etc/docker/certs.d/mycloud.registry.com:5000/ca.crt" >> /home/vagrant/configPrivateRegistry.sh
echo "$CRT"  >> /home/vagrant/configPrivateRegistry.sh
echo "EOT"  >> /home/vagrant/configPrivateRegistry.sh

echo "mkdir -p /etc/docker/certs.d/registry.mycloud.org" >> /home/vagrant/configPrivateRegistry.sh
echo "cat <<EOT >> /etc/docker/certs.d/registry.mycloud.org/ca.crt" >> /home/vagrant/configPrivateRegistry.sh
echo "$CRT_NGINX"  >> /home/vagrant/configPrivateRegistry.sh
echo "EOT"  >> /home/vagrant/configPrivateRegistry.sh

echo "systemctl stop docker && systemctl start docker"  >> /home/vagrant/configPrivateRegistry.sh
#echo "printf \"mycloud_master_pass\" | docker login registry.mycloud.org --username mycloud_master_user --password-stdin"  >> /home/vagrant/configPrivateRegistry.sh

echo "$API_IP mycloud.registry.com registry.mycloud.org" >> /etc/hosts

chmod +x /home/vagrant/configPrivateRegistry.sh

echo ""
echo "------------------- RUN ON CLIENT --------------------"
cat  /home/vagrant/configPrivateRegistry.sh
echo "------------------------------------------------------"
echo ""
echo "Once the script executed, you can login to the private repository:"
echo ""
echo "\$ docker login registry.mycloud.org"
echo "NOTE: Username: mycloud_master_user, Password: mycloud_master_pass"
echo ""
echo "To push an image to the new registry:"
echo ""
echo "\$ docker tag <image name>:<image tag> registry.mycloud.org/<image name>:<image tag>"
echo "\$ docker push registry.mycloud.org/<image name>:<image tag>"
echo ""
echo "[INFO] For K8S, execute the scripe as sudo on each node. You will have to create a secret to hold the basic auth credentials in order to pull images:"
echo "https://kubernetes.io/docs/tasks/configure-pod-container/pull-image-private-registry/#before-you-begin"

echo "[DONE]"