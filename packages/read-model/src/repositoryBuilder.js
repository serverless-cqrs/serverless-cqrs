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

module.exports.build = ({ adapter, reducer }) => {
  const applyEvents = (events, { state, version=0 }) => ({
    version: version + events.length,
    state: reducer(events, state)
  })
    
  return {
    getMetadata: async () => {
      const metadata = (adapter.getMetadata) 
        ? await adapter.getMetadata()
        : {};
      const { state={}, version=0 } = metadata;

      return {
        state,
        version,
        save: commits => {
          return adapter.setMetadata({
            version: version + commits.length,
            state: commits[commits.length - 1],
          })
        }
      }
    },
    getById: async (id) => {
      const metadata = (adapter.get) 
        ? await adapter.get(id)
        : {};
      const { state, version } = metadata;

      if(adapter.set) {
        return {
          state,
          version,
          save: events => {
            const reduced = applyEvents(events, { state, version })
            return adapter.set(id, reduced)
          },
        }
      } else {
        return {};
      }
    },
    getByIds: async (ids) => {
      const results = ids && ids.length !== 0
        ? await adapter.batchGet(ids)
        : []

      return {
        results,
        save: eventsByIds => {

          const reduced = Object.keys(eventsByIds).reduce((p, id) => {
            const existing = p[id] || results.find(e => e.id === id) || { version: 0 }

            return {
              ...p,
              [ id ]: applyEvents(eventsByIds[id], existing)
            }
          }, {})

          return adapter.batchWrite(reduced)
        },
      }     
    },
    search: params => {
      return (adapter.search) 
        ? adapter.search(params)
        : {};
    }, 
  }
}