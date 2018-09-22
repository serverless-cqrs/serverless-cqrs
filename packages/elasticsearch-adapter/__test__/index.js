const { test } = require('tap')
const proxyquire = require('proxyquire')

test('set', assert => {
	const { makeClient } = proxyquire('../index', {
		'./makeSignedRequest': data => Promise.resolve({ data }),
	})
	const client = makeClient({
		endpoint: 'https://foobar.com',
	  region: 'eu-west-1',
	})
	const storage = client.build('foo')
	
	const expected = {
		endpoint: 'https://foobar.com',
	  region: 'eu-west-1',
	  service: 'es',
	  method: 'PUT',
	  path: '/foos/foo/123?version_type=external&version=2',
	  body: {
	  	foo: 'bar',
	  }
	}

	const obj = {
		version: '2',
		state: { foo: 'bar'},
	}

	return storage.set('123', obj)
		.then(res => assert.deepEquals(res, expected, 'sets object'))
})

test('get', assert => {
	const { makeClient } = proxyquire('../index', {
		'./makeSignedRequest': _source => Promise.resolve({ 
			data: {
				_id: 1, _version: 2, _source 
			},
		}),
	})	
	const client = makeClient({
		endpoint: 'https://foobar.com',
	  region: 'eu-west-1',
	})
	const storage = client.build('foo')


	const expected = {
		id: 1,
		version: 2,
		state: {
			endpoint: 'https://foobar.com',
		  region: 'eu-west-1',
		  service: 'es',
		  method: 'GET',
		  path: '/foos/foo/123',
		}
	}

	return storage.get('123')
		.then(res => assert.deepEquals(res, expected, 'gets object'))
})

test('batchGet', assert => {
	const { makeClient } = proxyquire('../index', {
		'./makeSignedRequest': ({ body, path })  => Promise.resolve({
			data: {
				docs: body.ids.map(id => ({
					found: true,
					_id: id,
					_version: 2,
					_source: {
						id,
						path,
					}
				}))
			}
		}),
	})
	const client = makeClient({
		endpoint: 'https://foobar.com',
	  region: 'eu-west-1',
	})
	const storage = client.build('foo')

	const expected = [{
		id: '123',
		version: 2,
		state: {
			id: '123',
			path: '/foos/foo/_mget',
		}, 
	}, {
		id: '456',
		version: 2,
		state: {
			id: '456',
			path: '/foos/foo/_mget',
		},
	}]

	return storage.batchGet([ '123', '456' ])
		.then(res => assert.deepEquals(res, expected, 'gets in batch'))
})

test('batchWrite', assert => {
	let sentParams
	const { makeClient } = proxyquire('../index', {
		'./NDJSON': JSON,
		'./makeSignedRequest': params => {
			sentParams = params
			return Promise.resolve({ 
				data: {
					items: [] 
				}
			})
		},
	})
	const client = makeClient({
		endpoint: 'https://foobar.com',
	  region: 'eu-west-1',
	})
	const storage = client.build('foo')

	const params = {
		'123': {
			id: '123',
			version: 1,
			state: {
				foo: 'bar',
			},
		},
		'456': {
			id: '456',
			version: 2,
			state: {
				bar: 'baz',
			},
		},
	}
	
	const expected = {
		endpoint: 'https://foobar.com',
	  region: 'eu-west-1',
	  service: 'es',
	  method: 'POST',
	  path: '/foos/foo/_bulk',
	  body: JSON.stringify([
	  	{	index: { _id: '123', _version: 1, version_type: 'external' }},
	  	{ foo: 'bar' },
	  	{	index: { _id: '456', _version: 2, version_type: 'external' }},
	  	{ bar: 'baz' },
	  ])
	}

	return storage.batchWrite(params)
		.then(() => assert.deepEquals(sentParams, expected, 'writes in batch'))
})