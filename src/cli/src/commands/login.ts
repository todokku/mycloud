import {flags} from '@oclif/command'
import Command from '../base'
import cli from 'cli-ux'

export default class Login extends Command {
    static description = 'login to the platform'

	static flags = {
		help: flags.help({char: 'h'}),
		user: flags.string({
			char: 'u',
			description: 'Your MyCloud username'
		}),
		password: flags.string({
			char: 'p',
			description: 'Your MyCloud password'
		}),
	}

	/**
	 * run
	 */
	async run() {
		const {flags} = this.parse(Login)
		let params = {
			email: "",
			password: ""
		}
		
		if(!flags.user){
			params.email = await cli.prompt('What is your username')
		} else {
			params.email = flags.user
		}
		if(!flags.password){
			params.password = await cli.prompt('What is your password?', {type: 'hide'})
		} else {
			params.password = flags.password
		}
		
		let result = await this.api("login", params);

		if(result.code == 200){
			this.log(`Success!`);
		} else if(result.code == 401){
			this.logError(`Wrong username or password`);
		} else if(result.code == 417){
			this.logError(`The cli API host has not been defined. Please run the command "mycloud join" to specity a target host for MyCloud.`);
		} else if(result.code == 503){
			this.logError(`MyCloud is not accessible. Please make sure that you are connected to the right network and try again.`);
		} else {
			this.logError("Something went wrong... Please inform the system administrator.");
		}
	}
}
