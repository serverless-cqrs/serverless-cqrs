const {
  repositoryBuilder,
  queryServiceBuilder,
  eventServiceBuilder,
  refreshServiceBuilder,
  serverlessHandlerBuilder,
} = require('serverless-cqrs.read-model')

const dynamoAdapter = require('serverless-cqrs.dynamodb-adapter')
const elasticAdapter = require('serverless-cqrs.elasticsearch-adapter')

const makeClient = ({ adapter, options }) => {
  switch (adapter) {
    case 'dynamodb':
      return dynamoAdapter.makeClient(options)
    case 'elasticsearch':
      return elasticAdapter.makeClient(options)
    default:
      throw 'Unknown client adapter: ' + adapter
  }
}

module.exports.buildHandler = serverlessHandlerBuilder

module.exports.build = ({ 
  entityName, 
  reducer, // *** DOMAIN *** reducer is the pure function that reduces an event stream into the current state of an entity.
  client,
  clientConfig={},
  eventClient,
  eventClientConfig={},
}) => {

  if (!client) {
    client = makeClient(clientConfig)
  }

  if (!eventClient) {
    eventClient = makeClient(eventClientConfig)
  }
  
  // *** REPOSITORY ***
  // First let's get our database adapter. This is the module that knows how to talk 
  // to the underlying database
  const adapter = client.build({
    entityName,
  })
  
  // then we use the adapter and the reducer to create a Repository. 
  // This is the layer that can return the current state of a projection
  // it can also take new events, and use them to update the projection's state.
  const repository = repositoryBuilder.build({
    adapter,
    reducer,
  })
    
  // *** SERVICES ***
  // Services interact with the repository to get or update information about
  // projection. They can also have access to the event stream adapter 
  // for help working with the event stream.

  // first let's initialize the eventAdapter. This gives us access 
  // to the event stream
  const eventAdapter = eventClient.build({
    entityName,
  })

  // then let's initialize the event service. 
  // inbound events are one way to apply updates to your projection.
  // the event service listens for updates and uses the event adapter to 
  // parse them before passing them to the repo. The event service also knows
  // how to fetch missing events in case the event version is not 
  // the one we are expecting
  const eventService = eventServiceBuilder.build({
    repository,
    eventAdapter,
  })

  // next let's initialize the refresh service.
  // we'll use this if we ever want manually load events,
  // like if we make a schema change and we need to rebuild all projections.
  const refreshService = refreshServiceBuilder.build({
    repository,
    eventAdapter,
  })

  // finally we'll initialize the query service, our main interface 
  // for accessing projections.
  // the query service optionaly takes an event adapter, if we want to
  // be able to use strong consistency
  const queryService = queryServiceBuilder.build({
    repository,
    eventAdapter,
  })

  return {
    handleEvent: eventService.handleEvent,
    refresh: refreshService.refresh,
    getById: queryService.getById,
    getByIds: queryService.getByIds,
    search: queryService.search,
  }
}
