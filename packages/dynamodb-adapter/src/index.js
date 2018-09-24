const AWS = require('aws-sdk')
const cuid = require('cuid')

module.exports.makeClient = ({ tableName, indexName, ...awsOptions }) => ({
  build: ({ entityName }) => {
    const dynamodb = new AWS.DynamoDB(awsOptions)

    const parseCommit = i => {
      if (i.entityName.S !== entityName) return

      return {
        id: i.entityId.S,
        version: parseInt(i.version.N),
        entity: i.entityName.S,
        commitId: i.commitId.S,
        events: JSON.parse(i.events.S),
      }
    }

    return {
      parseCommit,
      loadEvents: (entityId, version=0) => {
        const params = {
          TableName: tableName,
          ConsistentRead: true,
          KeyConditionExpression: 'entityId = :id and version >= :v',
          ExpressionAttributeValues: {
            ':id': { S: entityId },
            ':v': { N: version.toString() },
          }
        }

        return dynamodb
          .query(params)
          .promise()
          .then(({ Items }) => {
            return Items.reduce((p, c) => [ ...p, ...JSON.parse(c.events.S) ], [])
          })
      },
      listCommits: ({ commitId='0' }={}) => {
        const params = {
          TableName: tableName,
          IndexName: indexName,
          KeyConditionExpression: 'entityName = :entityName and commitId > :commitId',
          ExpressionAttributeValues: {
            ':entityName': { S: entityName },
            ':commitId': { S: commitId },
          },
        }

        return dynamodb
          .query(params)
          .promise()
          .then(({ Items }) => {              
            return Items.map(parseCommit)
          })
      },
      append: (entityId, version, events) => {
        const now = Date.now()
        const commitId = cuid()

        const params = {
          TableName: tableName,
          Item: {
            commitId: { S: commitId },
            committedAt: { N: now.toString() },
            entityId: { S: entityId },
            entityName: { S: entityName },
            version: { N: version.toString() },
            events: { S: JSON.stringify(events) }
          },
          ConditionExpression: 'attribute_not_exists(version)',
          ReturnValues: 'NONE'
        }

        return dynamodb
          .putItem(params)
          .promise()
          .catch(function (err) {
            if (err.name === 'ConditionalCheckFailedException') {
              throw new Error('A commit already exists with the specified version')
            }

            throw err
          })
      }
    }
  }
})
