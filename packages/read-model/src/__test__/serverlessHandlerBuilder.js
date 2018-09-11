const { test } = require('tap')
const proxyquire = require('proxyquire')

const serverlessHandlerBuilder = proxyquire('../serverlessHandlerBuilder', {
  'vandium': {
    generic: () => ({
      handler: func => param => func(param)
    }),
    dynamodb: func => param => func(param),
  }
})

test('queries', async assert => {
  const handler = serverlessHandlerBuilder.build({
    queries: {
      foo: params => Promise.resolve(params),
    },
  })
  const expected = {
    bar: 'baz',
  }
  const res = await handler.queries({
    type: 'foo',
    payload: {
      bar: 'baz',
    }
  })
  assert.deepEquals(res, expected, 'forwards payload to query')
  try {
    await handler.queries({
      type: 'bar',
    })
  } catch (e) {
    assert.equals(e, 'not supported: bar', 'throws error if method is not supported')
  }
})



test('eventHandler', async assert => {
  const results = []
  const handler = serverlessHandlerBuilder.build({
    handleEvent: res => results.push(res),
  })
  const expected = [{
    bar: 'baz',
  }, {
    baz: 'foo',
  }]
  await handler.eventHandler([{
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
  }])
  assert.deepEquals(results, expected, 'sends dynamo record to event handler')
})



test('refresh', async assert => {
  const handler = serverlessHandlerBuilder.build({
    refresh: params => Promise.resolve(params),
  })
  const expected = {
    bar: 'baz',
  }
  const res = await handler.refresh({
    bar: 'baz',
  })
  assert.deepEquals(res, expected, 'forwards payload to query')
})
