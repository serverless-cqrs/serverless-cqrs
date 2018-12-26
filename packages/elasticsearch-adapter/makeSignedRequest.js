const AWS = require('aws-sdk');

const parseJson = text => {
	try {
		return JSON.parse(text)
	} catch (e) {
		return text
	}
}

module.exports = ({ endpoint, path, body, service, method, region }) => {
	const url = endpoint + path
	let req = new AWS.HttpRequest(url, region);
    req.method = method
    req.headers.host = req.endpoint.host
    req.headers['Content-Type'] = 'application/json';
    req.body = body

    let signer = new AWS.Signers.V4(req, service, true);
    signer.addAuthorization(AWS.config.credentials, AWS.util.date.getDate());


    var client = new AWS.HttpClient();
    return new Promise((resolve, reject) => {
			client.handleRequest(req, null, res => {
				var body = ''
				res.on('data', chunk => body += chunk)
				res.on('end', () => {

					
					const response = {
						body,
						status: res.statusCode,
						statusMessage: res.statusMessage,
						data: parseJson(body),
					}

					res.statusCode >= 200 && res.statusCode < 300
						? resolve(response)
						: reject({ response })	
				})
			}, reject)
    })
}