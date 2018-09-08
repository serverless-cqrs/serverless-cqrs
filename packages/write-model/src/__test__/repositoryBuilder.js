const { test } = require('tap')
const proxyquire = require('proxyquire')

const index = proxyquire('../index', {
  '../../../adapters/dynamodb': {
    makeClient: () => ({
      loadEvents: id => Promise.resolve([
        { foo: 'bar' },
        { bar: 'foo' },
        { foo: 'baz' },
      ]),
      append: id => Promise.resolve('success' + id)
    })
  }
})

const reducer = events => events.reduce((p, c) => ({ ...p, ...c }), {})
const repo = index('foo', reducer)

test('getById', async assert => {
  const expected = {
    foo: 'baz',
    bar: 'foo',
  }

  const { state, save } = await repo.getById('123')

  assert.deepEquals(state, expected, 'returns current state')

  assert.resolveMatch(save(), 'success123', 'returns save function for entity')

  assert.end()
})