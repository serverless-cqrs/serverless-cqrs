# read-model

The `read-model` exports four methods: `repositoryBuilder`, `eventServiceBuilder`, `queryServiceBuilder`, and `refreshServiceBuilder`.

The query service is used to query the cached projection state of an entity. You can lookup entity by `id`, an array of `ids`, or whatever search parameters that are supported by your `adapter`.

The event service is used to handle incoming events from a write model subscription, and use those events to update the cached projection state. This the **push** approach we spoke about in [Eventual Consistency](../advanced/eventual-consistency.md).

The refresh service is used to manually load new events from the write model's datastore. This is the **pull** approach we spoke about in [Eventual Consistency](https://serverless-cqrs.gitbook.io/serverless-cqrs/advanced/eventual-consistency).

### Example

```javascript
const {
  repositoryBuilder,
  eventServiceBuilder,
  queryServiceBuilder,
  refreshServiceBuilder,
} = require('serverless-cqrs.read-model')

const reducer = require('./reducer')
const adapter = require('./adapter')
const eventAdapter = require('./eventAdapter')

const repository = repositoryBuilder({
  reducer,
  adapter,
})

const {
  getById,
  getByIds,
  search,
} = queryServiceBuilder.build({
  repository,
  //no eventAdapter because we don't need access to the write-models events
})

const {
  refresh,
} = refreshServiceBuilder.build({
  repository,
  eventAdapter,
})

const {
  handleEvent,
} = eventServiceBuilder.build({
  repository,
  eventAdapter,
})

module.exports = {
  getById,
  getByIds,
  search,
  refresh,
  handleEvent,
}



```
