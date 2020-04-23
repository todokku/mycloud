const Keycloak = require('../../lib/keycloak');

class TaskKeycloakController {

    /**
     * init
     */
    static init(parent, app, mqttController) {
        this.parent = parent;
        this.app = app;
        this.mqttController = mqttController;
    }

    /**
     * processScheduledCreateGroups
     * @param {*} task 
     */
    static async getAvailableClusterGroups(data, params) {
        try {
            let adminToken = await Keycloak.adminAuthenticate(this.app);
            let groups = await Keycloak.getAvailableClusterGroups(adminToken, `${data.accName}-${data.orgName}-${data.wsName}`);

            return { "code": 200, "data": groups };
        } catch (error) {
            console.log(error);
            return { "code": 500 };
        }


    }
}
module.exports = TaskKeycloakController;