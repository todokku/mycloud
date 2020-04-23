import {flags} from '@oclif/command'
import Command from '../../../base'
import cli from 'cli-ux'
import * as inquirer from 'inquirer'

export default class NsRbacBindings extends Command {
	static description = 'define a Role Binding for this namespace'
	
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
		let apiData = {
			ns: null,
			user: null,
			roles: null
		};

		let orgUsers = await this.api("organization", {
			method: "get_users"
		});

		console.log(orgUsers);
		
		let resultNs = await this.api("namespaces", {
			method: "get-namespaces",
			data: {}
		});

		if(this.handleError(resultNs)){
			if(resultNs.data.length == 0) {
				return this.logError("There are no namespaces configured on your cluster. Namespaces are like separate isolated environements on your cluster that you can deploy resources on. Start by creating a namespace using the command 'mc create:ns', then try again.");
			}
			
			// if(!this.handleError(resultVol)){
			// 	return;
			// }
			// Select namespace
			let nsChoice: any = await inquirer.prompt([{
				name: 'name',
				message: 'For what namespace do you wish to apply a role binding?',
				type: 'list',
				choices: resultNs.data.map((o: { NAME: string }) => {
					return {
						name: o.NAME
					}
				})
			}]);
			apiData.ns = nsChoice.name;

			
			// Select target service version
			let roleChoices: any = await inquirer.prompt([{
				name: 'name',
				message: 'Which volume do you wish to use?',
				type: 'checkbox',
				choices: [
					{
						name: "Administrator",
						value: "admin"
					},
					{
						name: "Developer",
						value: "developer"
					}
				]
			}]);
			apiData.roles = roleChoices.name;
				
		}
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