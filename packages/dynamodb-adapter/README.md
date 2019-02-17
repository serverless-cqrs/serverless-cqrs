# dynamodb-adapter

A library that implements the [Write Model](../advanced/repository/write-model.md) Adapter interface for storing events on dynamodb.

Here's an example of the table config in CloudFormation syntax:

```yaml
    EventStoreTable:
      Type: 'AWS::DynamoDB::Table'
      Properties:
        TableName: someEntity ## <- your table name here
        AttributeDefinitions: 
          - AttributeName: entityId
            AttributeType: S
          - AttributeName: version
            AttributeType: N
          - AttributeName: entityName
            AttributeType: S
          - AttributeName: commitId
            AttributeType: S
        KeySchema:
          - AttributeName: entityId
            KeyType: HASH
          - AttributeName: version
            KeyType: RANGE
        GlobalSecondaryIndexes:
        - IndexName: someEntityByCommitId ## <- your index name here
          KeySchema:
          - AttributeName: entityName
            KeyType: HASH
          - AttributeName: commitId
            KeyType: RANGE
          Projection:
            ProjectionType: ALL
```

## Methods

### build

`build({ entityName }, { tableName, indexName, ...awsOptions )` 

builds a write model adapter 

#### Parameters

| attribute | type | description |
| :--- | :--- | :--- |
| `entityName` | `string` | the name of the entity |
| `tableName` | `string` | the name of the dynamodb table |
| `indexName` | `string` | the name of the index sorting commits by `commitId` |
| `...awsOptions` | `object` | any additional arguments are passed along to AWS, like so:`new AWS.DynamoDB(awsOptions)` |

#### Returns

an object with [write model methods](../advanced/repository/write-model.md#methods)

## Example

```javascript
const dynamoAdapterBuilder = require('serverless-cqrs.dynamodb-adapter')
module.exports = dynamoAdapterBuilder.build({ 
  entityName: 'todo'
}, {
  tableName: 'todos',
  indexName: 'todosByCommitId',
  region: 'eu-west-1',
})
```
