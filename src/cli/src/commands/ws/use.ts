import {flags} from '@oclif/command'
import Command from '../../base'

export default class Workspace extends Command {
	static description = 'set the current workspace for your organization'
	
	static flags = {
		help: flags.help({char: 'h'})
	}

	static args = [
	  	{	
			name: 'wsName',
			description: 'The name of the workspace to set'
		}
	]

	/**
	 * run
	 */
	async run() {
		const {args} = this.parse(Workspace)
		if(!args.wsName){
			return this.logError("Missing workspace name.");
		}
		let result = await this.api("workspace", {
			method: "set",
			data: args.wsName
		});
		if(result.code == 200){
			this.log("Workspace set");
		} else if(result.code == 401){
			this.logError(`You are not logged in`);
		} else if(result.code == 404){
			this.logError(`The workspace '${args.wsName}' does not exist`);
		} else if(result.code == 412){
			this.logError(`You need to select an organization first`);
		} else if(result.code == 417){
			this.logError(`The cli API host has not been defined. Please run the command "mycloud join" to specity a target host for MyCloud.`);
		} else if(result.code == 503){
			this.logError(`MyCloud is not accessible. Please make sure that you are connected to the right network and try again.`);
		} else {
			// console.log(JSON.stringify(result, null, 4));
			this.logError("Something went wrong... Please inform the system administrator.");
		}
	}
}