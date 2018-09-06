const { test } = require('tap')
const proxyquire = require('proxyquire')

const AWS = require('aws-sdk-mock')
const AWS_SDK = require('aws-sdk')

AWS.setSDKInstance(AWS_SDK);

const defaultStubs = {
  '../../lib/env': {
    write_model_tablename: 'fooTable'
  }
}

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

  const { makeClient } = proxyquire('../index', defaultStubs)
  const res = await makeClient('foo').loadEvents('p123')

  assert.deepEquals(sentParams, expectedParams, 'queries dynamodb for events')
  assert.deepEquals(res, events, 'returns parsed events')
  

  AWS.restore('DynamoDB', 'query')
})


test('scanIterator', async assert => {
  var sentParams
  var i = 0
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

  AWS.mock('DynamoDB', 'scan', function (params, callback) {
    sentParams = params

    const e = events.slice(i, ++i)

    var response = { 
      Items: [{ 
        entityId: {
          S: 'e123',
        },
        entityName: {
          S: 'foo',
        },
        version: {
          N: i.toString(),
        },
        events: { 
          S: JSON.stringify(e) ,
        }, 
      }] 
    }

    if (i < events.length) {
      response.LastEvaluatedKey = { HASH: { N: i.toString() } }
    }

    callback(null, response)
  })


  const { makeClient } = proxyquire('../index', defaultStubs)
  const { scanIterator } = makeClient('foo')
  const results = []
  
  for (let promise of scanIterator()) {
    const res = await promise
    
    results.push(...res)

    const expectedParams = {
      TableName: 'fooTable',
      Limit: 500,
      ExclusiveStartKey: i < events.length
        ? { HASH: { N: i.toString() } }
        : null,
      ExpressionAttributeValues: {
        ':entityName': {
          'S': 'foo',
        },
      },
      FilterExpression: 'entityName = :entityName',
    }

    assert.deepEquals(sentParams, expectedParams, 'scans dynamodb using ExclusiveStartKey key')

  }
  const expected = events.map(( e, i ) => ({
    id: 'e123',
    version: i + 1,
    events: [ e ],
  }))

  assert.deepEquals(results, expected, 'returns all events')
  

  AWS.restore('DynamoDB', 'scan')
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
      commitId: { S: /\d*:p123/ },
      committedAt: { N: /\d*/ },
      entityId: { S: 'p123' },
      entityName: { S: 'foo' },
      version: { N: '3' },
      events: { S: JSON.stringify(events) }
    },
    ConditionExpression: 'attribute_not_exists(version)',
    ReturnValues: 'NONE'
  }

  const { makeClient } = proxyquire('../index', defaultStubs)
  const res = await makeClient('foo').append('p123', 3, events)

  assert.match(sentParams, expectedParams, 'makes putItem request to dynamodb')
  
  
  AWS.mock('DynamoDB', 'putItem', function (params, callback) {
    callback(new Error('ConditionalCheckFailedException'))
  })

  await makeClient('foo').append('p123', 3, events).catch(e => {
    assert.equals(e.message('A commit already exists with the specified version'))
  })

  AWS.restore('DynamoDB', 'putItem')
})