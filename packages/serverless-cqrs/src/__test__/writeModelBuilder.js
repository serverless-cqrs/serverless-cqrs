const { test } = require('tap')
const proxyquire = require('proxyquire')

const build = params => params

const writeModelBuilder = proxyquire('../writeModelBuilder', {
  'serverless-cqrs.write-model': {
    repositoryBuilder: { build },
    commandServiceBuilder: { build },
  }
})

test('build', async assert => {
  const reducer = (p, c) => ({ ...p, ...c })

  const actions = {
    foo: 'bar'
  }
  const expected = {
    actions,
    repository: {
      adapter: 'foobar',
      reducer,
    }
  }

  const readModel = writeModelBuilder.build({
    adapter: 'foobar',
    reducer,
    actions,
  })

  assert.deepEquals(readModel, expected)
})
