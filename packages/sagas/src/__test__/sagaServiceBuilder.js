const { test } = require('tap')
const sagaServiceBuilder = require('../sagaServiceBuilder')

const eventAdapter = {
  parseCommit: payload => payload,
}

test('handleEvents', async assert => {
  const handledEvents = []
  const effects = payload => handledEvents.push(payload)

  const { 
    handleEvent,
  } = sagaServiceBuilder.build({
    effects,
    eventAdapter,
  })

  const event = {
    id: '123',
    entity: 'foobar',
    commitId: 'commit123',
    version: 2,
    events: [ 'event1', 'event2' ],
  }
  
  const expected = [
    {
      id: '123',
      entity: 'foobar',
      commitId: 'commit123',
      version: 2,
      event: 'event1',
    },
    {
      id: '123',
      entity: 'foobar',
      commitId: 'commit123',
      version: 2,
      event: 'event2',
    },
  ]

  await handleEvent(event)

  assert.deepEquals(handledEvents, expected, 'invokes the saga for each event in the commit')
})