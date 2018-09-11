const { test } = require('tap')
const queryServiceBuilder = require('../queryServiceBuilder')

const repository = {
  getById: id => Promise.resolve({ 
    state: {
      id, 
      foo: 'bar',
    }
  }),
  getByIds: ids => Promise.resolve({
    results: ids.map(id => ({ 
      id, 
      state: {
        bar: 'baz',
      },
    }))
  }),
  search: () => Promise.resolve({
    total: 1,
    data: [{
      id: 'a123',
      state: {
        userId: 'u123',
      },
    }]
  })
}

const handler = queryServiceBuilder.build({ 
  repository,
})



test('getById', async assert => {
  const expected = {
    id: 'a123',
    foo: 'bar',
  }

  const res = await handler.getById({ id: 'a123' })
  assert.deepEquals(res, expected, 'returns for id')
})

test('getByIds', async assert => {
  const expected = [{
    id: 'a123',
    bar: 'baz',
  }, {
    id: 'a456',
    bar: 'baz',
  }]

  const res = await handler.getByIds({ ids: [ 'a123', 'a456' ] })
  assert.deepEquals(res, expected, 'returns for ids')
})

test('search', async assert => {
  const expected = {
    total: 1,
    results: [{
      id: 'a123',
      userId: 'u123',
    }],
  }

  const res = await handler.search({ userId: 'u123' })
  assert.deepEquals(res, expected, 'returns for search')
})