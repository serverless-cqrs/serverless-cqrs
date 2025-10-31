import { test } from 'tap'

const clientParams = {
	endpoint: 'https://foobar.com',
}

// Mock HTTPError class
class MockHTTPError extends Error {
	constructor(public response: any) {
		super('HTTP Error')
		this.name = 'HTTPError'
	}
}

test('set', async (assert) => {
	const mockMakeSignedRequest = async (params: any) => ({ body: params })
	
	const { build } = await assert.mockImport('../index.js', {
		'../makeSignedRequest.js': {
			default: mockMakeSignedRequest,
			HTTPError: MockHTTPError,
		},
	})
	const storage = build({ entityName: 'foo' }, clientParams)
	
	const expected = {
		endpoint: 'https://foobar.com',
	  method: 'PUT',
	  path: '/foo/_doc/123?refresh=wait_for&version_type=external&version=2',
	  body: '{"foo":"bar"}'
	}

	const obj = {
		version: 2,
		state: { foo: 'bar'},
	}

	const res = await storage.set({ id: '123', ...obj })
	assert.same(res, expected, 'sets object')
})

test('get', async (assert) => {
	const mockMakeSignedRequest = async (_source: any) => ({ 
		body: JSON.stringify({
			_id: 1, _version: 2, _source 
		}),
	})
	
	const { build } = await assert.mockImport('../index.js', {
		'../makeSignedRequest.js': {
			default: mockMakeSignedRequest,
			HTTPError: MockHTTPError,
		},
	})
	const storage = build({ entityName: 'foo' }, clientParams)


	const expected = {
		id: 1,
		version: 2,
		state: {
			endpoint: 'https://foobar.com',
		  method: 'GET',
		  path: '/foo/_doc/123',
		}
	}

	const res = await storage.get('123')
	assert.same(res, expected, 'gets object')
})

test('setVersionLock', async (assert) => {
	let sentParams: any
	const mockMakeSignedRequest = async (params: any) => {
		sentParams = params
		return { body: params }
	}
	
	const { build } = await assert.mockImport('../index.js', {
		'../makeSignedRequest.js': {
			default: mockMakeSignedRequest,
			HTTPError: MockHTTPError,
		},
	})
	const storage = build({ entityName: 'foo' }, clientParams)
	
	const expected = {
		endpoint: 'https://foobar.com',
	  method: 'PUT',
	  path: '/version_lock/_doc/foo?refresh=wait_for&version_type=external&version=2',
		body: '{"lastCommitId":"commit123"}',
	}

	const obj = {
		version: 2,
		lastCommitId: 'commit123',
	}

	await storage.setVersionLock(obj)
	assert.same(sentParams, expected, 'sets version lock')
})

test('getVersionLock', async (assert) => {
	const mockMakeSignedRequest = async (_source: any) => ({ 
		body: JSON.stringify({
			_version: 2,
			_source: {
				lastCommitId: 'commit123',
			}
		}),
	})
	
	const { build } = await assert.mockImport('../index.js', {
		'../makeSignedRequest.js': {
			default: mockMakeSignedRequest,
			HTTPError: MockHTTPError,
		},
	})
	const storage = build({ entityName: 'foo' }, clientParams)


	const expected = {
		version: 2,
		lastCommitId: 'commit123'
	}

	const res = await storage.getVersionLock()
	assert.same(res, expected, 'gets version lock')
})

test('batchGet', async (assert) => {
	const mockMakeSignedRequest = async ({ body, path }: any) => ({
		body: JSON.stringify({
			docs: JSON.parse(body).ids.map((id: any) => ({
				found: true,
				_id: id,
				_version: 2,
				_source: {
					id,
					path,
				}
			}))
		})
	})
	
	const { build } = await assert.mockImport('../index.js', {
		'../makeSignedRequest.js': {
			default: mockMakeSignedRequest,
			HTTPError: MockHTTPError,
		},
	})
	const storage = build({ entityName: 'foo' }, clientParams)

	const expected = [{
		id: '123',
		version: 2,
		state: {
			id: '123',
			path: '/foo/_mget',
		}, 
	}, {
		id: '456',
		version: 2,
		state: {
			id: '456',
			path: '/foo/_mget',
		},
	}]

	const res = await storage.batchGet(['123', '456'])
	assert.same(res, expected, 'gets in batch')
})

test('batchWrite', async (assert) => {
	let sentParams: any
	const mockMakeSignedRequest = async (params: any) => {
		sentParams = params
		return { 
			body: '{"items":[]}'
		}
	}
	
	const mockNDJSON = {
		stringify: JSON.stringify,
	}
	
	const { build } = await assert.mockImport('../index.js', {
		'../NDJSON.js': mockNDJSON,
		'../makeSignedRequest.js': {
			default: mockMakeSignedRequest,
			HTTPError: MockHTTPError,
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
	  path: '/foo/_bulk?refresh=wait_for',
	  body: JSON.stringify([
	  	{	index: { _id: '123', version: 1, version_type: 'external' }},
	  	{ foo: 'bar' },
	  	{	index: { _id: '456', version: 2, version_type: 'external' }},
	  	{ bar: 'baz' },
	  ])
	}

	await storage.batchWrite(params)
	assert.same(sentParams, expected, 'writes in batch')
})