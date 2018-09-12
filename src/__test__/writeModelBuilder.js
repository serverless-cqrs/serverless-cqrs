const { test } = require('tap')
const proxyquire = require('proxyquire')

const build = params => params

const writeModelBuilder = proxyquire('../writeModelBuilder', {
  'serverless-cqrs.write-model': {
    repositoryBuilder: { build },
    commandServiceBuilder: { build },
  },
  'serverless-cqrs.dynamodb-adapter': {
    makeClient: () => ({ build })
  },
})

test('build', async assert => {
  const reducer = (p, c) => ({ ...p, ...c })

  const actions = {
    foo: 'bar'
  }
  const expected = {
    actions,
    repository: {
      adapter: {
        entityName: 'fooBar',
      },
      reducer,
    }
  }

  const readModel = writeModelBuilder.build({
    entityName: 'fooBar', 
    clientConfig: {
      adapter: 'dynamodb',
    },
    reducer,
    actions,
  })

  assert.deepEquals(readModel, expected)
})
