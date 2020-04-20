const { AuthenticationService, JWTStrategy, AuthenticationBaseStrategy } = require('@feathersjs/authentication');
const { LocalStrategy } = require('@feathersjs/authentication-local');
const { expressOauth } = require('@feathersjs/authentication-oauth');
const { NotAuthenticated, GeneralError, NotFound } = require('@feathersjs/errors');
const PermissionHelper = require("./lib/permission_helper");

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
				jwtDecoded = await PermissionHelper.keycloakAuthenticate(email, password, true);
				adminToken = await PermissionHelper.adminKeycloakAuthenticate(this.app); 
			
		
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
					let error = new Error('Unknown user');
					error.statusCode = 401;
					err.code = 401;
				
					return reject(new NotAuthenticated(error));

					// let userAttributes = await PermissionHelper.getKeycloakUserAttributes(adminToken, jwtDecoded.email);

					// // Make sure we have a user returned
					// if(!userAttributes.accountId == undefined || userAttributes.accountId == null) {
					// 	return reject(new GeneralError(new Error("User is known, but has no account ID attribute")));
					// }

					// try {
					// 	// console.log(JSON.stringify(userDetailList, null, 4));
					// 	// console.log(JSON.stringify(userRoles, null, 4));

					// 	// Use the existing user or create new one.
					// 	let user = await usersService.create({
					// 		"email": jwtDecoded.email,
					// 		"password": password,
					// 		"accountId": parseInt(userAttributes.accountId)
					// 	}, {
					// 		_internalRequest: true
					// 	});

					// 	// Logged in
					// 	resolve({
					// 		authentication: { strategy: this.name },
					// 		user
					// 	});
					// } catch (error) {
					// 	reject(new GeneralError(error));
					// }				
				} 
				// User exists, logged in
				else {
					let loggedInUser = existingUser[0];
					loggedInUser.roles = jwtDecoded.resource_access["kubernetes-cluster"] ? jwtDecoded.resource_access["kubernetes-cluster"].roles : [];


					console.log(JSON.stringify(loggedInUser, null, 4));


					resolve({
						authentication: { strategy: this.name },
						user: loggedInUser
					});
				}
			} catch (error) {
				return reject(error);
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