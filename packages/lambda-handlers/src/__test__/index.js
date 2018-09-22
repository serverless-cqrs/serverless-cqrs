const { 
  test,
} = require('tap')

const {
  buildCommands,
  buildQueries,
  buildRefresh,
  buildDynamoStreamHandler,
} = require('../index')


test('commands', async assert => {
  const handler = buildCommands({
    foo: (id, payload) => Promise.resolve({ id, payload }),
  })

  const expected = {
    id: '123',
    payload: {
      bar: 'baz',
    },
  }
  
  await handler({
    type: 'foo',
    id: '123',
    payload: {
      bar: 'baz',
    }
  }, null, (e, res) => {
    assert.false(e)
    assert.deepEquals(res, expected, 'forwards payload to query')
  })
  
  await handler({
    type: 'bar',
  }, null, (e, res) => {
    assert.equals(e, 'not supported: bar', 'throws error if method is not supported')
    assert.false(res)
  })
})

test('queries', async assert => {
  const handler = buildQueries({
    foo: params => Promise.resolve(params),
  })
  const expected = {
    bar: 'baz',
  }
  await handler({
    type: 'foo',
    payload: {
      bar: 'baz',
    }
  }, null, (e, res) => {
    assert.false(e)
    assert.deepEquals(res, expected, 'forwards payload to query')
  })
  
  await handler({
    type: 'bar',
  }, null, (e, res) => {
    assert.equals(e, 'not supported: bar', 'throws error if method is not supported')
    assert.false(res)
  })

})



test('eventHandler', assert => {
  const handler = buildDynamoStreamHandler(res => Promise.resolve(res))
  const expected = [{
    bar: 'baz',
  }, {
    baz: 'foo',
  }]
  return handler({
    Records: [{
      dynamodb: {
        NewImage: {
          bar: 'baz',
        }
      }
    }, {
      dynamodb: {
        NewImage: {
          baz: 'foo',
        }
      }
    }]
  }, null, (e, res) => {
    assert.false(e)
    assert.deepEquals(res, expected, 'sends dynamo record to event handler')
  })
})



test('refresh', async assert => {
  const handler = buildRefresh(params => Promise.resolve(params))
  const expected = {
    entityName: 'baz',
  }
  return handler({
    entityName: 'baz',
  }, null, (e, res) => {
    assert.false(e)
    assert.deepEquals(res, expected, 'forwards payload to query')
  })
})
