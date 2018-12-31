const AWS = require('aws-sdk');
const aws4 = require('aws4');
const got = require('got');

const chain = new AWS.CredentialProviderChain()

const awsClient = got.extend({
	hooks: {
		beforeRequest: [
			async options => {
				const credentials = await chain.resolvePromise()
				aws4.sign(options, credentials)
			}
		]
	}
})

module.exports = async ({ endpoint, path, body, method }) => {
	return awsClient('https://' + endpoint + path, {
		body,
		method,
		headers: {
			'Content-Type': 'application/json',
		}
	})
}