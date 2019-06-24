const { test } = require('tap')
const proxyquire = require('proxyquire')

const build = params => params
const defaultStubs = {
  'serverless-cqrs.read-model': {
    repositoryBuilder: { build },
    queryServiceBuilder: { build },
    eventServiceBuilder: { build },
    refreshServiceBuilder: { build },  
  }
}

const reducer = (p, c) => ({ ...p, ...c })

const defaultOptions = {
  adapter: 'barfoo',
  eventAdapter: 'foobar',
  reducer,
}

test('parseEvent', async assert => {
  const readModelBuilder = proxyquire('../readModelBuilder', {
    ...defaultStubs,
    'serverless-cqrs.read-model': {
      ...defaultStubs['serverless-cqrs.read-model'],
      eventServiceBuilder: {
        build: params => ({
          parseEvent: () => params
        })
      }
    },
  })

  const expected = {
    eventAdapter: 'foobar',
    repository: {
      adapter: 'barfoo',
      reducer,
    }
  }

  const readModel = readModelBuilder.build(defaultOptions)
  const res = readModel.parseEvent()

  assert.deepEquals(res, expected)
})

test('handleEvent', async assert => {
  const readModelBuilder = proxyquire('../readModelBuilder', {
    ...defaultStubs,
    'serverless-cqrs.read-model': {
      ...defaultStubs['serverless-cqrs.read-model'],
      eventServiceBuilder: {
        build: params => ({
          handleEvent: () => params
        })
      }
    },
  })

  const expected = {
    eventAdapter: 'foobar',
    repository: {
      adapter: 'barfoo',
      reducer,
    }
  }

  const readModel = readModelBuilder.build(defaultOptions)
  const res = readModel.handleEvent()

  assert.deepEquals(res, expected)
})

test('refresh', async assert => {
  const readModelBuilder = proxyquire('../readModelBuilder', {
    ...defaultStubs,
    'serverless-cqrs.read-model': {
      ...defaultStubs['serverless-cqrs.read-model'],
      refreshServiceBuilder: {
        build: params => ({
          refresh: () => params
        })
      }
    },
  })

  const expected = {
    eventAdapter: 'foobar',
    repository: {
      adapter: 'barfoo',
      reducer,
    }
  }

  const readModel = readModelBuilder.build(defaultOptions)
  const res = readModel.refresh()

  assert.deepEquals(res, expected)
})

test('getById', async assert => {
  const readModelBuilder = proxyquire('../readModelBuilder', {
    ...defaultStubs,
    'serverless-cqrs.read-model': {
      ...defaultStubs['serverless-cqrs.read-model'],
      queryServiceBuilder: {
        build: params => ({
          getById: () => params
        })
      }
    },
  })
  const expected = {
    repository: {
      adapter: 'barfoo',
      reducer,
    }
  }

  const readModel = readModelBuilder.build(defaultOptions)
  const res = readModel.getById()

  assert.deepEquals(res, expected)
})

test('getByIds', async assert => {
  const readModelBuilder = proxyquire('../readModelBuilder', {
    ...defaultStubs,
    'serverless-cqrs.read-model': {
      ...defaultStubs['serverless-cqrs.read-model'],
      queryServiceBuilder: {
        build: params => ({
          getByIds: () => params
        })
      }
    },
  })

  const expected = {
    repository: {
      adapter: 'barfoo',
      reducer,
    }
  }

  const readModel = readModelBuilder.build(defaultOptions)
  const res = readModel.getByIds()

  assert.deepEquals(res, expected)
})

test('search', async assert => {
  const readModelBuilder = proxyquire('../readModelBuilder', {
    ...defaultStubs,
    'serverless-cqrs.read-model': {
      ...defaultStubs['serverless-cqrs.read-model'],
      queryServiceBuilder: {
        build: params => ({
          search: () => params
        })
      }
    },
  })

  const expected = {
    repository: {
      adapter: 'barfoo',
      reducer,
    }
  }

  const readModel = readModelBuilder.build(defaultOptions)
  const res = readModel.search()

  assert.deepEquals(res, expected)
})