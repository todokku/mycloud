const { Forbidden, NotFound } = require('@feathersjs/errors');
const { NotAuthenticated, GeneralError } = require('@feathersjs/errors');
var request = require("request");
var jwtDecode = require('jwt-decode');

var authOptions = {
	method: 'POST',
	url: 'https://mycloud.keycloak.com/auth/realms/master/protocol/openid-connect/token',
	headers: {'Content-Type': 'application/x-www-form-urlencoded'},
	form: {
		grant_type: 'password',
		client_id: 'kubernetes-cluster'
	},
	strictSSL: false
};
var queryOptions = {
	method: 'GET',
	url: 'https://mycloud.keycloak.com/auth/admin/realms/master',
	headers: {'Content-Type': 'application/x-www-form-urlencoded'},
	strictSSL: false
};

var createUserOptions = {
	method: 'POST',
	url: 'https://mycloud.keycloak.com/auth/admin/realms/master/users',
	headers: {'Content-Type': 'application/json', 'Accept': 'application/json'},
	strictSSL: false
};

class PermissionHelper {

    /**
     * asyncRequest
     * @param {*} opt 
     */
    static asyncRequest(opt) {
        return new Promise((resolve, reject) => {
            request(opt, (error, response, body) => {
                if(error) {
                    reject(new GeneralError(error));
                } else if (response.statusCode == 401) {
                    reject(new NotAuthenticated(new Error('Unauthorized')));
                } else if (response.statusCode < 200 || response.statusCode > 299) {
                    reject(new GeneralError(new Error("Unexpected error")));
                } else {
                    resolve(JSON.parse(body));
                }
            });
        });
    }

    /**
     * keycloakAuthenticate
     * @param {*} email 
     * @param {*} password 
     */
    static async keycloakAuthenticate(email, password, ignoreMissingRoles) {
        // Authenticate with Keycloak
        let _o = JSON.parse(JSON.stringify(authOptions));
        _o.form.username = email;
        _o.form.password = password;

        let response = await this.asyncRequest(_o); // If unauthorized, an exception is thrown here

        let jwtToken = response.access_token;
        var jwtDecoded = jwtDecode(jwtToken);

        // Make sure we have roles for this user
        if(!ignoreMissingRoles && !jwtDecoded.resource_access["kubernetes-cluster"]) {
            throw new GeneralError(new Error("This user does not have proper roles configured"));
        }
		return jwtDecoded;
    }

    /**
     * adminKeycloakAuthenticate
     * @param {*} app 
     */
    static async adminKeycloakAuthenticate(app) {
        // Get keycloak secret from DB
        let keycloakSecret = await app.service('settings').find({
            paginate: false,
            query: {
                $or: [
                    { key: "KEYCLOAK_SECRET" }
                ]
            },
            _internalRequest: true
        });

        if(keycloakSecret.length != 1){
            throw new GeneralError(new Error("Keycloak secret not known"));
        }

        // Authenticate admin
        let _o = JSON.parse(JSON.stringify(authOptions));
        _o.form['grant_type'] = `client_credentials`;
        _o.form['client_id'] = `master-realm`;
        _o.form['client_secret'] = keycloakSecret.find(o => o.key == "KEYCLOAK_SECRET").value;
        _o.form['scope'] = `openid`;
        let response = await this.asyncRequest(_o); 
        return response.access_token;
    }

    /**
     * getKeycloakUserAttributes
     * @param {*} adminAccessToken 
     * @param {*} email 
     */
    static async getKeycloakUserAttributes(adminAccessToken, email) {
        // Get user attributes
        let _o = JSON.parse(JSON.stringify(queryOptions));
        _o.url += `/users?email=${email}`;
        _o.method = "GET";
        _o.headers['Authorization'] = `Bearer ${adminAccessToken}`;
        let userDetailList = await this.asyncRequest(_o);

        if(userDetailList.length != 1) {
            throw new GeneralError(new Error("User not found"));
        } else if(!userDetailList[0].attributes) {
            return {};
        } else {
            return userDetailList[0].attributes;
        }
    }

    /**
     * keycloakUserExists
     * @param {*} adminAccessToken 
     * @param {*} email 
     */
    static async getKeycloakUserByEmail(adminAccessToken, email) {
        // Get user attributes
        let _o = JSON.parse(JSON.stringify(queryOptions));
        _o.url += `/users?email=${email}`;
        _o.method = "GET";
        _o.headers['Authorization'] = `Bearer ${adminAccessToken}`;
        let users = await this.asyncRequest(_o);
        console.log(users);
        if(users .length == 1) {
            return users[0];
        } else {
            return null;
        }
    }

    /**
     * createKeycloakUser
     * @param {*} adminAccessToken 
     * @param {*} email 
     * @param {*} password 
     */
    static async createKeycloakUser(adminAccessToken, email, password) {
        let _o = JSON.parse(JSON.stringify(createUserOptions));
        _o.headers['Authorization'] = `Bearer ${adminAccessToken}`;
        _o.json = { 
            "username": email, 
            "email": email, 
            "enabled": true, 
            "credentials":[{ "type": "password", "value": password, "temporary": false }]
        };
        let response = await this.asyncRequest(_o);

        console.log(response);
    }

    /**
     * isSysAdmin
     * @param {*} context 
     */
    static async isSysAdmin(context) {
        if(!context.params.user){
            return false;
        }

        // console.log(context.params.user);

        if(context.params.user.roles && context.params.user.roles.find("mc-sysadmin") != -1){
            return true;
        } 
        return false;
    }

    /**
     * isAccountOwner
     * @param {*} context 
     */
    static async isAccountOwner(context) {
        if(!context.params.user){
            return false;
        }
        // if(context.params.user.roles.find("mc-account-owner") != -1){
        //     return true;
        // }
        return false;
    }

    /**
     * userBelongsToAccount_org
     * @param {*} context 
     * @param {*} orgId 
     */
    static async userBelongsToAccount_org(context, orgId) {
        if(!context.params.user){
            throw new Forbidden(new Error('You are not logged in'));
        }
        // Make sure user account matches org account
        try{
            context.params._internalRequest = true;
            let org = await context.app.service('organizations').get(orgId, context.params);
            if(org.accountId != context.params.user.accountId){
                throw new Forbidden(new Error('This organization does not belong to your account'));
            }
        } catch(err) {
            if(err.code == 404){
                throw new NotFound(new Error ("Organization not found"));
            }
            throw err;
        }
    }

    /**
     * isAccountOwnerAllowed_ws
     * @param {*} context 
     * @param {*} wsId 
     */
    static async isAccountOwnerAllowed_ws(context, wsId) {
        let adminUserOrgs = await this.getAccountOwnerOrganizations(context);
        let orgIdArray = adminUserOrgs.data.map(o => o.id);
        context.params._internalRequest = true;
        let targetWs = await context.app.service('workspaces').get(wsId, context.params);
        if(orgIdArray.indexOf(targetWs.organizationId) != -1){
            return true;
        } else {
            return false;
        }
    }

    /**
     * isOrgUserAllowed_ws
     * @param {*} context 
     * @param {*} wsId 
     */
    static async isOrgUserAllowed_ws(context, wsId) {
        let orgUsers = await context.app.service('org-users').find({
            query: {
                userId: context.params.user.id
            },
            user: context.params.user
        });

        context.params._internalRequest = true;
        let targetWs = await context.app.service('workspaces').get(wsId, context.params);

        for(let i=0; i<orgUsers.data.length; i++){
            if(orgUsers.data[i].organizationId == targetWs.organizationId) {
                return true;
            }
        }
        return false;
    }

    /**
     * isOrgUserAdmin_ws
     * @param {*} context 
     * @param {*} orgId 
     */
    static async isOrgUserAdmin_ws(context, orgId) {
        let orgUsers = await context.app.service('org-users').find({
            query: {
                userId: context.params.user.id
            },
            user: context.params.user
        });

        for(let i=0; i<orgUsers.data.length; i++){
            if(orgUsers.data[i].organizationId == orgId && orgUsers.data[i].permissions.split(";").indexOf("ORG_ADMIN") != -1) {
                return true;
            }
        }
        return false;
    }

    /**
     * getAccountOwnerOrganizations
     * @param {*} context 
     */
    static async getAccountOwnerOrganizations(context) {
        if(!context.params.user){
            return [];
        }
        try{
            context.params._internalRequest = true;
            return await context.app.service('organizations').find({
				query: {
					accountId: context.params.user.accountId
                },
                user: context.params.user
            });
        } catch(err) {
            if(err.code == 404){
                throw new NotFound(new Error ("Organization not found"));
            }
            throw err;
        }
    }
}
PermissionHelper.roles = null;
module.exports = PermissionHelper;