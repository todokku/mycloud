const { AuthenticationService, JWTStrategy, AuthenticationBaseStrategy } = require('@feathersjs/authentication');
const { LocalStrategy } = require('@feathersjs/authentication-local');
const { expressOauth } = require('@feathersjs/authentication-oauth');
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
		let settingsService = this.app.service('settings');

		return new Promise(async (resolve, reject) => {
			const { email, password } = data;
			
			// Authenticate with Keycloak
			let _o = JSON.parse(JSON.stringify(authOptions));
			_o.form.username = email;
			_o.form.password = password;

			let response = null;
			try {
				response = await asyncRequest(_o); // If unauthorized, an exception is thrown here
			} catch (error) {
				return reject(error);
			}

			let jwtToken = response.access_token;
			var jwtDecoded = jwtDecode(jwtToken);
			
			// Make sure we have roles for this user
			if(!jwtDecoded.resource_access["kubernetes-cluster"]) {
				return reject(new GeneralError(new Error("This user does not have proper roles configured")));
			}

			// Get keycloak secret from DB
			let keycloakSecret = await settingsService.find({
				paginate: false,
				query: {
					$or: [
						{ key: "KEYCLOAK_SECRET" }
					]
				},
				_internalRequest: true
			});

			if(keycloakSecret.length != 1){
				return reject(new GeneralError(new Error("Keycloak secret not known")));
			}

			// Authenticate admin
			_o = JSON.parse(JSON.stringify(authOptions));
			_o.form['grant_type'] = `client_credentials`;
			_o.form['client_id'] = `master-realm`;
			_o.form['client_secret'] = keycloakSecret.find(o => o.key == "KEYCLOAK_SECRET").value;
			_o.form['scope'] = `openid`;
			let adminResponse = null;
			try {
				adminResponse = await asyncRequest(_o); 
			} catch (error) {
				return reject(error);
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
				let userRoles = jwtDecoded.resource_access["kubernetes-cluster"].roles;

				// Get user attributes
				_o = JSON.parse(JSON.stringify(queryOptions));
				_o.url += `/users?email=${jwtDecoded.email}`;
				_o.method = "GET";
				_o.headers['Authorization'] = `Bearer ${adminResponse.access_token}`;
				let userDetailList = await asyncRequest(_o);

				// Make sure we have a user returned
				if(userDetailList.length != 1) {
					return reject(new GeneralError(new Error("Account not found")));
				} else if(!userDetailList[0].attributes || userDetailList[0].attributes.accountId == undefined || userDetailList[0].attributes.accountId == null) {
					return reject(new GeneralError(new Error("User is known, but has no account ID attribute")));
				}

				try {
					// console.log(JSON.stringify(userDetailList, null, 4));
					// console.log(JSON.stringify(userRoles, null, 4));

					// Use the existing user or create new one.
					let user = await usersService.create({
						"email": jwtDecoded.email,
						"password": password,
						"accountId": parseInt(userDetailList[0].attributes.accountId)
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