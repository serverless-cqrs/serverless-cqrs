/*
  A repository controls access to the underlying datastore.
  Outermore layers must call it to get/set entity projections.
  It should implement the following methods:

  getById(id: String)
  // returns an object with the following properties:
  // {
  //   state: Object, // the current projection state
  //   version: Integer, // the number of events used to calculate the current projection state
  //   save: Function (events), // a function for appending new events to the projection,
  // }
  // `getById` is called by the eventHandler and the queryHandler


  getByIds(ids: [String])
  // returns an object with the following properties
  // {
  //   results: [{      // an array of projection objects with the following properties:
  //     state: String, // the current projection state
  //     vesion: Integer, // the number of events used to calculate the current projection state
  //   }],
  //   save: Function (events) // a function for appending new events to any of the returned projections
  // }
  // `getByIds` is called by the queryHandler and the refreshHandler


  search(params: Object) // used by the queryHandler. just forwards params object to the underlying adapter  
  
*/

module.exports.build = (client, reducer) => {
  const applyEvents = (events, { state, version=0 }) => ({
    version: version + events.length,
    state: reducer(events, state)
  })
    
  return {
    getById: async (id) => {
      const { state, version } = await client.get(id)

      return {
        state,
        version,
        save: events => {
          const reduced = applyEvents(events, { state, version })
          return client.set(id, reduced)
        },
      }
    },
    getByIds: async (ids) => {
      const results = ids && ids.length !== 0
        ? await client.batchGet(ids)
        : []

      return {
        results,
        save: eventsByIds => {

          const reduced = Object.keys(eventsByIds).reduce((p, id) => {
            const existing = p[id] || results.find(e => e.id === id)

            if (!existing) {
              console.error('won\'t process', id)
              return p
            }

            return {
              ...p,
              [ id ]: applyEvents(eventsByIds[id], existing)
            }
          }, {})

          return client.batchWrite(reduced)
        },
      }     
    },
    search: params => {
      return client.search(params)
    }, 
  }
}