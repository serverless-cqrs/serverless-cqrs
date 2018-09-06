const { test } = require('tap')

const NDJSON = require('../NDJSON')

test('stringify', assert => {
	const expected = '{"foo":"bar"}\n{"bar":"baz"}\n'
	const params = [ { foo: 'bar' }, { bar: 'baz' } ]
	const res = NDJSON.stringify(params)
	assert.plan(1)
	assert.equals(res, expected, 'stringifies')
})