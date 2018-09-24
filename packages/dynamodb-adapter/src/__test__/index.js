const { test } = require('tap')

const AWS = require('aws-sdk-mock')
const AWS_SDK = require('aws-sdk')

AWS.setSDKInstance(AWS_SDK);

const { makeClient } = require('../index')
const client = makeClient({ 
  tableName: 'fooTable', 
  indexName: 'fooIndex',
})

test('loadEvents', async assert => {
  var sentParams

  const events = [ 
    { foo: 'bar' }, 
    { bar: 'baz' },
    { baz: 'bar '},
    { zab: 'foo' },
  ]

  AWS.mock('DynamoDB', 'query', function (params, callback) {
    sentParams = params
    callback(null, {
      Count: 3,
      Items: [
        { events: { S: JSON.stringify(events.slice(0, 2)) } },
        { events: { S: JSON.stringify(events.slice(2)) } },
      ],
    })
  })

  
  const expectedParams = {
    TableName: 'fooTable',
    ConsistentRead: true,
    KeyConditionExpression: 'entityId = :id and version >= :v',
    ExpressionAttributeValues: {
      ':id': { S: 'p123' },
      ':v': { N: '0' },
    },
  }

  const res = await client.build({ entityName: 'foo' }).loadEvents('p123')

  assert.deepEquals(sentParams, expectedParams, 'queries dynamodb for events')
  assert.deepEquals(res, events, 'returns parsed events')
  

  AWS.restore('DynamoDB', 'query')
})


test('listCommits', async assert => {
  var sentParams
  const events = [ 
    'zero',
    'one',
    'two',
    'three',
    'four',
    'five',
    'six',
    'seven',
    'eight',
    'nine',
    'ten',
  ]

  const commits = events.map(( e, i ) => ({
    id: 'e123',
    entity: 'foo',
    commitId: 'c' + i.toString(),
    version: i + 1,
    events: [ e ],
  }))


  AWS.mock('DynamoDB', 'query', function (params, callback) {
    sentParams = params

    var response = { 
      Items: commits.map(c => ({ 
        entityId: {
          S: c.id,
        },
        commitId: {
          S: c.commitId,
        },
        entityName: {
          S: c.entity,
        },
        version: {
          N: c.version.toString(),
        },
        events: { 
          S: JSON.stringify(c.events) ,
        }, 
      }))
    }

    callback(null, response)
  })


  const { listCommits } = client.build({ entityName: 'foo' })

  const results = await listCommits()

  const expectedParams = {
    TableName: 'fooTable',
    IndexName: 'fooIndex',
    ExpressionAttributeValues: {
      ':entityName': {
        'S': 'foo',
      },
      ':commitId': {
        'S': '0'
      },
    },
    KeyConditionExpression: 'entityName = :entityName and commitId > :commitId',
  }

  assert.deepEquals(sentParams, expectedParams, 'queries dynamodb')


  assert.deepEquals(results, commits, 'returns all events')
  

  AWS.restore('DynamoDB', 'query')
})




test('append', async assert => {
  var sentParams

  AWS.mock('DynamoDB', 'putItem', function (params, callback) {
    sentParams = params
    callback()
  })

  const events = [ 
    { foo: 'bar' }, 
    { bar: 'baz' },
  ]
  
  const expectedParams = {
    Item: {
      commitId: { S: /\w*/ },
      committedAt: { N: /\d*/ },
      entityId: { S: 'p123' },
      entityName: { S: 'foo' },
      version: { N: '3' },
      events: { S: JSON.stringify(events) }
    },
    ConditionExpression: 'attribute_not_exists(version)',
    ReturnValues: 'NONE'
  }

  await client.build({ entityName: 'foo' }).append('p123', 3, events)

  assert.match(sentParams, expectedParams, 'makes putItem request to dynamodb')
  
  
  AWS.mock('DynamoDB', 'putItem', function (params, callback) {
    callback(new Error('ConditionalCheckFailedException'))
  })

  await client.build({ entityName: 'foo' }).append('p123', 3, events).catch(e => {
    assert.equals(e.message('A commit already exists with the specified version'))
  })

  AWS.restore('DynamoDB', 'putItem')
})