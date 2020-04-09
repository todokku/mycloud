# MyCloud-PaaS - A private cloud PaaS platform

## About

MyCloud-PaaS is a open source, multi-tenant cloud platform that can be installed on any hardware. It is based on Kubernetes at it's core, providing organizations and teams with isolated clusters and a collection of managed services to be deployed. Some of MyCloud's features are:

- Multi tenancy, private cloud PaaS solution (Accounts => Organizations => Workspaces (dedicated K8S cluster) => Namespaces)
- Provision managed core services such as various databases, messaging brokers and other services for each tenant
- Scale your tenant cluster for HA use cases
- Manage your images with a private docker registry
- Manage storage and volumes independantly for each tenant
- Provides a distributed storage solution based on GlusterFS
- Self service using CLI command line

## Install

The overall architectufe of the solution looks like the following:

![MyCloud PaaS Component diagram](./resources/component-diagram.png)

> The above diagram is an example setup. For testing purposes, you can install the "Controller Plane" and one "Host Node" on a single machine. 
> For a production environement, you should deploy the "Controller Plane" on a dedicated host, and a minimum of 2 "Host Nodes", each on it's own machine.
>
> I tested MyCloud on Ubuntu 18.04, as well as CentOS / RedHat 7 & 8.

### Install the Control-Plane

To keep things easy for now, we deploy the control-plane on a VirtualBox VM. I chose to use Vagrant to orchestrate the deployment, because of it's convenience in terms of configuring and starting of new VMs as well as for it's ease of use in terms of provisionning software.

> PLEASE NOTE: Since we are using VirtualBox to run the control plane, it is possible to run the control plane on any operating system that supports VirtualBox.

To install the control plane, run the following command in your terminal:

```
bash <(curl https://raw.githubusercontent.com/mdundek/mycloud/master/install/control-plane/install.sh)
```

### Install the Host-node

The Host Node component is responsible for Virtualbox based K8S Cluster management tasks as well as Volume provisionning tasks such as local volumes as well as Gluster volumes.  
You can chose to deploy a Host Node component to handle only Gluster Volume management tasks, Kubernetes Cluster management tasks or both. This can be usefull if you wish to dedicate certain host machines to distributed Gluster storage management only, and let other host machines deal with Virtualbox and K8S Cluster specific tasks.  

The Host Node controllers will also take care of scaling up or down your Kubernetes clusters, and deal with the setup of volumes, registry setup and more, making it as simple as running the command `mc cluster:scale -i 3` to scale your cluster up to one master and 3 workers dispatched amongst the available Host Nodes in your network.

> IMPORTANT: Since the host-node controller interacts with VirtualBox over it's API interface in order to manage tennant environements, it is not possible to install the host-node controller inside a VM itself.
> Supported operating systems for the moment are Ubuntu 18.04, as well as CentOS / RedHat 7 & 8. for any other operating system, you will have to install and configure the various components manually.

```
bash <(curl https://raw.githubusercontent.com/mdundek/mycloud/master/install/host-node/install.sh)
```