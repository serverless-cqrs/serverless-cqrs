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

import {
  EventStore,
  Reducer,
  WriteModelRepository,
} from "@serverless-cqrs/types";

export function build<AggregateShape, EventShape>({
  eventStore,
  reducer,
}: {
  eventStore: EventStore<EventShape>;
  reducer: Reducer<AggregateShape, EventShape>;
}): WriteModelRepository<AggregateShape, EventShape> {
  return {
    getById: async (id) => {
      const history = await eventStore.loadEvents(id);
      return {
        state: reducer(history),
        save: (events) => eventStore.append(id, history.length, events),
      };
    },
  };
}
