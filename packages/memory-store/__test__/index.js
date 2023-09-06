const { test } = require('tap')

const { build } = require('../index')

test('parseCommit', async assert => {
  const adapter = build({ entityName: 'foo' })
  const res = await adapter.parseCommit({ bar: 'baz' })

  assert.deepEquals(res, { bar: 'baz' }, 'returns same event')
})

test('loadEvents', async assert => {
  const eventStore = {
    'foo': [
      { id: '123', version: 0, events: [ 'a' ] },
      { id: '123', version: 1, events: [ 'b', 'c' ]},
      { id: '123', version: 3, events: [ 'd', 'e', 'f' ] },
      { id: '123', version: 6, events: [ 'g', 'h', 'i' ] },
    ]
  }
  const expected = [ 'd', 'e', 'f', 'g', 'h', 'i' ]

  const adapter = build({ entityName: 'foo' }, { eventStore })
  
  const res = await adapter.loadEvents('123', 1)

  assert.deepEquals(res, expected, 'returns events after given version')
})

test('listCommits', async assert => {
  const eventStore = {
    'foo': [
      { id: '123', commitId: '0', events: [ 'a' ] },
      { id: '456', commitId: '1', events: [ 'b' ]},
      { id: '789', commitId: '2', events: [ 'c' ] },
      { id: '012', commitId: '3', events: [ 'd' ] },
    ]
  }

  const expected = [
    { id: '789', commitId: '2', events: [ 'c' ] },
    { id: '012', commitId: '3', events: [ 'd' ] },
  ]
  const adapter = build({ entityName: 'foo' }, { eventStore })
  
  const res = await adapter.listCommits({ commitId: '1' })

  assert.deepEquals(res, expected, 'returns commits after given commitId')
})

test('append', async assert => {
  const eventStore = {}
  const adapter = build({ entityName: 'foo' }, { eventStore })

  await adapter.append('123', 0, [ 'a' ])
  const expected1 = [{
    commitId: /\w/,
    committedAt: /\d/,
    id: '123',
    entity: 'foo',
    version: 0,
    events: [ 'a' ],      
  }]

  assert.match(eventStore.foo, expected1, 'appends event to new entityName')
  
  await adapter.append('456', 1, [ 'b' ])
  
  const expected2 = [
    ...expected1,
    {
      commitId: /\w/,
      committedAt: /\d/,
      id: '456',
      entity: 'foo',
      version: 1,
      events: [ 'b' ],    
    }  
  ]
  assert.match(eventStore.foo, expected2, 'appends event to existing entityName')
})

test('set', async assert => {
  const projectionStore = {}
  const adapter = build({ entityName: 'foo' }, { projectionStore })

  const expected = {
    foo: {
      '123':{
        id: '123',
        version: 0,
        state: 'foobar',
      }
    }
  }

  await adapter.set('123', {
    version: 0,
    state: 'foobar',
  })

  assert.deepEquals(projectionStore, expected, 'sets projection in store')
})

test('get', async assert => {
  const projectionStore = {
    foo: {
      '123':{
        id: '123',
        version: 0,
        state: 'foobar',
      }
    }
  }

  const expected = {
    id: '123',
    version: 0,
    state: 'foobar',
  }

  const adapter = build({ entityName: 'foo' }, { projectionStore })

 
  const res = await adapter.get('123')

  assert.deepEquals(res, expected, 'returns exisiting projection from store')
})


test('setMetadata', async assert => {
  const metadataStore = {}
  const adapter = build({ entityName: 'foo' }, { metadataStore })

  const expected = {
    foo: {
      version: 0,
      state: 'foobar',
    }
  }

  await adapter.setMetadata({
    version: 0,
    state: 'foobar',
  })

  assert.deepEquals(metadataStore, expected, 'sets metadata in store')
})

test('getMetadata', async assert => {
  const metadataStore = {
    foo:{
      version: 0,
      state: 'foobar',
    }
  }

  const expected = {
    version: 0,
    state: 'foobar',
  }

  const adapter = build({ entityName: 'foo' }, { metadataStore })

 
  const res = await adapter.getMetadata()

  assert.deepEquals(res, expected, 'returns exisiting metadata from store')
})


test('batchGet', async assert => {
  const projectionStore = {
    foo: {
      '123':{
        id: '123',
        version: 0,
        state: 'foobar',
      },
      '456':{
        id: '456',
        version: 1,
        state: 'barfoo',
      },
      '789':{
        id: '789',
        version: 3,
        state: 'bazbar',
      }
    }
  }

  const expected = [{
    id: '123',
    version: 0,
    state: 'foobar',
  }, {
    id: '789',
    version: 3,
    state: 'bazbar',
  }]

  const adapter = build({ entityName: 'foo' }, { projectionStore })

  const res = await adapter.batchGet([ '123', '789', '999' ])

  assert.deepEquals(res, expected, 'returns exisiting projections from store')
})

test('batchWrite', async assert => {
  const projectionStore = {
    foo: {
      '456':{
        id: '456',
        version: 1,
        state: 'barfoo',
      }
    }
  }

  const expected = {
    foo: {
      '123':{
        id: '123',
        version: 0,
        state: 'foobar',
      },
      '456':{
        id: '456',
        version: 1,
        state: 'barfoo',
      },
      '789':{
        id: '789',
        version: 3,
        state: 'bazbar',
      }
    }
  }
  const adapter = build({ entityName: 'foo' }, { projectionStore })

 
  const res = await adapter.batchWrite({
    '123':{
      version: 0,
      state: 'foobar',
    },
    '789':{
      version: 3,
      state: 'bazbar',
    }
  })

  assert.deepEquals(projectionStore, expected, 'updates multiple projections')
})

test('search', async assert => {
  const projectionStore = {
    foo: {
      '123':{
        id: '123',
        version: 0,
        state: {
          foo: 'bar',
          baz: 'foo'
        },
      },
      '456':{
        id: '456',
        version: 1,
        state: {
          foo: 'bar',
          baz: 'foo'
        },
      },
      '789':{
        id: '789',
        version: 3,
        state: {
          foo: 'baz',
          baz: 'foo'
        },
      }
    }
  }

  const expected = {
    data: [{
      id: '123',
      version: 0,
      state: {
        foo: 'bar',
        baz: 'foo'
      },
    }, {
      id: '456',
      version: 1,
      state: {
        foo: 'bar',
        baz: 'foo'
      },
    }],
    total: 2
  }

  const adapter = build({ entityName: 'foo' }, { projectionStore })

 
  const res = await adapter.search({
    foo: 'bar',
    baz: 'foo',
  })

  assert.deepEquals(res, expected, 'searches projections')
})