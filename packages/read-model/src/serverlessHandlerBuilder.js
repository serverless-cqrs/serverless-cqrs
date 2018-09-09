const vandium = require('vandium');


module.exports.build = ({ queries, eventHandler, refresh }) => {
  const obj = {}
  
  if (queries)
    obj.queries = vandium.generic()
      .handler(event => {
        console.log(event)
        const { type, payload } = event
    
        if (!queries[type])
          return Promise.reject('not supported: ' + type)
    
        return queries[type](payload)
      })


  if (eventHandler)
    obj.eventHandler = vandium.dynamodb(async records => {
      for (var record of records) {
        if (record.dynamodb.NewImage) {
          try {
            await handleEvent(record.dynamodb.NewImage)
          } catch(e) {
            console.log(JSON.stringify(e, null, 2))
            throw e
          }
        }
      }
    })

  if (refresh)
    obj.refresh = vandium.generic()
      .handler(refresh)

  return obj
}