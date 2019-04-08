
module.exports.build = ({ entityName }, { eventStore={}, projectionStore={}, metadataStore={} }={}) => {
  const eventClient = eventStore[entityName] || (eventStore[entityName] = [])
  const projClient = projectionStore[entityName] || (projectionStore[entityName] = {})
  const metadata = metadataStore[entityName] || (metadataStore[entityName] = {})

  const listeners = {}
  const notifyListeners = commit => Object.values(listeners).map(func => func(commit))

  return {
    addListener: (id, func) => {
      listeners[id] = func
    },
    removeListener: id => {
      delete listeners[id]
    },
    parseCommit: c => c,
    loadEvents: async (id, version=-1) => {
      const res = eventClient.filter(e => e.id == id && e.version > version)
        .reduce((p, c) => [ ...p, ...c.events ], [])
      return res
    },
    listCommits: async ({ commitId='0' }={}) => {
      const res = eventClient.filter(e => e.commitId > commitId)
      return res
    },
    append: async (id, version, events) => {
      const committedAt = Date.now()
      const commitId = committedAt.toString() + Math.random().toString(36).slice(2, 8)

      const commit = {
        id,
        events,
        commitId,
        committedAt,
        entity: entityName,
        version: parseInt(version),
      }
    
      eventClient.push(commit)
      notifyListeners(commit)
      return true
    },
    set: async (id, { version, state }) => {
      if (projClient[id] && projClient[id].version >= version) throw 'versionAlreadyExists'

      projClient[id] = { id, version, state }

      return state
    },
    get: async (id) => {
      return projClient[id]
    },

    setMetadata: async ({ version, state }) => {
      if (metadata.version >= version) throw 'versionAlreadyExists'
      metadata.state = state
      metadata.version = version

      return state
    },
    getMetadata: async () => {
      return metadata
    },

    batchGet: async (ids) => {
      return ids.map(id => projClient[id]).filter(e => !!e)
    },
    batchWrite: async (obj) => {
      Object.keys(obj).forEach(id => {
        projClient[id] = {
          id,
          ...obj[id]
        }
      })
      return {}
    },
    search: async (params) => {
      const data = Object.values(projClient).filter(e => {
        return Object.keys(params).every(key => e.state[key] == params[key])
      })

      return {
        data,
        total: data.length,
      }
    },
  }
}
