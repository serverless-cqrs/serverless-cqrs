//load the builders
const { 
  readModelBuilder,
  writeModelBuilder
} = require('serverless-cqrs')


//load our domain
const actions = require('./domain/actions')
const reducer = require('./domain/reducer')


//load and build our adapters. Use env variables defined in serverless.yml
const dynamodbAdapterBuilder = require('serverless-cqrs.dynamodb-adapter')
const elasticAdapterBuilder = require('serverless-cqrs.elasticsearch-adapter')

const dynamoAdapter = dynamodbAdapterBuilder.build({ 
  entityName: 'todo',
}, {
  tableName: process.env.WRITE_MODEL_TABLENAME,
  indexName: process.env.WRITE_MODEL_INDEXNAME,
})

const elasticAdapter = elasticAdapterBuilder.build({
  entityName: 'todo',
}, {
  endpoint: process.env.ELASTIC_READ_MODEL_ENDPOINT,
  region: process.env.AWS_REGION,
})


//finally, build our models and export them
const readModel = readModelBuilder.build({
  reducer,
  adapter: elasticAdapter,
  eventAdapter: dynamoAdapter,
})

const writeModel = writeModelBuilder.build({
  actions,
  reducer,
  adapter: dynamoAdapter,
})

module.exports = {
  readModel,
  writeModel,
}