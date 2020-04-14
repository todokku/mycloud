#!/bin/bash

# Install Gluster client
echo "[TASK M.4] Install Gluster engine"
yum install -y -q centos-release-gluster glusterfs-server
echo "[TASK M.5]"
systemctl disable glusterd
echo "[TASK M.6]"
systemctl stop glusterd