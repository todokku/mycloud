import {flags} from '@oclif/command'
import Command from '../../../base'

export default class OrganizationUserList extends Command {
	static description = 'get organizations for your account'
	
	static flags = {
		help: flags.help({char: 'h'})
	}

	/**
	 * run
	 */
	async run() {
		let users = await this.api("organization", {
			method: "get_users"
		});
		if(!this.handleError(users)){
			return;
		}

		let usersGroups = await this.api("organization", {
			method: "get_groups_for_users",
			data: {
				emails: users.data.map((o: { user: { email: any; }; }) => o.user.email)
			}
		});
		if(!this.handleError(usersGroups)){
			return;
		}

		console.log(JSON.stringify(users, null, 4));
		console.log(JSON.stringify(usersGroups, null, 4));

		// if(result.code == 200){
		// 	if(result.data.length == 0) {
		// 		this.log("There are currently no organizations");
		// 	} else {
		// 		this.log("Org name", "blue");
		// 		result.data.forEach((o:any) => {
		// 			this.log(o.name);
		// 		});
		// 	}
		// } else if(result.code == 401){
		// 	this.logError(`You are not logged in`);
		// } else if(result.code == 413){
		// 	this.logError(`You need to select an account first using 'mc account:use <account name>'`);
		// } else if(result.code == 417){
		// 	this.logError(`The cli API host has not been defined. Please run the command "mycloud join" to specity a target host for MyCloud.`);
		// } else if(result.code == 503){
		// 	this.logError(`MyCloud is not accessible. Please make sure that you are connected to the right network and try again.`);
		// } else {
		// 	console.log(JSON.stringify(result, null, 4));
		// 	this.logError("Something went wrong... Please inform the system administrator.");
		// }
	}

	/**
	 * handleError
	 * @param result 
	 */
	handleError(result: { code: number }) {
		if(result.code == 401){
			this.logError(`You are not logged in`);
			return false;
		} else if(result.code == 403){
			this.logError(`You do not have sufficient permissions to create a persistant volume claim`);
			return false;
		} else if(result.code == 409){
			this.logError(`The PVC name already exists`);
			return false;
		} else if(result.code == 417){
			this.logError(`The cli API host has not been defined. Please run the command "mycloud join" to specity a target host for MyCloud.`);
			return false;
		} else if(result.code == 503){
			this.logError(`MyCloud is not accessible. Please make sure that you are connected to the right network and try again.`);
			return false;
		} else if(result.code != 200){
			// console.log(JSON.stringify(result, null, 4));
			this.logError("Something went wrong... Please inform the system administrator.");
			return false;
		} else {
			return true;
		}
	}
}