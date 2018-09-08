const { test } = require('tap')
const articleQueries = require('../article')

const article = {
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
    data: [{
      id: 'a123',
      state: {
        userId: 'u123',
      },
    }]
  })
}

const handler = articleQueries({ article })



test('getArticleById', async assert => {
  const expected = {
    id: 'a123',
    foo: 'bar',
  }

  const res = await handler.getArticleById({ id: 'a123' })
  assert.deepEquals(res, expected, 'returns for id')
})

test('getArticlesByIds', async assert => {
  const expected = [{
    id: 'a123',
    bar: 'baz',
  }, {
    id: 'a456',
    bar: 'baz',
  }]

  const res = await handler.getArticlesByIds({ ids: [ 'a123', 'a456' ] })
  assert.deepEquals(res, expected, 'returns for ids')
})

test('getArticlesByUserId', async assert => {
  const expected = [{
    id: 'a123',
    userId: 'u123',
  }]

  const res = await handler.getArticlesByUserId({ userId: 'u123' })
  assert.deepEquals(res, expected, 'returns for userId')
})