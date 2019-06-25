/*
*/

module.exports.build = ({ effects, eventAdapter }) => ({
  handleEvent: async payload => {
    const parsed = eventAdapter.parseCommit(payload)
    if (!parsed) return

    const {
      id,
      version,
      entity,
      commitId,
      events,
    } = parsed 
  
    for (const event of events) {
        await effects({
          id,
          version,
          entity,
          commitId,
          event,
        })
    }

  }
})