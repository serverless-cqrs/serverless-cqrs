const vandium = require('vandium');

module.exports.build = ({ commands }) => vandium.generic()
  .handler(event => {
    const { type, id, payload } = event
    
    if (!commands[type])
      return Promise.reject('not supported: ' + type)

    return commands[type](id, payload)
  })