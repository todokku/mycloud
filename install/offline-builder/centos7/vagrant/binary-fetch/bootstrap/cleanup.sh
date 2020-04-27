#!/bin/bash

# Cleanup
package-cleanup -y --oldkernels --count=1
yum -y autoremove
yum clean all
rm -rf /tmp/*
rm -f /var/log/wtmp /var/log/btmp

cat /dev/null > ~/.bash_history && history -c
history -c