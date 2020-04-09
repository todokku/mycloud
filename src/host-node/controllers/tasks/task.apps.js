const TaskRuntimeController = require('./task.runtime');
const TaskGlusterController = require('./task.gluster');
const TaskServicesController = require('./task.services');
const TaskVolumeController = require('./task.volume');

const OSController = require("../os/index");
const DBController = require("../db/index");
const shortid = require('shortid');
const path = require('path');
const fs = require('fs');
const extract = require('extract-zip');
shortid.characters('0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ$@');


// const ssh = new node_ssh();
let EngineController;

class TaskAppsController {
    
    /**
     * init
     */
    static init(parent, mqttController) {
        this.parent = parent;
        this.mqttController = mqttController;

        // Prepare the environment scripts
        if(process.env.CLUSTER_ENGINE == "virtualbox") {
            EngineController = require("./engines/vb/index");
        }
    }

    /**
     * _unzip
     * @param {*} zipFile 
     * @param {*} targetDir 
     */
    static _unzip(zipFile, targetDir) {
        return new Promise((resolve, reject) => {
            extract(zipFile, {dir: targetDir}, function (err) {
                if(err) {
                    return reject(err);
                }
                resolve();
            });
        });
    }

    /**
     * requestBuildPublishImage
     * @param {*} topicSplit 
     * @param {*} data 
     */
    static async requestBuildPublishImage(topicSplit, data) {
        let tmpZipFile = null;
        try {
            let org = await DBController.getOrgForWorkspace(data.node.workspaceId);
            let rPass = this.parent.decrypt(org.registryPass, org.bcryptSalt);
            let acc = await DBController.getAccountForOrg(org.id);
            
            this.mqttController.logEvent(data.socketId, "info", "Preparing build artefacts");

            let response = await this.mqttController.queryRequestResponse("api", "get_app_source_zip", {
                "zipPath": data.zipPath,
                "delete": true
            }, 1000 * 60 * 5);
            if(response.data.status != 200){
                this.mqttController.logEvent(data.socketId, "error", "An error occured while getching image files");
                throw new Error("Could not get app source zip file");
            }  
           
            tmpZipFile = path.join(require('os').homedir(), ".mycloud", path.basename(data.zipPath));
            await OSController.writeBinaryToFile(tmpZipFile, response.data.data);

            // this.mqttController.logEvent(data.socketId, "info", "Building image");
            await this.buildAndPushAppImage(data.node, tmpZipFile, data.imageName, data.imageVersion, org.name, acc.name, org.registryUser, rPass, (log, err) => {
                if(log){
                    this.mqttController.logEvent(data.socketId, "info", log);
                } else if(err) {
                    console.log("ERROR 1");
                    this.mqttController.logEvent(data.socketId, "error", err);
                }
            });

            this.mqttController.client.publish(`/mycloud/k8s/host/respond/${data.queryTarget}/${topicSplit[5]}/${topicSplit[6]}`, JSON.stringify({
                status: 200,
                task: "build image"
            }));

            // curl -k -X GET https://registry_user:registry_pass@192.168.0.98:5000/v2/_catalog
            // curl -k -X GET https://registry_user:registry_pass@192.168.0.98:5000/v2/oasis/sdfgsdfg/tags/list 
        } catch (error) {
            console.log("ERROR 9 =>", error);
            this.mqttController.client.publish(`/mycloud/k8s/host/respond/${data.queryTarget}/${topicSplit[5]}/${topicSplit[6]}`, JSON.stringify({
                status: error.code ? error.code : 500,
                message: error.message,
                task: "build image"
            }));
        } finally {
            if(fs.existsSync(tmpZipFile)){
                OSController.rmrf(tmpZipFile);
            }
        }
    }

    /**
     * requestGetOrgRegistryImages
     * @param {*} topicSplit 
     * @param {*} data 
     */
    static async requestGetOrgRegistryImages(topicSplit, data) {
        try {
            let org = await DBController.getOrgForWorkspace(data.node.workspaceId);
            let rPass = this.parent.decrypt(org.registryPass, org.bcryptSalt);
            let acc = await DBController.getAccountForOrg(org.id);
            
            let r = await this.getRegistryImages(data.node, org.name, acc.name, org.registryUser, rPass);
           
            this.mqttController.client.publish(`/mycloud/k8s/host/respond/${data.queryTarget}/${topicSplit[5]}/${topicSplit[6]}`, JSON.stringify({
                status: 200,
                task: "list images",
                output: r
            }));
        } catch (error) {
            console.log("ERROR 9 =>", error);
            this.mqttController.client.publish(`/mycloud/k8s/host/respond/${data.queryTarget}/${topicSplit[5]}/${topicSplit[6]}`, JSON.stringify({
                status: error.code ? error.code : 500,
                message: error.message,
                task: "list images"
            }));
        }
    }

    /**
     * requestDeleteRegistryImages
     * @param {*} topicSplit 
     * @param {*} data 
     */
    static async requestDeleteRegistryImages(topicSplit, data) {
        try {
            let org = await DBController.getOrgForWorkspace(data.node.workspaceId);
            let rPass = this.parent.decrypt(org.registryPass, org.bcryptSalt);
            
            await this.deleteRegistryImage(data.node, data.imageName, org.registryUser, rPass);
           
            this.mqttController.client.publish(`/mycloud/k8s/host/respond/${data.queryTarget}/${topicSplit[5]}/${topicSplit[6]}`, JSON.stringify({
                status: 200,
                task: "delete images"
            }));
        } catch (error) {
            console.log("ERROR 9 =>", error);
            this.mqttController.client.publish(`/mycloud/k8s/host/respond/${data.queryTarget}/${topicSplit[5]}/${topicSplit[6]}`, JSON.stringify({
                status: error.code ? error.code : 500,
                message: error.message,
                task: "delete images"
            }));
        }
    }

    /**
     * buildAndPushAppImage
     * @param {*} node 
     * @param {*} zipPath 
     */
    static async buildAndPushAppImage(node, tmpZipFile, imageName, imageVersion, orgName, accountName, rUser, rPass, cb) {
        // Prepare paths
        let folderName = path.basename(tmpZipFile);
        folderName = folderName.substring(0, folderName.lastIndexOf("."));
        let zipPath = path.join("/root", path.basename(tmpZipFile));
        let folderPath = path.join(path.join("/root", folderName));
       
        await OSController.pushFileSsh(node.ip, tmpZipFile, zipPath);

        await OSController.sshExec(node.ip, `printf "${rPass}" | docker login registry.mycloud.org --username ${rUser} --password-stdin`);

        let buildDone = false;
        try {
            let outputArray = await OSController.sshExec(node.ip, [
                `mkdir -p ${folderPath}`,
                `unzip ${zipPath} -d ${folderPath}`
            ]);
            let error = outputArray.find(o => o.code != 0);
            if(error){
                throw new Error(error.stderr);
            }
            await OSController.feedbackSshExec(node.ip, `docker build -t ${imageName}:${imageVersion} ${folderPath}`, cb);
            buildDone = true;
            await OSController.feedbackSshExec(node.ip, `docker tag ${imageName}:${imageVersion} registry.mycloud.org/${accountName}/${orgName}/${imageName}:${imageVersion}`, cb);
            await OSController.feedbackSshExec(node.ip, `docker push registry.mycloud.org/${accountName}/${orgName}/${imageName}:${imageVersion}`, cb);
        } finally {
            try {
                if(buildDone){
                    await OSController.sshExec(node.ip, 
                        `docker image rm registry.mycloud.org/${accountName}/${orgName}/${imageName}:${imageVersion}`
                    );
                }
                await OSController.sshExec(node.ip, `rm -rf ${folderPath}`);
                await OSController.sshExec(node.ip, `rm -rf ${zipPath}`);
            } catch (_e) {}
        }
    }

    /**
     * deleteRegistryImage
     * @param {*} node 
     * @param {*} imageName 
     * @param {*} rUser 
     * @param {*} rPass 
     */
    static async deleteRegistryImage(node, imageName, rUser, rPass) {
        await OSController.sshExec(node.ip, `printf "${rPass}" | docker login registry.mycloud.org --username ${rUser} --password-stdin`);
        let tagsResponse = await OSController.sshExec(node.ip, `curl -k -X GET https://${rUser}:${rPass}@registry.mycloud.org/v2/${imageName}/tags/list`);
        tagsResponse = JSON.parse(tagsResponse);

        let etag = await OSController.sshExec(node.ip, `curl -k -sSL -I -H "Accept: application/vnd.docker.distribution.manifest.v2+json" "https://${rUser}:${rPass}@registry.mycloud.org/v2/${imageName}/manifests/${tagsResponse.tags[0]}" | awk '$1 == "Docker-Content-Digest:" { print $2 }' | tr -d $'\r'`, true);
        if(etag.code != 0){
            throw new Error("Could not delete image");
        }
        etag = etag.stdout;
        
        if(etag.indexOf("sha256:") != 0){
            throw new Error("Could not delete image");
        }

        let result = await OSController.sshExec(node.ip, `curl -k -v -sSL -X DELETE "https://${rUser}:${rPass}@registry.mycloud.org/v2/${imageName}/manifests/${etag}"`, true);
        if(result.code != 0){
            throw new Error("Could not delete image");
        }

        await OSController.sshExec(process.env.REGISTRY_IP, `docker exec -t docker-registry bin/registry garbage-collect /etc/docker/registry/config.yml`, true);
        await OSController.sshExec(process.env.REGISTRY_IP, `docker exec -t --privileged docker-registry rm -rf /var/lib/registry/docker/registry/v2/repositories/${imageName}`, true);
    }

    /**
     * getRegistryImages
     * @param {*} node 
     * @param {*} orgName 
     * @param {*} accountName 
     * @param {*} rUser 
     * @param {*} rPass 
     */
    static async getRegistryImages(node, orgName, accountName, rUser, rPass) {
        await OSController.sshExec(node.ip, `printf "${rPass}" | docker login registry.mycloud.org --username ${rUser} --password-stdin`);
        let result = await OSController.sshExec(node.ip, `curl -k -X GET https://${rUser}:${rPass}@registry.mycloud.org/v2/_catalog`);
        result = JSON.parse(result);
        let repos = result.repositories.filter(o => o.indexOf(`${accountName}/${orgName}/`) == 0);
        let tagCommands = repos.map(o => `curl -k -X GET https://${rUser}:${rPass}@registry.mycloud.org/v2/${o}/tags/list`);
        let allTags = await OSController.sshExec(node.ip, tagCommands, true, true);
        allTags = allTags.map(o => JSON.parse(o.stdout));
        return allTags;
    }
}
TaskAppsController.ip = null;
module.exports = TaskAppsController;