const { test } = require('tap')

const refreshHandler = require('../index')

const events = [{
  id: 123,
  version: 3,
  events: [ 'event1' ],
}, {
  id: 123,
  version: 4,
  events: [ 'event2', 'event3' ],
}, {
  id: 456,
  version: 7,
  events: [ 'event3', 'event4', 'event5' ],
}, {
  id: 789,
  version: 9,
  events: [ 'event1', 'event2' ],
}]

const eventRepositories = {
  foo: {
    scanIterator: function* iterate () {
      yield Promise.resolve(events.slice(0, 3))
      yield Promise.resolve(events.slice(3))
    },
  },
}


test('handles consecutive events', async assert => {
  const saved = []
  const projectionRepositories = {
    foo: {
      getByIds: () => Promise.resolve({
        results: {
          123: {
            id: 123,
            version: 3,
          },
          456: {
            id: 456,
            version: 7,
          }
        },
        save: params => Promise.resolve(saved.push(params))
      }),
    },
  }

  const { refresh } = refreshHandler({ 
    eventRepositories, 
    projectionRepositories,
  })

  const expected = [{
    123: [ 'event1', 'event2', 'event3' ],
    456: [ 'event3', 'event4', 'event5' ],
  }, {
    789: [ 'event1', 'event2' ],
  }]

  await refresh('foo')

  assert.deepEquals(saved, expected, 'consolidates events and saves them to repo')
})

test('doesnt handle inconsecutive events', async assert => {
  const saved = []
  const projectionRepositories = {
    foo: {
      getByIds: () => Promise.resolve({
        results: {
          123: {
            id: 123,
            version: 5,
          },
          456: {
            id: 456,
            version: 7,
          }
        },
        save: params => Promise.resolve(saved.push(params))
      })
    }
  }

  const { refresh } = refreshHandler({ 
    eventRepositories, 
    projectionRepositories,
  })

  const expected = [{
    456: [ 'event3', 'event4', 'event5' ],
  }, {
    789: [ 'event1', 'event2' ],
  }]

  await refresh('foo')

  assert.deepEquals(saved, expected, 'ignores inconsecutive events but still processes others')

})