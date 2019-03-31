const makeSignedRequest = require('./makeSignedRequest')
const NDJSON = require('./NDJSON')

const parseResult = ({ _id, _version=0, _source }) => ({
  id: _id,
  version: _version,
  state: _source,
})

const parseJson = text => {
	try {
		return JSON.parse(text)
	} catch (e) {
		return text
	}
}


module.exports.build = ({ 
  entityName 
}, { 
  endpoint, 
}) => {
  const basePath = '/entities/' + entityName
  const metaPath = '/entities/__meta__/' + entityName

  const defaults = {
    endpoint,
    method: 'GET',
  }

  return {
    set: async (id, { version, state }) => {
      const { body } = await makeSignedRequest({
        ...defaults,
        method: state ? 'PUT' : 'DELETE',
        path: basePath + '/' + encodeURIComponent(id) + '?version_type=external&version=' + version,
        body: JSON.stringify(state),
      })

      return parseJson(body)
    },
    get: async (id) => {
      const { body } = await makeSignedRequest({
        ...defaults,
        path: basePath + '/' + encodeURIComponent(id),
      }).catch(e => {
        if (e.statusCode === 404)
          return e
          
        throw e
      })

      const data = parseJson(body)
      return parseResult(data)
    },

    setMetadata: async ({ version, state }) => {
      const { body } = await makeSignedRequest({
        ...defaults,
        method: state ? 'PUT' : 'DELETE',
        path: metaPath + '?version_type=external&version=' + version,
        body: JSON.stringify(state),
      })

      return parseJson(body)
    },
    getMetadata: async () => {
      const { body } = await makeSignedRequest({
        ...defaults,
        path: metaPath,
      }).catch(e => {
        if (e.statusCode === 404)
          return e
          
        throw e
      })

      const data = parseJson(body)
      return parseResult(data)
    },
    batchGet: async (ids) => {
      const { body } = await makeSignedRequest({
        ...defaults,
        path: basePath + '/_mget',
        body: JSON.stringify({ ids }),
      })
  
      const data = parseJson(body)
      const found = data.docs.filter(r => r.found)
      return found.map(parseResult)
    },
    batchWrite: async (obj) => {
      const content = Object.keys(obj).reduce((p, id) => {
        const { version, state } = obj[id]
        if (!state)
          return [ 
            ...p, 
            { 
              delete: { 
                _id: id,
              }, 
            }
          ]

        return [
          ...p,
          { 
            index: { 
              _id: id, 
              _version: version, 
              version_type: 'external',
            }
          },
          state,      
        ]
      }, [])

      const { body } = await makeSignedRequest({
        ...defaults,
        method: 'POST',
        path: basePath + '/_bulk',
        body: NDJSON.stringify(content),
      })

      const data = parseJson(body)

      return data.items.reduce((p, c) => {
        const { _id, error } = c.index || c.delete
        if (!error) return p

        return {
          ...p,
          [ _id ]: error
        }
      }, {})
    },
    search: async (params) => {
      const { body } = await makeSignedRequest({
        ...defaults,
        path: basePath + '/_search',
        body: JSON.stringify({ 
          version: true,
          ...params,
        }),
      })

      const data = parseJson(body)
      const { total, hits } = data.hits

      return {
        total,
        data: hits.map(parseResult)
      }
    },
  }
}
