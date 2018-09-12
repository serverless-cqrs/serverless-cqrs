const { test } = require('tap')

const commandServiceBuilder = require('../commandServiceBuilder')


const actions = {
  foo: (state, payload) => ({
    state,
    payload,
  }),
}

test('build', async assert => {
  const expectedEvents = [{
    state: {
      id: '123',
      foo: 'bar',
    },
    payload: {
      bar: 'baz',
    }
  }]

  const events = []
  const repository = {
    getById: async (id) => ({
      state: {
        id,
        foo: 'bar',
      },
      save: async event => {
        events.push(event)
      }
    })
  }

  const commandService = commandServiceBuilder.build({
    repository,
    actions,
  })
  
  await commandService.foo('123', { bar: 'baz' })

  assert.deepEquals(events, expectedEvents, 'wraps given actions with reducer')
})