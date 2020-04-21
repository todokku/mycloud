import {flags} from '@oclif/command'
import Command from '../../../base'
import cli from 'cli-ux'
import * as inquirer from 'inquirer'

export default class OrganizationUsersAdd extends Command {
	static description = 'add users to this organization'
	
	static flags = {
		help: flags.help({char: 'h'}),
		users: flags.string({
			char: 'u',
			description: 'User emails to add, separated by comma (,)'
		})
	}

	static args = [
	  	{	
			name: 'orgName',
			description: 'The name of the organization'
		}
	]

	/**
	 * run
	 */
	async run() {
		const {args, flags} = this.parse(OrganizationUsersAdd);
		let params = {
			emails: new Array<any>(),
			orgName: "",
			permissions: new Array<any>() 
		}

		if(!args.orgName){
			return this.logError("Missing organization name.");
		} else {
			params.orgName = args.orgName;
		}
		
		if(!flags.users){
			params.emails = (await cli.prompt('Enter user emails to add, separated by comma (,)')).toLowerCase().split(",")
		} else {
			params.emails = flags.users.toLowerCase().split(",")
		}

		// Select permissions to apply
		let permissionChoices: any = await inquirer.prompt([{
			name: 'permission',
			message: 'What permission do you want to assign to those users:',
			type: 'list',
			choices: [
				{
					name: "Organization administrator",
					value: "ORG_ADMIN"
				},
				{
					name: "Organization developer",
					value: "ORG_DEVELOPER"
				}
			]
		}]);
		params.permissions.push(permissionChoices.permission);

		let result = await this.api("organization", {
			method: "add_users",
			data: params
		});
		
		if(result.code == 200){
			this.log("Done");
		} else if(result.code == 401){
			this.logError(`You are not logged in`);
		} else if(result.code == 403){
			this.logError(`You do not have sufficient permissions to add users`);
		} else if(result.code == 404){
			this.logError(`The organization '${params.orgName}' does not exist`);
		} else if(result.code == 405){
			this.logError(`Some emails you provided do not have an account`);
		} else if(result.code == 413){
			this.logError(`You need to set an account first, using the commabd 'mc accounts:use <account name>'`);
		} else if(result.code == 417){
			this.logError(`The cli API host has not been defined. Please run the command "mycloud join" to specity a target host for MyCloud.`);
		} else if(result.code == 503){
			this.logError(`MyCloud is not accessible. Please make sure that you are connected to the right network and try again.`);
		} else {
			console.log(JSON.stringify(result, null, 4));
			this.logError("Something went wrong... Please inform the system administrator.");
		}
	}
}