/*
  An event handler forwards new events to the repository to be added to a projection
  
  Before adding an event to a projection, we check the version number to make sure it's the
  one we are expecting. If it's not, we try to load any missing events using the provided eventAdapter

  We also require the eventAdapter to help us parse the received event.
*/

module.exports.build = ({ repository, eventAdapter }) => ({
  handleEvent: async payload => {
    const parsed = eventAdapter.parseCommit(payload)
    if (!parsed) return
    
    const { id, version, events } = parsed
    const res = await repository.getById(id)

    // version is a count of events
    // for a projection, it's the number of events used to derive the current state
    // for an event commit, it's the number of preceding events
    // therefore, when receiving a new event commit, it's version should always match the
    // version of our projection before applying these events
    // if it doesn't, that means we've missed an event and need to fetch the missing ones
    if (version !== res.version) {
      const events = await eventAdapter.loadEvents(id, res.version)
      console.log('VERSION MISMATCH. LOADED EVENTS:', events)
      return await res.save(events)
    } else {
      return await res.save(events)
    }
  }
})