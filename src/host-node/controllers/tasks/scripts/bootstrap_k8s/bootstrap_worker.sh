#!/bin/bash

# Install Gluster client
echo "[TASK M.4] Install Gluster engine"
yum install -y -q centos-release-gluster glusterfs-server
systemctl disable glusterd
systemctl stop glusterd