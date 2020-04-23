const DBController = require('../db/index');
const Keycloak = require('../keycloak/index');

const shortid = require('shortid');
shortid.characters('0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ$@');

class TaskKeycloakController {

    /**
     * init
     */
    static init(parent, mqttController) {
        this.parent = parent;
        this.mqttController = mqttController;
    }

    /**
     * processScheduledCreateGroups
     * @param {*} task 
     */
    static async processScheduledCreateGroups(task) {
        task.payload = JSON.parse(task.payload);
        
        try {
            await DBController.updateTaskStatus(task,"IN_PROGRESS", {
                "type":"INFO",
                "step":"CREATE_GROUPS",
                "component": "task-controller",
                "ts":new Date().toISOString()
            });

            let adminToken = await Keycloak.adminAuthenticate();
            let parentId = await Keycloak.createClusterGroupBase(adminToken, task.payload[0].params.groupBase);
            for(let i=0; i<task.payload[0].params.groups.length; i++) {
                await Keycloak.createClusterGroup(adminToken, parentId, null, task.payload[0].params.groups[i]);
            }

            await DBController.updateTaskStatus(task, "DONE", {
                "type":"INFO",
                "step":"CREATE_GROUPS",
                "component": "task-controller",
                "ts":new Date().toISOString()
            });   
        } catch (error) {
            console.log(error);
            await DBController.updateTaskStatus(task,"ERROR", {
                "type":"ERROR",
                "step":"CREATE_GROUPS",
                "component": "task-controller",
                "message":error.message,
                "ts":new Date().toISOString()
            });
        }
    }

    /**
     * processScheduledCleanupGroups
     * @param {*} task 
     */
    static async processScheduledCleanupGroups(task) {
        task.payload = JSON.parse(task.payload);
        
        try {
            await DBController.updateTaskStatus(task,"IN_PROGRESS", {
                "type":"INFO",
                "step":"CLEANUP_GROUPS",
                "component": "task-controller",
                "ts":new Date().toISOString()
            });

            let adminToken = await Keycloak.adminAuthenticate();
            console.log(1);
            await Keycloak.removeClusterBaseGroupsFromAllUsers(adminToken, task.payload[0].params.groupBase);
            console.log(1);
            await Keycloak.deleteClusterBaseGroup(adminToken, task.payload[0].params.groupBase);
            console.log(1);
          
            await DBController.updateTaskStatus(task, "DONE", {
                "type":"INFO",
                "step":"CLEANUP_GROUPS",
                "component": "task-controller",
                "ts":new Date().toISOString()
            });   
        } catch (error) {
            console.log(error);
            await DBController.updateTaskStatus(task,"ERROR", {
                "type":"ERROR",
                "step":"CLEANUP_GROUPS",
                "component": "task-controller",
                "message":error.message,
                "ts":new Date().toISOString()
            });
        }
    }

}
module.exports = TaskKeycloakController;