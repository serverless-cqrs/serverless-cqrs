module.exports.buildCommands = commands => async (event, context, callback) => {
  const { type, id, payload } = event
  
  if (!commands[type])
    return callback('not supported: ' + type)

  const res = await commands[type](id, payload)

  return callback(null, res)
}

module.exports.buildQueries = queries => async (event, context, callback) => {
  const { type, payload } = event
  
  if (!queries[type])
    return callback('not supported: ' + type)

  const res = await queries[type](payload)

  return callback(null, res)
}

module.exports.buildRefresh = refresh => async (event, context, callback) => {
  const { entityName } = event

  const res = await refresh({ entityName })

  return callback(null, res)
}

module.exports.buildDynamoStreamHandler = handler => async (event, context, callback) => {
  const { Records } = event
  const results = []
  
  for (const record of Records) {
    if (record.dynamodb.NewImage) {
      try {
        const res = await handler(record.dynamodb.NewImage)
        results.push(res)
      } catch(e) {
        console.log(e)
        return callback(e)
      }
    }
  }

  return callback(null, results)
}