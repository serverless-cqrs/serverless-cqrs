/*
  A repository controls access to the underlying datastore.
  Outermore layers must call it to get the current state of
  the entity, and to append events to it.
  It should implement the following methods:

  getById(id: String)
  // returns an object with the following properties:
  // {
  //   state: Object, // the current entity state
  //   save: Function (events), // a function for appending new events to the entity,
  // }
*/

module.exports.build = ({ client, reducer }) => ({
  getById: async id => {
    const history = await client.loadEvents(id)
    return {
      state: reducer(history),
      save: events => client.append(id, history.length, events)
    }
  },
})
