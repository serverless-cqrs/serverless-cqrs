const AWS = require('aws-sdk');
const axios = require('axios');

module.exports = ({ endpoint, path, body, service, method, region }) => {
	const url = endpoint + path
	let req = new AWS.HttpRequest(url, region);
    req.method = method
    req.headers.host = req.endpoint.host
    req.headers['Content-Type'] = 'application/json';
    req.body = JSON.stringify(body)

    let signer = new AWS.Signers.V4(req, service, true);
    signer.addAuthorization(AWS.config.credentials, AWS.util.date.getDate());

    return axios({
        method,
        url,
        data: req.body,
        headers: req.headers
    });
}