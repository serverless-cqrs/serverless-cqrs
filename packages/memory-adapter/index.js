module.exports.makeClient = ({
  eventStore = {},
  projectionStore = {},
}={}) => ({
  build: ({ entityName }) => {
    const eventClient = eventStore[entityName] || (eventStore[entityName] = [])
    const projClient = projectionStore[entityName] || (projectionStore[entityName] = {})

    return {
      parseCommit: c => c,
      loadEvents: async (entityId, version=0) => {
        const res = eventClient.filter(e => e.entityId == entityId && e.version > version)
          .reduce((p, c) => [ ...p, ...c.events ], [])
        return res
      },
      listCommits: async ({ commitId='0' }={}) => {
        const res = eventClient.filter(e => e.commitId > commitId)
        return res
      },
      append: async (entityId, version, events) => {
        const committedAt = Date.now()
        const commitId = committedAt.toString() + Math.random().toString(36).slice(2, 8)

        eventClient.push({
          commitId,
          committedAt,
          entityId,
          entityName,
          version,
          events,
        })

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
        return Object.values(projClient).filter(e => {
          return Object.keys(params).every(key => e.state[key] == params[key])
        })
      },
    }
  }
})
