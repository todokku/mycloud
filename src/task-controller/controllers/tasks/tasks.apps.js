const DBController = require('../db/index');

const shortid = require('shortid');
shortid.characters('0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ$@');

class TaskAppsController {

    /**
     * init
     */
    static init(parent, mqttController) {
        this.parent = parent;
        this.mqttController = mqttController;
    }

    /**
     * processScheduledDeployAppImage
     * @param {*} task 
     */
    static async processScheduledDeployAppImage(task) {
        task.payload = JSON.parse(task.payload);
        try {
            await DBController.updateTaskStatus(task, "IN_PROGRESS", {
                "type":"INFO",
                "step":"DEPLOY_IMAGE",
                "component": "task-controller",
                "ts":new Date().toISOString()
            });

            await this.buildImage(task.payload[0].socketId, task.targetId, task.payload[0].params.appZipPath, task.payload[0].params.image, task.payload[0].params.version);

            await DBController.updateTaskStatus(task, "DONE", {
                "type":"INFO",
                "step":"DEPLOY_IMAGE",
                "component": "task-controller",
                "ts":new Date().toISOString()
            });   
        } catch (error) {
            console.log("ERROR 6 => ", error);
            await DBController.updateTaskStatus(task, "ERROR", {
                "type":"ERROR",
                "step":"DEPLOY_IMAGE",
                "component": "task-controller",
                "message":error.message,
                "ts":new Date().toISOString()
            });
        } finally {
            this.mqttController.closeEventStream(task.payload[0].socketId);
        }
    }

    /**
     * processScheduledDeleteAppImage
     * @param {*} task 
     */
    static async processScheduledDeleteAppImage(task) {
        task.payload = JSON.parse(task.payload);
        try {
            await DBController.updateTaskStatus(task, "IN_PROGRESS", {
                "type":"INFO",
                "step":"DELETE_IMAGE",
                "component": "task-controller",
                "ts":new Date().toISOString()
            });

            await this.deleteImage(task.targetId, task.payload[0].params.image);

            await DBController.updateTaskStatus(task, "DONE", {
                "type":"INFO",
                "step":"DELETE_IMAGE",
                "component": "task-controller",
                "ts":new Date().toISOString()
            });   
        } catch (error) {
            console.log("ERROR 6 => ", error);
            await DBController.updateTaskStatus(task, "ERROR", {
                "type":"ERROR",
                "step":"DELETE_IMAGE",
                "component": "task-controller",
                "message":error.message,
                "ts":new Date().toISOString()
            });
        }
    }

    /**
     * buildImage
     * @param {*} socketId 
     * @param {*} workspaceId 
     * @param {*} zipPath 
     * @param {*} imageName 
     * @param {*} imageVersion 
     */
    static async buildImage(socketId, workspaceId, zipPath, imageName, imageVersion) {
        // Collect workspace nodes and hosts
        let workspaceK8SNodes = await DBController.getAllK8sWorkspaceNodes(workspaceId);
        let allK8SHosts = await DBController.getAllK8sHosts();
        let node = workspaceK8SNodes.find(o => o.nodeType == "MASTER");
        let masterHost = allK8SHosts.find(h => h.id == node.k8sHostId);

        // Instruct node host to build and push image
        let response = await this.mqttController.queryRequestResponse(masterHost.ip, "build_publish_k8s_image", {
            "zipPath": zipPath,
            "imageName": imageName,
            "imageVersion": imageVersion,
            "node": node,
            "socketId": socketId
        }, 60 * 1000 * 15);
        
        if(response.data.status != 200){
            const error = new Error(response.data.message);
            error.code = response.data.status;
            throw error;
        }
    }

    /**
     * deleteImage
     * @param {*} workspaceId 
     * @param {*} imageNameAndTag 
     */
    static async deleteImage(workspaceId, imageName) {
        // Collect workspace nodes and hosts
        let workspaceK8SNodes = await DBController.getAllK8sWorkspaceNodes(workspaceId);
        let allK8SHosts = await DBController.getAllK8sHosts();
        let node = workspaceK8SNodes.find(o => o.nodeType == "MASTER");
        let masterHost = allK8SHosts.find(h => h.id == node.k8sHostId);

        // Instruct node host to build and push image
        let response = await this.mqttController.queryRequestResponse(masterHost.ip, "delete_k8s_image", {
            "imageName": imageName,
            "node": node
        }, 60 * 1000 * 15);
        
        if(response.data.status != 200){
            const error = new Error(response.data.message);
            error.code = response.data.status;
            throw error;
        }
    }
}
TaskAppsController.pendingResponses = {};
TaskAppsController.bussyTaskIds = [];
module.exports = TaskAppsController;