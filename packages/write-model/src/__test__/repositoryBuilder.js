const { test } = require('tap')




const repositoryBuilder = require('../repositoryBuilder')
const client = {
  loadEvents: id => Promise.resolve([
    { foo: 'bar' },
    { bar: 'foo' },
    { foo: 'baz' },
  ]),
  append: id => Promise.resolve('success' + id)
}
const reducer = events => events.reduce((p, c) => ({ ...p, ...c }), {})
const repo = repositoryBuilder.build({
  client,
  reducer,
})

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