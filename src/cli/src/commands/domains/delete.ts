import {flags} from '@oclif/command'
import Command from '../../base'
import cli from 'cli-ux'
import * as inquirer from 'inquirer'

export default class Domain extends Command {
	static description = 'delete a domain from this workspace'
	
	static flags = {
		help: flags.help({char: 'h'})
	}

	/**
	 * run
	 */
	async run() {
		let result = await this.api("domains", {
			method: "get-domains",
			data: {}
		});
		if(this.handleError(result)){
			if(result.data.length == 0){
				return this.logError("no domains found");
			}

			// Select target domain
			let domainChoice: any = await inquirer.prompt([{
				name: 'domain',
				message: 'What domain do you want to delete:',
				type: 'list',
				choices: result.data.map((o: { name: any, id: any }) => {
					return {
						name: o.name,
						value: o.id
					}
				})
			}]);

			result = await this.api("domains", {
				method: "delete",
				data: {
					"domainId": domainChoice.domain
				}
			});
		
			if(this.handleError(result)){
				this.log("Domain deleted successfully");
			}
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
			this.logError(`You do not have sufficient permissions to delete domains`);
			return false;
		} else if(result.code == 404){
			this.logError(`This domain does not exist`);
			return false;
		} else if(result.code == 409){
			this.logError(`This domain is in use, therefore it cant be deleted`);
			return false;
		} else if(result.code == 412){
			this.logError(`You need to select a workspace first`);
			return false;
		} else if(result.code == 417){
			this.logError(`The cli API host has not been defined. Please run the command "mycloud join" to specity a target host for MyCloud.`);
			return false;
		} else if(result.code == 425){
			this.logError(`Your cluster is in the process of being updated. Please wait a bit until all tasks are finished to perform further configurations.`);
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