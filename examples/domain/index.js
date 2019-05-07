const {
  readModel,
  writeModel,
} = require('./src')

module.exports.handler = async (event, context, callback) => {
  const { type, id, payload } = event

  try {
    if (writeModel[type]) {
      const res = await writeModel[type](id, payload)
      callback(null, res)
    } else if (readModel[type]) {
      const res = await readMode[type](payload)
      callback(null, res)
    } else {
      throw new Error('not supported: ' + type)
    }
  } catch (e) {
    callback(e)
  }
}