const { AuthenticationService, JWTStrategy, AuthenticationBaseStrategy } = require('@feathersjs/authentication');
const { LocalStrategy } = require('@feathersjs/authentication-local');
const { expressOauth } = require('@feathersjs/authentication-oauth');
const { NotAuthenticated, GeneralError } = require('@feathersjs/errors');
const request = require("request");
const PermissionHelper = require("./lib/permission_helper");


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

/**
 * asyncRequest
 * @param {*} opt 
 */
let asyncRequest = (opt) => {
	return new Promise((resolve, reject) => {
		request(opt, (error, response, body) => {
			if(error) {
				reject(new GeneralError(error));
			} else if (response.statusCode == 401) {
				reject(new NotAuthenticated(new Error('Unauthorized')));
			} else if (response.statusCode != 200) {
				reject(new GeneralError(new Error('Unexpected error')));
			} else {
				resolve(JSON.parse(body));
			}
		});
	});
}

class KEYCLOAKStrategy extends AuthenticationBaseStrategy {
	/**
	 * authenticate
	 * @param {*} data 
	 */
	async authenticate(data) {
		let usersService = this.app.service('users');
		
		return new Promise(async (resolve, reject) => {
			const { email, password } = data;
			
			// Authenticate with Keycloak
			var jwtDecoded = null;
			let adminToken = null;
			try {
				jwtDecoded = await PermissionHelper.keycloakAuthenticate(email, password);
				adminToken = await PermissionHelper.adminKeycloakAuthenticate(this.app); 
			} catch (error) {
				reject(error);
			}

			// Look for user locally
			let existingUser = await usersService.find({
				paginate: false,
				query: {
					$limit: 1,
					email: jwtDecoded.email
				}
			});

			// Does not yet exist, create one
			if(existingUser.length == 0){
				let userAttributes = await PermissionHelper.getKeycloakUserAttributes(adminToken, jwtDecoded.email);

				// Make sure we have a user returned
				if(!userAttributes.accountId == undefined || userAttributes.accountId == null) {
					return reject(new GeneralError(new Error("User is known, but has no account ID attribute")));
				}

				try {
					// console.log(JSON.stringify(userDetailList, null, 4));
					// console.log(JSON.stringify(userRoles, null, 4));

					// Use the existing user or create new one.
					let user = await usersService.create({
						"email": jwtDecoded.email,
						"password": password,
						"accountId": parseInt(userAttributes.accountId)
					}, {
						_internalRequest: true
					});

					// Logged in
					resolve({
						authentication: { strategy: this.name },
						user
					});
				} catch (error) {
					reject(new GeneralError(error));
				}				
			} 
			// User exists, logged in
			else {
				existingUser[0].roles = jwtDecoded.resource_access["kubernetes-cluster"].roles;
				resolve({
					authentication: { strategy: this.name },
					user: existingUser[0]
				});
			}
		});
	}
}

module.exports = app => {
  const authentication = new AuthenticationService(app);

  authentication.register('jwt', new JWTStrategy());
  authentication.register('keycloak', new KEYCLOAKStrategy());
  authentication.register('local', new LocalStrategy());

  app.use('/authentication', authentication);
  app.configure(expressOauth());
};