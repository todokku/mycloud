import {flags} from '@oclif/command'
import Command from '../../base'
import {cli} from 'cli-ux'
const EventsController = require('../../controllers/events/index.js');
const chalk = require('chalk')

export default class Scale extends Command {
	static description = 'configure your workspace cluster'
	
	static flags = {
		help: flags.help({char: 'h'}),
		instances: flags.integer({
			char: 'i',
			description: 'Scale your cluster workers'
		})
	}

	/**
	 * run
	 */
	async run() {
		const {flags} = this.parse(Scale)
		if(!flags.instances){
			this.logError("Missing instance number");
			return;
		}
		
		let result = await this.api("config", {
			method: "cluster",
			data: {
				scale: flags.instances
			}
		}, (event: any) => {
			if(event.error){
				cli.action.stop();
				cli.action.start(chalk.red(event.value));
			} else {
				cli.action.stop();
				cli.action.start(event.value);
			}
		}, () => {
			cli.action.stop();
		});

		if(result.code != 200){
			EventsController.close();
		}

		if(result.code == 401){
			this.logError(`You are not logged in`);
		} else if(result.code == 404){
			this.logError(`The current workspace does not exist anymore`);
		} else if(result.code == 412){
			this.logError(`You need to select a workspace first`);
		} else if(result.code == 417){
			this.logError(`The cli API host has not been defined. Please run the command "mycloud join" to specity a target host for MyCloud.`);
		} else if(result.code == 425){
			this.logError(`Your cluster is in the process of being updated. Please wait a bit until all tasks are finished to perform further configurations.`);
		} else if(result.code == 503){
			this.logError(`MyCloud is not accessible. Please make sure that you are connected to the right network and try again.`);
		} else if(result.code != 200){
			// console.log(result);
			this.logError("Something went wrong... Please inform the system administrator.");
		}
	}
}