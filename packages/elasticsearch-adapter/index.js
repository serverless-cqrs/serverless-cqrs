const pluralize = require('pluralize')

const makeSignedRequest = require('./makeSignedRequest')
const NDJSON = require('./NDJSON')

const parseResult = ({ _id, _version=0, _source }) => ({
  id: _id,
  version: _version,
  state: _source,
})

module.exports.makeClient = ({ endpoint, region }) => ({
  build: entityName => {
    const prefix = pluralize(entityName) + '/' + entityName
    const defaults = {
      endpoint,
      region,
      service: 'es',
      method: 'GET',
    }

    return {
      set: async (id, { version, state }) => {
        const { data } = await makeSignedRequest({
          ...defaults,
          method: state ? 'PUT' : 'DELETE',
          path: '/' + prefix + '/' + encodeURIComponent(id) + '?version_type=external&version=' + version,
          body: state,
        })

        return data
      },
      get: async (id) => {
        const { data } = await makeSignedRequest({
          ...defaults,
          path: '/' + prefix + '/' + encodeURIComponent(id),
        }).catch(e => {
          if (e.response.status === 404)
            return e.response
            
          throw e
        })
        
        return parseResult(data)
      },
      batchGet: async (ids) => {
        const { data } = await makeSignedRequest({
          ...defaults,
          path: '/' + prefix + '/_mget',
          body: { ids },
        })
    
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

        const { data } = await makeSignedRequest({
          ...defaults,
          method: 'POST',
          path: '/' + prefix + '/_bulk',
          body: NDJSON.stringify(content),
        })

        return data.items.reduce((p, c) => {
          const { _id, error } = c.index
          if (!error) return p

          return {
            ...p,
            [ _id ]: error
          }
        }, {})
      },
      search: async (params) => {
        const { data } = await makeSignedRequest({
          ...defaults,
          path: '/' + prefix + '/_search',
          body: { 
            version: true,
            ...params,
          },
        })
        
        const { total, hits } = data.hits

        return {
          total,
          data: hits.map(parseResult)
        }
      },
    }
  }
})
