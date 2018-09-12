const { test } = require('tap')
const repositoryBuilder = require('../repositoryBuilder')

const adapter = {
  get: (id) => Promise.resolve({
    version: 2,
    state: {
      foo: 'bar'
    }
  }),
  set: (id, obj) => Promise.resolve({
    id,
    ...obj
  }),
  batchGet: (ids) => Promise.resolve([{
    id: '123',
    version: 2,
    state: {
      foo: 'bar'
    }
  }]),
  batchWrite: (obj) => Promise.resolve(obj),
  search: (params) => Promise.resolve(params),
}

const reducer = (events, state) => events.reduce((p, c) => ({ ...p, ...c }), state)

const repo = repositoryBuilder.build({
  adapter,
  reducer,
})

test('getById', async assert => {
  const res = await repo.getById('123')
  assert.deepEquals(res.version, 2, 'returns the version')

  assert.deepEquals(res.state, {
    foo: 'bar',
  }, 'returns the state')


  const savedRes = await res.save([{ bar: 'baz' }])

  assert.deepEquals(savedRes, {
    id: '123',
    version: 3,
    state: {
      foo: 'bar',
      bar: 'baz',
    }
  }, 'reduces new events and saves')
})

test('getByIds', async assert => {  
  const res = await repo.getByIds([ '123' ])

  assert.deepEquals(res.results, [{
    id: '123',
    version: 2,
    state: {
      foo: 'bar',
    }
  }], 'returns results from batchGet')

  const savedRes = await res.save({
    '123': [{ 
      bar: 'baz',
    }]
  })

  assert.deepEquals(savedRes, {
    '123': {
      version: 3,
      state: {
        foo: 'bar',
        bar: 'baz',
      }
    }
  }, 'reduces new events and saves')

})


test('search', async assert => {
  const res = await repo.search({
    foo: 'bar',
  })

  assert.deepEquals(res, {
    foo: 'bar',
  }, 'forwards search params to adapter')
})