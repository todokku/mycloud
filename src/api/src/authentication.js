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
			console.log(1);
			// Authenticate with Keycloak
			var jwtDecoded = null;
			let adminToken = null;
			try {
				jwtDecoded = await PermissionHelper.keycloakAuthenticate(email, password);
				adminToken = await PermissionHelper.adminKeycloakAuthenticate(this.app); 
			} catch (error) {
				reject(error);
			}
			console.log(1);
			// Look for user locally
			let existingUser = await usersService.find({
				paginate: false,
				query: {
					$limit: 1,
					email: jwtDecoded.email
				}
			});
			console.log(1);
			// Does not yet exist, create one
			if(existingUser.length == 0){
				console.log(2);
				let error = new Error('Unknown user');
                error.statusCode = 401;
                err.code = 401;
			
				reject(new NotAuthenticated(error));

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
				console.log(3);
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