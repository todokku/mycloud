const OSController = require("../os/index");
const DBController = require("../db/index");

const shortid = require('shortid');
shortid.characters('0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ$@');
const path = require('path');
const fs = require('fs');
const YAML = require('yaml');

// const ssh = new node_ssh();
let EngineController;

// Sleep promise for async
let _sleep = (duration) => {
    return new Promise((resolve) => {
        setTimeout(() => {
            resolve();
        }, duration);
    });
}

class TaskRuntimeController {
    
    /**
     * init
     */
    static init(parent, mqttController) {
        this.parent = parent;
        this.mqttController = mqttController;

        // Prepare the environment scripts
        if(process.env.CLUSTER_ENGINE == "virtualbox") {
            EngineController = require("../engines/virtualbox/index");
        }
    }

    /**
     * requestCreateK8SResource
     * @param {*} ip 
     * @param {*} data 
     */
    static async requestCreateK8SResource(topicSplit, data) {
        try{
            await this.kubectl(`kubectl create ${data.type} ${data.name}${data.ns ? " --namespace=" + data.ns : ""}`, data.node);

console.log(data);

            if(data.type == "namespace") {
                let adminRoleBindingYamlPath = path.join(process.cwd(), "resources", "k8s_templates", "rbac_role_bindings.yaml");
                let wsTmpYamlPath = path.join(process.env.VM_BASE_DIR, "workplaces", data.node.workspaceId.toString(), data.node.hostname, `rbac_role_bindings.yaml`);
                await OSController.copyFile(adminRoleBindingYamlPath, path.dirname(wsTmpYamlPath));
                let adminRoleBindingYaml = YAML.parse(fs.readFileSync(wsTmpYamlPath, 'utf8'));

                adminRoleBindingYaml.kind = "RoleBinding";
                adminRoleBindingYaml.metadata.namespace = data.name;

                for(let i=0; i<data.groups.length; i++) {
                    console.log("Applying role binding ", data.groups[i]);
                    adminRoleBindingYaml.metadata.name = `mc-${data.name}-${data.groups[i]}-binding`;
                    adminRoleBindingYaml.subjects[0].name = `/mc/${data.clusterBaseGroup}/${data.groups[i]}`;
                    adminRoleBindingYaml.roleRef.name = data.groups[i];

                    fs.writeFileSync(wsTmpYamlPath, YAML.stringify(adminRoleBindingYaml));
                    await TaskRuntimeController.applyK8SYaml(wsTmpYamlPath, null, data.node);
                    // Deploy admin RoleBinding
                    await TaskRuntimeController.applyK8SYaml(
                        path.join(process.cwd(), "resources", "k8s_templates", "rbac_role_bindings.yaml"),
                        null, 
                        { ip: result.nodeIp }
                    );
                }
            }

            this.mqttController.client.publish(`/mycloud/k8s/host/respond/${data.queryTarget}/${topicSplit[5]}/${topicSplit[6]}`, JSON.stringify({
                status: 200,
                task: "create k8s resource"
            }));
        } catch (_error) {
            console.log(_error);
            try { await this.kubectl(`kubectl delete ${data.type} ${data.name}${data.ns ? " --namespace=" + data.ns : ""}`, data.node); } catch (error) {}
            this.mqttController.client.publish(`/mycloud/k8s/host/respond/${data.queryTarget}/${topicSplit[5]}/${topicSplit[6]}`, JSON.stringify({
                status: _error.code ? _error.code : 500,
                message: _error.message,
                task: "create k8s resource"
            }));
        }   
    }

    /**
     * requestGetK8sResources
     * @param {*} ip 
     * @param {*} data 
     */
    static async requestGetK8sResources(topicSplit, ip, data) {
        try{
            let resourceResponses = {};
            for(let i=0; i<data.targets.length; i++) {
                let result = await this.getK8SResources(
                    data.node, 
                    data.ns, 
                    data.targets[i], 
                    (data.targetNames && data.targetNames.length >= (i+1)) ? data.targetNames[i] : null,
                    data.json ? data.json : false
                );
                resourceResponses[data.targets[i]] = result
            }
            this.mqttController.client.publish(`/mycloud/k8s/host/respond/${data.queryTarget}/${topicSplit[5]}/${topicSplit[6]}`, JSON.stringify({
                status: 200,
                task: "get k8s resources",
                output: resourceResponses
            }));
        } catch (err) {
            this.mqttController.client.publish(`/mycloud/k8s/host/respond/${data.queryTarget}/${topicSplit[5]}/${topicSplit[6]}`, JSON.stringify({
                status: err.code ? err.code : 500,
                message: err.message,
                task: "get k8s resources",
                data: data
            }));
        }
    }

    /**
     * requestGetK8SResourceValues
     * @param {*} ip 
     * @param {*} data 
     */
    static async requestGetK8SResourceValues(topicSplit, ip, data) {
        try{
            let result = await this.getK8SResourceValues(data.node, data.ns, data.target, data.targetName, data.jsonpath);
            this.mqttController.client.publish(`/mycloud/k8s/host/respond/${data.queryTarget}/${topicSplit[5]}/${topicSplit[6]}`, JSON.stringify({
                status: 200,
                task: "get k8s resource values",
                output: result
            }));
        } catch (err) {
            this.mqttController.client.publish(`/mycloud/k8s/host/respond/${data.queryTarget}/${topicSplit[5]}/${topicSplit[6]}`, JSON.stringify({
                status: err.code ? err.code : 500,
                message: err.message,
                task: "get k8s resource values",
                data: data
            }));
        }
    }

    /**
     * requestGetK8sState
     * @param {*} topicSplit 
     * @param {*} data 
     */
    static async requestGetK8sState(topicSplit, data) {
        try {
            let stateData = await this.getK8SState(data.node);
            this.mqttController.client.publish(`/mycloud/k8s/host/respond/${data.queryTarget}/${topicSplit[5]}/${topicSplit[6]}`, JSON.stringify({
                status: 200,
                task: "getK8SState",
                nodeType: "master",
                state: stateData,
                node: data.node
            }));
        } catch (err) {
            console.log(err);
            this.mqttController.client.publish(`/mycloud/k8s/host/respond/${data.queryTarget}/${topicSplit[5]}/${topicSplit[6]}`, JSON.stringify({
                status: Array.isArray(err) ? 500 : (err.code ? err.code : 500),
                message: Array.isArray(err) ? err.map(e => e.message).join(" ; ") : err.message,
                task: "getK8SState",
                nodeType: "master",
                node: data.node
            }));
        }
    }

    /**
     * requestGrabMasterConfigFile
     * @param {*} masterIp 
     * @param {*} workspaceId 
     */
    static async requestGrabMasterConfigFile(topicSplit, data) {
        try {
            let tmpConfigFilePath = await this.grabMasterConfigFile(data.node.ip, data.node.workspaceId);
            let _b = fs.readFileSync(tmpConfigFilePath);
            this.mqttController.client.publish(`/mycloud/k8s/host/respond/${data.queryTarget}/${topicSplit[5]}/${topicSplit[6]}`, JSON.stringify({
                status: 200,
                config: _b.toString('base64')
            }));
            fs.unlinkSync(tmpConfigFilePath);
        } catch (err) {
            console.log(err);
            this.mqttController.client.publish(`/mycloud/k8s/host/respond/${data.queryTarget}/${topicSplit[5]}/${topicSplit[6]}`, JSON.stringify({
                status: Array.isArray(err) ? 500 : (err.code ? err.code : 500),
                message: Array.isArray(err) ? err.map(e => e.message).join(" ; ") : err.message,
                task: "grabMasterConfigFile",
                nodeType: "master"
            }));
        }
    }

    /**
     * requestUpdateClusterIngressRules
     * @param {*} topicSplit 
     * @param {*} ip 
     * @param {*} data 
     */
    static async requestUpdateClusterIngressRules(topicSplit, data) {
        try {
            let org = await DBController.getOrgForWorkspace(data.node.workspaceId);
            let account = await DBController.getAccountForOrg(org.id);
            let services = await DBController.getServicesForWsRoutes(data.node.workspaceId);
            let applications = await DBController.getApplicationsForWsRoutes(data.node.workspaceId);

            let allServices = services.concat(applications);
            await this.updateClusterIngressRulesForNsHTTP(data, org, account, allServices);
            await this.updateClusterIngressRulesTCP(data, org, account, allServices);
            this.mqttController.client.publish(`/mycloud/k8s/host/respond/${data.queryTarget}/${topicSplit[5]}/${topicSplit[6]}`, JSON.stringify({
                status: 200,
                task: "update cluster ingress"
            }));
        } catch (error) {
            console.log(error);
            // if(backupData){
            //     fs.writeFileSync(backupData.yamlPath, YAML.stringify(backupData.backup));
            //     try { await this.applyK8SYaml(backupData.yamlPath, data.ns, data.node); } catch (_e) {}
            // }
            this.mqttController.client.publish(`/mycloud/k8s/host/respond/${data.queryTarget}/${topicSplit[5]}/${topicSplit[6]}`, JSON.stringify({
                status: error.code ? error.code : 500,
                message: error.message,
                task: "update cluster ingress",
                data: data
            }));
        }
    }

    // /**
    //  * updateClusterIngressRulesForNsHTTP
    //  * @param {*} topicSplit 
    //  * @param {*} ip 
    //  * @param {*} data 
    //  */
    // static async updateClusterIngressRulesForNsHTTP(data, org, account, allServices) {
    //     let ingressYamlPath = path.join(process.env.VM_BASE_DIR, "workplaces", data.node.workspaceId.toString(), data.node.hostname, "ingress-rules.yaml"); 
    //     let backupYamlContent = null;
    //     try{
    //         let allNsServices = allServices.filter(o => o.namespace == data.ns);
    //         // Prepare ingress rules yaml file
    //         let ingressYaml = YAML.parse(fs.readFileSync(ingressYamlPath, 'utf8'));
    //         backupYamlContent = JSON.parse(JSON.stringify(ingressYaml));

    //         ingressYaml.spec.rules = [];
    //         // Count available ports for each service
    //         let baseNamesPortCount = {};
    //         for(let i=0; i<allNsServices.length; i++){
    //             if(allNsServices[i].serviceType == "ClusterIP" && allNsServices[i].externalServiceName){
    //                 let serverBaseName = `${account.name}-${org.name}-${allNsServices[i].workspaceName}-${allNsServices[i].namespace}-${allNsServices[i].name}`.toLowerCase();
    //                 if(!baseNamesPortCount[serverBaseName]) {
    //                     baseNamesPortCount[serverBaseName] = 1;
    //                 } else {
    //                     baseNamesPortCount[serverBaseName] = baseNamesPortCount[serverBaseName]+1;
    //                 }
    //             }
    //         }

    //         // Loop over services first
    //         let allServiceNames = [];
    //         for(let i=0; i<allNsServices.length; i++){
    //             if(allNsServices[i].serviceType == "ClusterIP" && allNsServices[i].externalServiceName && !allNsServices[i].tcpStream){
    //                 let baseHostPath = `${account.name}-${org.name}-${allNsServices[i].workspaceName}-${allNsServices[i].namespace}-${allNsServices[i].name}`.toLowerCase();
    //                 if(baseNamesPortCount[baseHostPath] > 1){
    //                     baseHostPath = `${baseHostPath}-${allNsServices[i].port}`;
    //                 }

    //                 // Create new rule for this service
    //                 let rule = {
    //                     host: `${baseHostPath}${allNsServices[i].domainName ? `.${allNsServices[i].domainName}` : ""}`.toLowerCase(),
    //                     http: {
    //                         paths: [
    //                             {
    //                                 path: "/",
    //                                 backend: {
    //                                     serviceName: allNsServices[i].externalServiceName,
    //                                     servicePort: allNsServices[i].port
    //                                 }
    //                             }
    //                         ] 
    //                     }
    //                 };
    //                 // Now push it to the rules array
    //                 ingressYaml.spec.rules.push(rule);
    //                 allServiceNames.push(allNsServices[i].externalServiceName);
    //             }
    //         }

    //         // Enable websocket capabilities for all services
    //         ingressYaml.metadata.annotations["nginx.org/websocket-services"] = allServiceNames.join(",");
           
    //         // console.log("=>", YAML.stringify(ingressYaml));

    //         if(ingressYaml.spec.rules.length > 0) {
    //             fs.writeFileSync(ingressYamlPath, YAML.stringify(ingressYaml));
    //             await this.applyK8SYaml(ingressYamlPath, data.ns, data.node);
    //         } else {
    //             await this.deleteK8SResource(data.node, data.ns, "ingress", "workspace-ingress");
    //         }
    //         return {
    //             "yamlPath": ingressYamlPath,
    //             "backup": backupYamlContent
    //         };
    //     } catch (error) {
    //         if(backupYamlContent) {
    //             fs.writeFileSync(ingressYamlPath, YAML.stringify(backupYamlContent));
    //             try { await this.applyK8SYaml(ingressYamlPath, data.ns, data.node); } catch (_e) {}
    //         }
    //         throw error;
    //     }
    // }

    /**
     * updateClusterIngressRulesForNsHTTP
     * @param {*} topicSplit 
     * @param {*} ip 
     * @param {*} data 
     */
    static async updateClusterIngressRulesForNsHTTP(data, org, account, allServices) {
        let allNsServices = allServices.filter(o => o.namespace == data.ns);
        
        // Count available ports for each service
        let baseNamesPortCount = {};
        for(let i=0; i<allNsServices.length; i++){
            if(allNsServices[i].serviceType == "ClusterIP" && allNsServices[i].externalServiceName){
                let serverBaseName = `${account.name}-${org.name}-${allNsServices[i].workspaceName}-${allNsServices[i].namespace}-${allNsServices[i].name}`.toLowerCase();
                if(!baseNamesPortCount[serverBaseName]) {
                    baseNamesPortCount[serverBaseName] = 1;
                } else {
                    baseNamesPortCount[serverBaseName] = baseNamesPortCount[serverBaseName]+1;
                }
            }
        }

        // Loop over services first
        for(let i=0; i<allNsServices.length; i++){
            if(allNsServices[i].serviceType == "ClusterIP" && allNsServices[i].externalServiceName && !allNsServices[i].tcpStream){
                let baseHostPath = `${account.name}-${org.name}-${allNsServices[i].workspaceName}-${allNsServices[i].namespace}-${allNsServices[i].name}`.toLowerCase();
                if(baseNamesPortCount[baseHostPath] > 1){
                    baseHostPath = `${baseHostPath}-${allNsServices[i].port}`;
                }
                let vsContent = {
                    apiVersion: "k8s.nginx.org/v1",
                    kind: "VirtualServer",
                    metadata: { name: `${allNsServices[i].namespace}-${allNsServices[i].name}`},
                    spec: {
                        host: `${baseHostPath}${allNsServices[i].domainName ? `.${allNsServices[i].domainName}` : ""}`.toLowerCase(),
                        upstreams: [
                            {
                                name: `${allNsServices[i].namespace}-${allNsServices[i].name}`,
                                service: allNsServices[i].externalServiceName,
                                port: allNsServices[i].port
                            }
                        ],
                        routes: [
                            {
                                path: "/",
                                action: { pass: `${allNsServices[i].namespace}-${allNsServices[i].name}` }
                            }
                        ]
                    }
                };

                let tmpFileName = null;
                while(tmpFileName == null){
                    tmpFileName = shortid.generate();
                    if(tmpFileName.indexOf("$") != -1 || tmpFileName.indexOf("@") != -1){
                        tmpFileName = null;
                    }
                }
                let ingressFilePath = path.join(process.env.VM_BASE_DIR, "workplaces", data.node.workspaceId.toString(), data.node.hostname, `${tmpFileName}.yaml`);
                    
                console.log(YAML.stringify(vsContent));

                try {
                    fs.writeFileSync(ingressFilePath, YAML.stringify(vsContent));
                    await this.applyK8SYaml(ingressFilePath, data.ns, data.node);
                } catch (error) {
                    console.log(error);
                } finally {
                    if(fs.existsSync(ingressFilePath))
                        fs.unlinkSync(ingressFilePath);
                }
            }
        }
    }

    /**
     * updateClusterIngressRulesTCP
     * @param {*} topicSplit 
     * @param {*} ip 
     * @param {*} data 
     */
    static async updateClusterIngressRulesTCP(data, org, account, allServices) {
        // Get deamonset nginx ingress template
        let tmpFolderHash = null;
        while(tmpFolderHash == null){
            tmpFolderHash = shortid.generate();
            if(tmpFolderHash.indexOf("$") != -1 || tmpFolderHash.indexOf("@") != -1){
                tmpFolderHash = null;
            }
        }
        
        let ingressFilePath = path.join(process.env.VM_BASE_DIR, "workplaces", data.node.workspaceId.toString(), data.node.hostname, `${tmpFolderHash}.yaml`);
        await OSController.fetchFileSsh(data.node.ip, ingressFilePath, "/home/vagrant/deployment_templates/ingress-controller/daemon-set/nginx-ingress.yaml");
        
        // Get configmap nginx ingress template
        tmpFolderHash = null;
        while(tmpFolderHash == null){
            tmpFolderHash = shortid.generate();
            if(tmpFolderHash.indexOf("$") != -1 || tmpFolderHash.indexOf("@") != -1){
                tmpFolderHash = null;
            }
        }
        let ingressConfigMapFilePath = path.join(process.env.VM_BASE_DIR, "workplaces", data.node.workspaceId.toString(), data.node.hostname, `${tmpFolderHash}.yaml`);
        await OSController.fetchFileSsh(data.node.ip, ingressConfigMapFilePath, "/home/vagrant/deployment_templates/ingress-controller/common/nginx-config.yaml");
      
        let backupIngressConfigMapYaml = null;
        let backupIngressYaml = null;
        try{
            // Update NGinx ingress configmap config
            let configStringArray = [];
            for(let i=0; i<allServices.length; i++){
                if(allServices[i].serviceType == "ClusterIP" && allServices[i].externalServiceName && allServices[i].tcpStream){

                    let upstreamName = `${allServices[i].externalServiceName}.${allServices[i].namespace}-${allServices[i].virtualPort}`;
                    let targetServiceDnsName = `${allServices[i].externalServiceName}.${allServices[i].namespace}.svc.cluster.local:${allServices[i].port}`;

                    configStringArray.push(`upstream ${upstreamName} {`);
                    configStringArray.push(`  server ${targetServiceDnsName};`);
                    configStringArray.push(`}`);
                    configStringArray.push(`server {`);
                    configStringArray.push(`  listen ${allServices[i].virtualPort};`);
                    configStringArray.push(`  proxy_pass ${upstreamName};`);
                    configStringArray.push(`}`);
                }
            }
            
            let ingressConfigMapYaml = YAML.parse(fs.readFileSync(ingressConfigMapFilePath, 'utf8'));
            backupIngressConfigMapYaml = JSON.parse(JSON.stringify(ingressConfigMapYaml));
          
            ingressConfigMapYaml.data = {};
            ingressConfigMapYaml.data['stream-snippets'] = configStringArray.join("\n");
            fs.writeFileSync(ingressConfigMapFilePath, YAML.stringify(ingressConfigMapYaml));
            await this.applyK8SYaml(ingressConfigMapFilePath, null, data.node);
           
            // Update NGinx ingress deamonset config
            let ingressYaml = YAML.parse(fs.readFileSync(ingressFilePath, 'utf8'));
            backupIngressYaml = JSON.parse(JSON.stringify(ingressYaml));
            let ingressOpenPorts = [
                { name: 'http', containerPort: 80, hostPort: 80 },
                { name: 'https', containerPort: 443, hostPort: 443 }
            ];
            let index = 1;
            for(let i=0; i<allServices.length; i++){
                if(allServices[i].serviceType == "ClusterIP" && allServices[i].externalServiceName && allServices[i].tcpStream){
                    ingressOpenPorts.push({ name: `${index++}xtcp`, containerPort: allServices[i].virtualPort, hostPort: allServices[i].virtualPort });
                }
            }
           
            ingressYaml.spec.template.spec.containers[0].ports = ingressOpenPorts;

            fs.writeFileSync(ingressFilePath, YAML.stringify(ingressYaml));
            await this.applyK8SYaml(ingressFilePath, null, data.node);
           
            // Double check: kubectl describe daemonset.apps/nginx-ingress --namespace=nginx-ingress
        } catch (error) {
            console.log(error);
            if(backupIngressConfigMapYaml) {
                fs.writeFileSync(ingressConfigMapFilePath, YAML.stringify(backupIngressConfigMapYaml));
                try { await this.applyK8SYaml(ingressConfigMapFilePath, data.ns, data.node); } catch (_e) {}
            }
            if(backupIngressYaml) {
                fs.writeFileSync(ingressFilePath, YAML.stringify(backupIngressYaml));
                try { await this.applyK8SYaml(ingressFilePath, data.ns, data.node); } catch (_e) {}
            }
            throw error;
        } finally {
            if(fs.existsSync(ingressFilePath))
                fs.unlinkSync(ingressFilePath);
            if(fs.existsSync(ingressConfigMapFilePath))
                fs.unlinkSync(ingressConfigMapFilePath);
        }
    }

    /**
     * updateClusterIngressRulesTCP
     * @param {*} topicSplit 
     * @param {*} ip 
     * @param {*} data 
     */
    // static async updateClusterIngressRulesTCP(data, org, account, allServices) {
        
    //     // Update NGinx GlobalConfiguration
    //     let globalConfig = {
    //             apiVersion: "k8s.nginx.org/v1alpha1",
    //         kind: "GlobalConfiguration", 
    //         metadata: {
    //             name: "nginx-configuration",
    //             namespace: "nginx-ingress"
    //         },
    //         spec: {
    //             listeners: []
    //         }
    //     }
    //     let portTransportServers = [];
    //     for(let i=0; i<allServices.length; i++){
    //         if(allServices[i].serviceType == "ClusterIP" && allServices[i].externalServiceName && allServices[i].tcpStream){
    //             globalConfig.spec.listeners.push({ 
    //                 name: `${allServices[i].virtualPort}-tcp`, 
    //                 port: allServices[i].virtualPort, 
    //                 protocol: "TCP"
    //             });
    //             globalConfig.spec.listeners.push({ 
    //                 name: `${allServices[i].virtualPort}-udp`, 
    //                 port: allServices[i].virtualPort, 
    //                 protocol: "UDP"
    //             });

    //             let upstreamNameTcp = `${allServices[i].externalServiceName}.${allServices[i].namespace}-${allServices[i].virtualPort}-tcp`;
    //             portTransportServers.push({
    //                 fileName: `${upstreamNameTcp}.yaml`,
    //                 content: {
    //                     apiVersion: "k8s.nginx.org/v1alpha1",
    //                     kind: "TransportServer",
    //                     metadata: {
    //                         name: upstreamNameTcp
    //                     },
    //                     spec: {
    //                         listener: {
    //                             name: upstreamNameTcp,
    //                             protocol: "TCP"
    //                         },
    //                         upstreams: [
    //                             {
    //                                 name: upstreamNameTcp,
    //                                 service: allServices[i].externalServiceName,
    //                                 port: allServices[i].port
    //                             }
    //                         ],
    //                         action: {
    //                             pass: upstreamNameTcp
    //                         }
    //                     }
    //                 }
    //             });

    //             let upstreamNameUdp = `${allServices[i].externalServiceName}.${allServices[i].namespace}-${allServices[i].virtualPort}-udp`;
    //             portTransportServers.push({
    //                 fileName: `${upstreamNameUdp}.yaml`,
    //                 content: {
    //                     apiVersion: "k8s.nginx.org/v1alpha1",
    //                     kind: "TransportServer",
    //                     metadata: {
    //                         name: upstreamNameUdp
    //                     },
    //                     spec: {
    //                         listener: {
    //                             name: upstreamNameUdp,
    //                             protocol: "UDP"
    //                         },
    //                         upstreams: [
    //                             {
    //                                 name: upstreamNameUdp,
    //                                 service: allServices[i].externalServiceName,
    //                                 port: allServices[i].port
    //                             }
    //                         ],
    //                         upstreamParameters: {
    //                             udpRequests: 1,
    //                             udpResponses: 1
    //                         },
    //                         action: {
    //                             pass: upstreamNameUdp
    //                         }
    //                     }
    //                 }
    //             });
    //         }
    //     }

    //     // Write global config file
    //     let tmpFileName = null;
    //     while(tmpFileName == null){
    //         tmpFileName = shortid.generate();
    //         if(tmpFileName.indexOf("$") != -1 || tmpFileName.indexOf("@") != -1){
    //             tmpFileName = null;
    //         }
    //     }
    //     let globalConfigPath = path.join(process.env.VM_BASE_DIR, "workplaces", data.node.workspaceId.toString(), data.node.hostname, `${tmpFileName}.yaml`);
    //     try {
    //         console.log(YAML.stringify(globalConfig));
    //         fs.writeFileSync(globalConfigPath, YAML.stringify(globalConfig));
    //         await this.applyK8SYaml(globalConfigPath, data.ns, data.node);
    //     } catch (error) {
    //         console.log(error);
    //         throw error;
    //     } finally {
    //         if(fs.existsSync(globalConfigPath))
    //             fs.unlinkSync(globalConfigPath);
    //     }

    //     // Now write service ingress rules
    //     let hasErrors = false;
    //     for(let i=0; i<portTransportServers.length; i++) {
    //         let serviceIngressConfigPath = path.join(process.env.VM_BASE_DIR, "workplaces", data.node.workspaceId.toString(), data.node.hostname, portTransportServers[i].fileName);
    //         try {
    //             console.log(YAML.stringify(portTransportServers[i].content));
    //             fs.writeFileSync(serviceIngressConfigPath, YAML.stringify(portTransportServers[i].content));
    //             await this.applyK8SYaml(serviceIngressConfigPath, data.ns, data.node);
    //         } catch (error) {
    //             hasErrors = error;
    //         }
    //     }

    //     if(hasErrors) {
    //         throw hasErrors;
    //     }
    // }

    /**
     * requestUpdateClusterPodPresets
     * @param {*} topicSplit 
     * @param {*} ip 
     * @param {*} data 
     */
    static async requestUpdateClusterPodPresets(topicSplit, data) {
        try{
            let response = await this.mqttController.queryRequestResponse("api", "get_services_config", {});
            if(response.data.status != 200){
                throw new Error("Could not get services configs");
            }  

            let VCAPS = {};
            for(let i=0; i<data.allServices.length; i++) {
                if(!VCAPS[data.allServices[i].serviceName]) {
                    VCAPS[data.allServices[i].serviceName] = [];
                }

                let SERVICE_VCAPS = {
                    name: data.allServices[i].name
                };
                if(data.allServices[i].externalServiceName && data.allServices[i].externalServiceName.length > 0){
                    SERVICE_VCAPS.dns = `${data.allServices[i].externalServiceName}.${data.allServices[i].namespace}.svc.cluster.local`;
                }
                
                let serviceConfig = response.data.services[data.allServices[i].serviceName].versions.find(v => v.version == data.allServices[i].serviceVersion);
                if(serviceConfig && serviceConfig.vcap){
                    for(let envName in serviceConfig.vcap) {
                        if(serviceConfig.vcap[envName].indexOf("secret.") == 0){
                            let paramSplit = serviceConfig.vcap[envName].split(".");
                            paramSplit.shift();
                            let secretParamName = paramSplit.pop();
                            let secretName = paramSplit[0];

                            let secretResolvedName = secretName.split("${instance-name}").join(data.allServices[i].name);
                            
                            let output = await this.getK8SResourceValues(data.node, data.ns, "secret", secretResolvedName, `{.data.${secretParamName}}`, true);   
                            if(output.length == 1 && output[0].length > 0){
                                SERVICE_VCAPS[envName] = output[0];
                            }
                        }
                    }
                }
                VCAPS[data.allServices[i].serviceName].push(SERVICE_VCAPS);
            }
          
            let ppTemplate = YAML.parse(fs.readFileSync(path.join(process.cwd(), "resources", "k8s_templates/pod-preset.yaml"), 'utf8'));
            ppTemplate.spec.env[0].value = JSON.stringify(VCAPS);
          
            let yamlTmpPath = path.join(process.env.VM_BASE_DIR, "workplaces", data.node.workspaceId.toString(), data.node.hostname, `pp.yml`);
            fs.writeFileSync(yamlTmpPath, YAML.stringify(ppTemplate));
           
            try {
                let existingPp = await this.getK8SResources(data.node, data.ns, "podpreset", ["ws-vcap"]);   
                if(existingPp.length == 1){
                    await this.deleteK8SResource(data.node, data.ns, "podpreset", "ws-vcap");
                }
                await this.applyK8SYaml(yamlTmpPath, data.ns, data.node);
                
                this.mqttController.client.publish(`/mycloud/k8s/host/respond/${data.queryTarget}/${topicSplit[5]}/${topicSplit[6]}`, JSON.stringify({
                    status: 200,
                    task: "update cluster pod presets"
                }));
            } catch (error) {
                throw error;
            } finally {
                OSController.rmrf(yamlTmpPath);
            }
        } catch (error) {
            console.log("ERROR =>", error);
            this.mqttController.client.publish(`/mycloud/k8s/host/respond/${data.queryTarget}/${topicSplit[5]}/${topicSplit[6]}`, JSON.stringify({
                status: error.code ? error.code : 500,
                message: error.message,
                task: "update cluster pod presets",
                data: data
            }));
        }
    }

    /**
     * requestDeployK8SPersistantVolume
     * @param {*} topicSplit 
     * @param {*} ip 
     * @param {*} data 
     */
    static async requestDeployK8SPersistantVolume(topicSplit, ip, data) {
        try {
            let pvTemplate = YAML.parse(fs.readFileSync(path.join(process.cwd(), "resources", "k8s_templates", "persistant-volume.yaml"), 'utf8'));

            pvTemplate.metadata.name = data.pvName;
            pvTemplate.metadata.labels.app  = data.pvName;
            pvTemplate.spec.capacity.storage = `${data.size}Mi`;
            pvTemplate.spec.local.path = `/mnt/${data.volume.name}-${data.volume.secret}/${data.subFolderName}`;
            pvTemplate.spec.nodeAffinity.required.nodeSelectorTerms[0].matchExpressions[0].values = data.hostnames;
    
            let yamlTmpPath = path.join(process.env.VM_BASE_DIR, "workplaces", data.workspaceId.toString(), data.node.hostname, `pv.yml`);
            fs.writeFileSync(yamlTmpPath, YAML.stringify(pvTemplate));

            let r = await OSController.sshExec(data.node.ip, `mkdir -p ${pvTemplate.spec.local.path}`, true);
            if(r.code != 0) {
                console.log(r);
                throw new Error("Could not create folders");
            } 

            await this.applyK8SYaml(yamlTmpPath, data.ns, data.node);     
            this.mqttController.client.publish(`/mycloud/k8s/host/respond/${data.queryTarget}/${topicSplit[5]}/${topicSplit[6]}`, JSON.stringify({
                status: 200,
                task: "deploy persistant volume",
                data: data
            }));
        } catch (error) {
            console.log("ERROR 2 =>", error);
            this.mqttController.client.publish(`/mycloud/k8s/host/respond/${data.queryTarget}/${topicSplit[5]}/${topicSplit[6]}`, JSON.stringify({
                status: error.code ? error.code : 500,
                message: error.message,
                task: "deploy persistant volume",
                data: data
            }));
        }
    }

    /**
     * requestDeployK8SPersistantVolumeClaim
     * @param {*} topicSplit 
     * @param {*} ip 
     * @param {*} data 
     */
    static async requestDeployK8SPersistantVolumeClaim(topicSplit, ip, data) {
        try {
            let pvcTemplate = YAML.parse(fs.readFileSync(path.join(process.cwd(), "resources", "k8s_templates", "pvc-local.yaml"), 'utf8'));

            pvcTemplate.metadata.name = `${data.pvcName}`;
            pvcTemplate.spec.selector.matchLabels.app = `${data.pvName}`;
            pvcTemplate.spec.resources.requests.storage = `${data.size}`;

            // console.log(YAML.stringify(pvcTemplate));
            let yamlTmpPath = path.join(process.env.VM_BASE_DIR, "workplaces", data.workspaceId.toString(), data.node.hostname, `pvc.yml`);
            fs.writeFileSync(yamlTmpPath, YAML.stringify(pvcTemplate));
            await this.applyK8SYaml(yamlTmpPath, data.ns, data.node);     
            this.mqttController.client.publish(`/mycloud/k8s/host/respond/${data.queryTarget}/${topicSplit[5]}/${topicSplit[6]}`, JSON.stringify({
                status: 200,
                task: "deploy persistant volume claim",
                data: data
            }));
        } catch (error) {
            console.log("ERROR 3 =>", error);
            this.mqttController.client.publish(`/mycloud/k8s/host/respond/${data.queryTarget}/${topicSplit[5]}/${topicSplit[6]}`, JSON.stringify({
                status: error.code ? error.code : 500,
                message: error.message,
                task: "deploy persistant volume claim",
                data: data
            }));
        }
    }

    /**
     * requestRemoveK8SAllPvForVolume
     * @param {*} topicSplit 
     * @param {*} ip 
     * @param {*} data 
     */
    static async requestRemoveK8SAllPvForVolume(topicSplit, ip, data) {
        try {
            let r = await OSController.sshExec(data.node.ip, `ls /mnt/${data.volume.name}-${data.volume.secret}`, true);
            if(r.code != 0) {
                console.log(r);
                throw new Error("Could not list folders");
            } 
            let volumeDirs = [];
            r.stdout.split("\n").forEach((line, i) => {
                volumeDirs = volumeDirs.concat(line.split(" ").filter(o => o.length > 0).map(o => o.trim()));
            });

            for(let i=0; i<volumeDirs.length; i++) {
                console.log("Removing PV =>", `${volumeDirs[i]}-pv`);
                if(data.ns && data.ns == "*") {
                    let allPvs = await this.getK8SResources(data.node, "*", "pv");
                    for(let y=0; y<allPvs.length; y++) {
                        if(allPvs[y].NAME == `${volumeDirs[i]}-pv`){
                            await this.removePersistantVolume(`${volumeDirs[i]}-pv`, allPvs[y].NAMESPACE ? allPvs[y].NAMESPACE : "default", data.node);
                        }
                    }
                } else {
                    await this.removePersistantVolume(`${volumeDirs[i]}-pv`, data.ns, data.node);
                }
                await OSController.sshExec(data.node.ip, `rm -rf /mnt/${data.volume.name}-${data.volume.secret}/${volumeDirs[i]}`, true);
            }

            this.mqttController.client.publish(`/mycloud/k8s/host/respond/${data.queryTarget}/${topicSplit[5]}/${topicSplit[6]}`, JSON.stringify({
                status: 200,
                task: "remove all pv for volume",
                data: data
            }));
        } catch (error) {
            this.mqttController.client.publish(`/mycloud/k8s/host/respond/${data.queryTarget}/${topicSplit[5]}/${topicSplit[6]}`, JSON.stringify({
                status: error.code ? error.code : 500,
                message: error.message,
                task: "remove all pv for volume",
                data: data
            }));
        }
    }

    /**
     * requestRemoveK8SPersistantVolumeClaim
     * @param {*} topicSplit 
     * @param {*} ip 
     * @param {*} data 
     */
    static async requestRemoveK8SPersistantVolumeClaim(topicSplit, ip, data) {
        try {
            await this.removePersistantVolumeClaim(data.pvcName, data.ns, data.node);     
            
            this.mqttController.client.publish(`/mycloud/k8s/host/respond/${data.queryTarget}/${topicSplit[5]}/${topicSplit[6]}`, JSON.stringify({
                status: 200,
                task: "remove persistant volume claim",
                data: data
            }));
        } catch (error) {
            this.mqttController.client.publish(`/mycloud/k8s/host/respond/${data.queryTarget}/${topicSplit[5]}/${topicSplit[6]}`, JSON.stringify({
                status: error.code ? error.code : 500,
                message: error.message,
                task: "deploy persistant volume claim",
                data: data
            }));
        }
    }

    /**
     * requestRemoveK8SPersistantVolume
     * @param {*} topicSplit 
     * @param {*} ip 
     * @param {*} data 
     */
    static async requestRemoveK8SPersistantVolume(topicSplit, ip, data) {
        try {
            await this.removePersistantVolume(data.pvName, data.ns, data.node);     
            let r = await OSController.sshExec(data.node.ip, `rm -rf /mnt/${data.volume.name}-${data.volume.secret}/${data.subFolderName}`, true);
            if(r.code != 0) {
                console.log(r);
                throw new Error("Could not delete folders");
            } 
           
            this.mqttController.client.publish(`/mycloud/k8s/host/respond/${data.queryTarget}/${topicSplit[5]}/${topicSplit[6]}`, JSON.stringify({
                status: 200,
                task: "remove persistant volume",
                data: data
            }));
        } catch (error) {
            this.mqttController.client.publish(`/mycloud/k8s/host/respond/${data.queryTarget}/${topicSplit[5]}/${topicSplit[6]}`, JSON.stringify({
                status: error.code ? error.code : 500,
                message: error.message,
                task: "deploy persistant volume",
                data: data
            }));
        }
    }

    /**
     * grabConfigFile
     * @param {*} masterIp 
     * @param {*} workspaceId 
     */
    static async grabMasterConfigFile(masterIp, workspaceId) {
        let hash = null;
        while(hash == null){
            hash = shortid.generate().toLowerCase();
            if(hash.indexOf("$") != -1 || hash.indexOf("@") != -1){
                hash = null;
            }
        }
        let tmpFileName = path.join(process.env.VM_BASE_DIR, "workplaces", workspaceId.toString(), `${hash}.conf`);
        await OSController.fetchFileSsh(masterIp, tmpFileName, '/etc/kubernetes/admin.conf');

        return tmpFileName;
    }

    /**
     * deleteK8SResource
     * @param {*} masterNode 
     * @param {*} resource 
     * @param {*} name 
     */
    static async deleteK8SResource(masterNode, ns, resource, name) {
        await OSController.sshExec(masterNode.ip, `kubectl delete ${resource} ${name}${ns ? " --namespace=" + ns : ""}`, true, true);
    }

    /**
     * detatchWorker
     * @param {*} masterNode 
     * @param {*} workerNode 
     */
    static async detatchWorker(masterNode, workerNode) {
        await OSController.sshExec(masterNode.ip, `kubectl drain ${workerNode.hostname} --ignore-daemonsets --delete-local-data`);
        await OSController.sshExec(masterNode.ip, `kubectl delete node ${workerNode.hostname}`);
    }

    /**
     * taintMaster
     * @param {*} masterNode 
     */
    static async taintMaster(masterNode) {
        await OSController.sshExec(masterNode.ip, `kubectl taint nodes ${masterNode.hostname} ${masterNode.hostname}=DoNotSchedulePods:NoExecute`);
    }

    /**
     * untaintMaster
     * @param {*} masterNode
     */
    static async untaintMaster(masterNode) {
        await OSController.sshExec(masterNode.ip, `kubectl taint nodes ${masterNode.hostname} ${masterNode.hostname}:NoExecute-`);
    }

    /**
     * getK8SResources
     * @param {*} masterNode 
     * @param {*} resourceName 
     */
    static async getK8SResources(masterNode, ns, resourceName, resourceLabels, jsonOutput) {
        let nsString = "";
        if(ns == "*"){
            nsString = " --all-namespaces";
        } else if(ns){
            nsString = " --namespace=" + ns;
        }
        let cmd = `kubectl get ${resourceName}`;
        if(resourceLabels) {
            cmd += ` ${resourceLabels.join(' ')}`;
        }
        cmd = `${cmd}${nsString}${jsonOutput ? " -o=json":""}`;
        
        let r = await OSController.sshExec(masterNode.ip, cmd, true);
       
        if(r.code != 0) {
            if(resourceLabels && resourceLabels.length == 1 && r.stderr.indexOf("Error from server (NotFound):") != -1){
                return [];
            } else {
                console.log(r);
                throw new Error("Could not get resources on cluster");
            }
        } 

        if(jsonOutput){
            return JSON.parse(r.stdout);
        } else {
            if(r.stdout.toLowerCase().indexOf("no resources found") != -1){
                return [];
            }

            let responses = [];
            let headers = [];
            r.stdout.split("\n").forEach((line, i) => {
                if(i == 0) {
                    let _hNames = line.split("  ").filter(o => o.length > 0);
                    _hNames.forEach((n, z) => {
                        if(z == 0){
                            headers.push({"name": n.trim(), "pos": line.indexOf(`${n.trim()} `)});
                        } 
                        else if((z+1) == _hNames.length){
                            headers.push({"name": n.trim(), "pos": line.indexOf(` ${n.trim()}`)-1});
                        }
                        else {
                            headers.push({"name": n.trim(), "pos": line.indexOf(` ${n.trim()} `)-1});
                        }
                    });
                } else {
                    let pos = 0;
                    let lineData = {};
                    for(let y=0; y<headers.length; y++){
                        if(y+1 == headers.length){
                            lineData[headers[y].name] = line.substring(pos).trim();
                        } else {
                            lineData[headers[y].name] = line.substring(pos, headers[y+1].pos).trim();
                            pos = headers[y+1].pos;
                        }
                    }
                    responses.push(lineData);
                }
            });
            return responses;
        }
    }

    /**
     * getK8SResourceValues
     * @param {*} masterNode 
     * @param {*} ns 
     * @param {*} resourceName 
     * @param {*} resourceLabel 
     * @param {*} jsonPath 
     * @param {*} doBase64Decode 
     */
    static async getK8SResourceValues(masterNode, ns, resourceName, resourceLabel, jsonPath, doBase64Decode) {
        let nsString = "";
        if(ns == "*"){
            nsString = " --all-namespaces";
        } else if(ns){
            nsString = " --namespace=" + ns;
        }

        let cmd = `kubectl get ${resourceName} ${resourceLabel}${nsString} -o=jsonpath="${jsonPath}"${doBase64Decode ? " | base64 --decode":""}`;
        
        let r = await OSController.sshExec(masterNode.ip, cmd, true);
        if(r.code != 0) {
            console.log(r);
            throw new Error("Could not get resources on cluster");
        } 
        if(r.stdout.toLowerCase().indexOf("no resources found") != -1){
            return null;
        }

        return r.stdout.split("\n");
    }

    /**
     * applyK8SYaml
     * @param {*} yamlFilePath 
     * @param {*} node 
     */
    static async applyK8SYaml(yamlFilePath, ns, node) {
        try {
            await OSController.pushFileSsh(node.ip, yamlFilePath, `/root/${path.basename(yamlFilePath)}`);
            // Wait untill kubectl answers for 100 seconds max
            let attempts = 0;
            let success = false;
            while(!success && attempts <= 30){
                await _sleep(1000 * 5);
                
                let r = await OSController.sshExec(node.ip, `kubectl apply -f /root/${path.basename(yamlFilePath)}${ns ? " --namespace=" + ns:""}`, true);
                if(r.code == 0) {
                    success = true;
                } else {
                    if(r.stderr.indexOf("6443 was refused") != -1 || r.stderr.indexOf("handshake timeout") != -1){
                        attempts++;
                    } else {
                        console.log("applyK8SYaml =>", JSON.stringify(r, null, 4));
                        attempts = 31; // Jump out of loop
                    }            
                }
            }
            if(!success){
                throw new Error("Could not apply yaml resource on cluster");
            }
        } finally {
            await OSController.sshExec(node.ip, `rm -rf /root/${path.basename(yamlFilePath)}`, true);
        }
    }

    /**
     * kubectl
     * @param {*} command 
     * @param {*} node 
     */
    static async kubectl(command, node) {
        // Wait untill kubectl answers for 100 seconds max
        let attempts = 0;
        let success = false;
        while(!success && attempts <= 30){
            await _sleep(1000 * 5);
            
            let r = await OSController.sshExec(node.ip, command, true);
            if(r.code == 0) {
                success = true;
            } else {
                if(r.stderr.indexOf("6443 was refused") != -1){
                    attempts++;
                } else {
                    console.log(JSON.stringify(r, null, 4));
                    attempts = 31; // Jump out of loop
                }            
            }
        }
        if(!success){
            throw new Error("Could not execute command: " + command);
        }
    }

    /**
     * removePersistantVolume
     * @param {*} pvName 
     * @param {*} node 
     */
    static async removePersistantVolume(pvName, ns, node, ignoreErrors) {
        try {
            await OSController.waitUntilUp(node.ip);
            let r = await OSController.sshExec(node.ip, `kubectl get pv ${pvName}${ns ? " --namespace="+ns : ""}`, true);
            if(!ignoreErrors && r.code != 0) {
                console.log(r);
                throw new Error("Could not delete PV on cluster");
            } 
            if(r.code == 0 && r.stdout.toLowerCase().indexOf("no resources found") == -1){
                await this.kubectl(`kubectl patch pv ${pvName}${ns ? " --namespace="+ns : ""} -p '{"metadata": {"finalizers": null}}'`, node);
                await this.kubectl(`kubectl delete pv ${pvName}${ns ? " --namespace="+ns : ""} --grace-period=0 --force`, node);
            }
        } catch (error) {
            console.log(JSON.stringify(error, null, 4));
            throw new Error("Could not delete PV on cluster");
        }
    }

    /**
     * removePersistantVolumeClaim
     * @param {*} pvcName 
     * @param {*} node 
     */
    static async removePersistantVolumeClaim(pvcName, ns, node) {
        try {
            await OSController.waitUntilUp(node.ip);
            let r = await OSController.sshExec(node.ip, `kubectl get pvc ${pvcName}${ns ? " --namespace=" + ns:""}`, true);
            if(r.code != 0) {
                throw new Error("Could not delete PVC on cluster");
            } 
            if(r.stdout.toLowerCase().indexOf("no resources found") == -1){
                await this.kubectl(`kubectl delete pvc ${pvcName}${ns ? " --namespace=" + ns:""}`, node);
            }            
        } catch (error) {
            console.log(JSON.stringify(error, null, 4));
            throw new Error("Could not delete PVC on cluster");
        }
    }

    /**
     * getK8SState
     * @param {*} masterNode 
     */
    static async getK8SState(masterNode) {
        let nodeStates = await OSController.sshExec(masterNode.ip, `kubectl get nodes -o wide`);
        let lines = nodeStates.split("\n");
        lines.shift();
        return lines.map(l => {
            return (l.split(" ").filter(o => o.length > 0).map(o => o.replace("\r", "")));
        }).map(lArray => {
            return {
                "name": lArray[0],
                "type": (lArray[2].toLowerCase() == "master" ? "master" : "worker"),
                "state": lArray[1],
                "ip": lArray[5]
            }
        });
    }
}
TaskRuntimeController.ip = null;
module.exports = TaskRuntimeController;