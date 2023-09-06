# memory-adapter

A library that implements the [Write Model](https://serverless-cqrs.gitbook.io/serverless-cqrs/advanced/repository/write-model) and [Read Model](https://serverless-cqrs.gitbook.io/serverless-cqrs/advanced/repository/read-model) Adapter interface for storing events and projections in memory. Useful for development and testing but not for production, obviously 😛.

## Methods

### build

`build({ entityName }, { eventStore, projectionStore )` 

builds a read-model and write-model adapter

#### Parameters

| attribute | type | description |
| :--- | :--- | :--- |
| `entityName` | `string` | the name of the entity |
| `eventStore` | `object` | \(optional\) an object where keys are `entityNames` and values are arrays of [commit](https://serverless-cqrs.gitbook.io/serverless-cqrs/advanced/repository/write-model#commit) objects |
| `projectionStore` | `object` | \(optional\) an object where keys are entity names and values are [projections](https://serverless-cqrs.gitbook.io/serverless-cqrs/advanced/repository/read-model#projection) objects keyed by `id` |

#### Returns

an object with [write model methods](https://serverless-cqrs.gitbook.io/serverless-cqrs/advanced/repository/write-model#methods) and [read model methods](https://serverless-cqrs.gitbook.io/serverless-cqrs/advanced/repository/read-model#methods)

## Example

```javascript
const memoryAdapterBuilder = require('serverless-cqrs.memory-adapter')
module.exports = memoryAdapterBuilder.build({ 
  entityName: 'todo'
})
```

You can also provide the initial `eventStore` and/or `projectionStore` objects \(both are optional\). This is useful when writing tests.

```javascript
const { test } = require('tap')
const { build } = require('serverless-cqrs.memory-adapter')

test('loadEvents', async assert => {
  const eventStore = {
    'foo': [
      { entityId: '123', version: 0, events: [ 'a' ] },
      { entityId: '123', version: 1, events: [ 'b', 'c' ]},
      { entityId: '123', version: 3, events: [ 'd', 'e', 'f' ] },
      { entityId: '123', version: 6, events: [ 'g', 'h', 'i' ] },
    ]
  }
  const expected = [ 'd', 'e', 'f', 'g', 'h', 'i' ]

  const adapter = build({ entityName: 'foo' }, { eventStore })
  
  const res = await adapter.loadEvents('123', 1)

  assert.deepEquals(res, expected, 'returns events after given version')
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
```
