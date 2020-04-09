# MyCloud-PaaS - A private cloud PaaS platform

MyCloud-PaaS is a open source, multi-tenant cloud platform that can be installed on any hardware. It is based on Kubernetes at it's core, providing organizations and teams with isolated clusters and a collection of managed services to be deployed. Some of MyCloud's features are:

- Multi tenancy, private cloud PaaS solution
- Provision managed core services such as databases, messaging brokers and others for each tenant
- Scale your tenant cluster for HA use cases
- Manage your images with a private docker registry
- Manage storage and volumes independantly for each tenant
- Provides a distributed storage solution based on Gluster
- Self service using CLI command line
- 




# Install

![MyCloud PaaS Component diagram](./resources/component-diagram.png)

## Install the Host-node

> IMPORTANT: Since the host-node controller uses VirtualBox in order to manage tennant environements, it is not possible to install the host-node controller inside a VirtualBox VM itself.

```
bash <(curl https://raw.githubusercontent.com/mdundek/mycloud/master/install/host-node/install.sh)
```