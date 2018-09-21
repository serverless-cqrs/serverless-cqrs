const {
  repositoryBuilder,
  commandServiceBuilder,
  serverlessHandlerBuilder,
} = require('serverless-cqrs.write-model')

const dynamoAdapter = require('serverless-cqrs.dynamodb-adapter')

const makeClient = ({ adapter, options }) => {
  switch (adapter) {
    case 'dynamodb':
      return dynamoAdapter.makeClient(options)
    default:
      throw 'Unknown client adapter: ' + adapter
  }
}

module.exports.serverlessHandler = serverlessHandlerBuilder

module.exports.build = ({ 
  entityName, 
  actions, 
  reducer,
  client,
  clientConfig={},
}) => {

  console.log(clientConfig)
  if (!client) {
    client = makeClient(clientConfig)
  }
  
  // *** REPOSITORY ***
  // First let's get our database adapter. This is the module that knows how to talk 
  // to the underlying database
  const adapter = client.build({
    entityName,
  })
  
  // then we use the adapter and the reducer to create a Repository. 
  // This is the layer that can return the current state of an entity
  // it can also take new events and append them to the entities event stream.
  const repository = repositoryBuilder.build({
    adapter,
    reducer,
  })
  
  // *** SERVICES ***
  // let's initialize the command service. 
  // Commands are the mechanism through which external applications
  // add changes to our entities.
  // The command service builder is takes two parameters:
  // build({
  //   actions, // an object containing action functions
  //   repository, // a repository that provides access to the data store
  // })
  return commandServiceBuilder.build({
    actions,
    repository,
  })
}