/*
  A refresh handler is for rebuilding your readmodel by replaying events to your repository
  it gets injected with an event adapter (where it loads events from) and a projection repo (where it writes the rebuilt entities)

  The event repo must implement an iterator method which we can loop through to get batches of records
  for each group of events, the refresh method attempts to load any existing projections and the apply those events.

  Events must be applied consecutively. i.e. if an existing projection record exists, it's version number (the number events 
  used to derive the current state) must be the same as the version number of the event we want to apply (the number of preceding events)
  if they don't match, we don't throw an error, just ignore that event. 
*/

const groupBy = require('lodash.groupby')

module.exports.build = ({ repository, eventAdapter }) => ({
  refresh: async () => {    
    const eventsIterator = eventAdapter.scanIterator()

    for (let promise of eventsIterator) {
      // in node v8 , you can't use async inside generators, so we return a promise and await for it here
      const events = await promise 

      // group events by id, so we can load the projection records
      const eventsById = groupBy(events, 'id') 
      const ids = Object.keys(eventsById)
    
      const { results, save } = await repository.getByIds(ids)
    
      // we need to make sure that we apply events to projections in order, and that we dont skip or double-apply any events
      // we look at the version of the projection (which counts events used to dervie the current state) and compare it to the
      // vesion of the the event (which counts all previous events). Those version numbers should match. If they don't, it means that we
      // are either missing an event, or we already applied this one. Either way, we ignore this event and continue.
      // TODO: maybe we should in fact throw, if we are missing an event, because that means we will never catch up.

      const validEventsById = ids.reduce((p, id) => {
        //a projection's version number is a count of records used to derive the current state
        const existingVersion = results[id] && results[id].version 

        //an event's version number is the count of all preceding events.
        const eventVersion = eventsById[id][0].version 
        
        if (existingVersion && existingVersion !== eventVersion) {
          console.error('inconsecutive', id, existingVersion, eventVersion)
          return p
        }
    
        return {
          ...p,
          [ id ]: eventsById[id].reduce((p, c) => [ ...p, ...c.events ], [])
        }
      }, {})

      const length = Object.keys(validEventsById).length
    
      console.log('processed events:', events.length, 'updated records:', length)
      if (length > 0)
        await save(validEventsById)
    }
  }
})