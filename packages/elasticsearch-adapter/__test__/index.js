const { test } = require('tap')
const proxyquire = require('proxyquire')

const clientParams = {
	endpoint: 'https://foobar.com',
}

test('set', assert => {
	const { build } = proxyquire('../index', {
		'./makeSignedRequest': body => Promise.resolve({ body }),
	})
	const storage = build({ entityName: 'foo' }, clientParams)
	
	const expected = {
		endpoint: 'https://foobar.com',
	  method: 'PUT',
	  path: '/foos/foo/123?version_type=external&version=2',
	  body: '{"foo":"bar"}'
	}

	const obj = {
		version: '2',
		state: { foo: 'bar'},
	}

	return storage.set('123', obj)
		.then(res => assert.deepEquals(res, expected, 'sets object'))
})

test('get', assert => {
	const { build } = proxyquire('../index', {
		'./makeSignedRequest': _source => Promise.resolve({ 
			body: JSON.stringify({
				_id: 1, _version: 2, _source 
			}),
		}),
	})
	const storage = build({ entityName: 'foo' }, clientParams)


	const expected = {
		id: 1,
		version: 2,
		state: {
			endpoint: 'https://foobar.com',
		  method: 'GET',
		  path: '/foos/foo/123',
		}
	}

	return storage.get('123')
		.then(res => assert.deepEquals(res, expected, 'gets object'))
})

test('batchGet', assert => {
	const { build } = proxyquire('../index', {
		'./makeSignedRequest': ({ body, path })  => Promise.resolve({
			body: JSON.stringify({
				docs: JSON.parse(body).ids.map(id => ({
					found: true,
					_id: id,
					_version: 2,
					_source: {
						id,
						path,
					}
				}))
			})
		}),
	})
	const storage = build({ entityName: 'foo' }, clientParams)

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
	const { build } = proxyquire('../index', {
		'./NDJSON': JSON,
		'./makeSignedRequest': params => {
			sentParams = params
			return Promise.resolve({ 
				body: '{"items":[]}'
			})
		},
	})
	const storage = build({ entityName: 'foo' }, clientParams)

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