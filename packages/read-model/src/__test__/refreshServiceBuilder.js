const { test } = require('tap')

const refreshServiceBuilder = require('../refreshServiceBuilder')

const events = [{
  id: 123,
  version: 3,
  commitId: 'a',
  events: [ 'event1' ],
}, {
  id: 123,
  version: 4,
  commitId: 'b',
  events: [ 'event2', 'event3' ],
}, {
  id: 456,
  version: 7,
  commitId: 'c',
  events: [ 'event3', 'event4', 'event5' ],
}, {
  id: 789,
  version: 0,
  commitId: 'd',
  events: [ 'event1', 'event2' ],
}]

const eventAdapter = {
  listCommits: ({ commitId }={}) => {
    const startAt = events.findIndex(e => e.commitId === commitId) + 1
    return Promise.resolve(events.slice(startAt, startAt + 3))
  },
}


test('handles consecutive events', async assert => {
  const saved = []
  var meta
  const repository = {
    getMetadata: () => {
      return Promise.resolve({
        state: meta,
        save: commits => meta = commits[commits.length - 1],
      })
    },
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
  }

  const { refresh } = refreshServiceBuilder.build({ 
    repository, 
    eventAdapter,
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
  var meta
  const repository = {
    getMetadata: () => {
      return Promise.resolve({
        state: meta,
        save: commits => meta = commits[commits.length -1],
      })
    },
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

  const { refresh } = refreshServiceBuilder.build({ 
    repository, 
    eventAdapter,
  })

  const expected = [{
    456: [ 'event3', 'event4', 'event5' ],
  }, {
    789: [ 'event1', 'event2' ],
  }]

  await refresh('foo')

  assert.deepEquals(saved, expected, 'ignores inconsecutive events but still processes others')

})