const { authenticate } = require('@feathersjs/authentication').hooks;
const Permissions = require('../../lib/permission_helper.js');
const { Forbidden } = require('@feathersjs/errors');

module.exports = {
	before: {
		all: [],
		find: [
			async context => {
				console.log("BEFORE =>", context.params);
				return context;
			}
		],
		get: [
			async context => {
				if(await Permissions.isSysAdmin(context) || context.params._internalRequest){
					delete context.params._internalRequest;
					return context;
				} else if(!(await Permissions.isAccountOwner(context))){
					throw new Forbidden(new Error('You need to be an account owner to perform this task'));
				}
				return context;
			}
		],
		create: [],
		update: [
			async context => {
				if(await Permissions.isSysAdmin(context) || context.params._internalRequest){
					delete context.params._internalRequest;
					return context;
				} else if(!(await Permissions.isAccountOwner(context))){
					throw new Forbidden(new Error('You need to be an account owner to perform this task'));
				}
				return context;
			}
		],
		patch: [
			async context => {
				if(await Permissions.isSysAdmin(context) || context.params._internalRequest){
					delete context.params._internalRequest;
					return context;
				} else if(!(await Permissions.isAccountOwner(context))){
					throw new Forbidden(new Error('You need to be an account owner to perform this task'));
				}
				return context;
			}
		],
		remove: [
			async context => {
				if(await Permissions.isSysAdmin(context) || context.params._internalRequest){
					delete context.params._internalRequest;
					return context;
				} else if(!(await Permissions.isAccountOwner(context))){
					throw new Forbidden(new Error('You need to be an account owner to perform this task'));
				}
				return context;
			}
		]
	},

	after: {
		all: [],
		find: [async context => {
			// Is user is sysadmin, return it all
			if(await Permissions.isSysAdmin(context) || context.params._internalRequest){
				delete context.params._internalRequest;
				return context;
			}


			try {
				
			

			let accUsers = await context.app.service('acc-users').find({
				query: {
					userId: context.params.user.id
				},
				user: context.params.user,
				_internalRequest: true
			});
		
			// Itterate over all returned organizations
			context.result.data = context.result.data.filter((acc, z) => {
				return accUsers.find(o => o.accountId == acc.accountId);
			});
			
			context.result.total = context.result.data.length;
		} catch (error) {
				console.log(error);
		}
			return context;
		}],
		get: [],
		create: [],
		update: [],
		patch: [],
		remove: []
	},

	error: {
		all: [],
		find: [],
		get: [],
		create: [],
		update: [],
		patch: [],
		remove: []
	}
};
