const { test } = require('tap')
const proxyquire = require('proxyquire')

const serverlessHandlerBuilder = proxyquire('../serverlessHandlerBuilder', {
  'vandium': {
    generic: () => ({
      handler: func => param => func(param)
    }),
  }
})

test('commands', async assert => {
  const handler = serverlessHandlerBuilder.build({
    commands: {
      foo: (id, payload) => Promise.resolve({ id, payload }),
    },
  })
  const expected = {
    id: '123',
    payload: {
      bar: 'baz',
    },
  }
  const res = await handler({
    type: 'foo',
    id: '123',
    payload: {
      bar: 'baz',
    }
  })
  assert.deepEquals(res, expected, 'forwards payload to query')
  try {
    await handler({
      type: 'bar',
    })
  } catch (e) {
    assert.equals(e, 'not supported: bar', 'throws error if method is not supported')
  }
})

