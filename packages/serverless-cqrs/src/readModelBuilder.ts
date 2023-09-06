import {
  repositoryBuilder,
  queryServiceBuilder,
  refreshServiceBuilder,
} from "@serverless-cqrs/read-model";

import {
  ProjectionStore,
  EventStore,
  Reducer,
  RefreshService,
  QueryService,
} from "@serverless-cqrs/types";

interface ReadModel<AggregateShape, EventShape>
  extends RefreshService<EventShape>,
    QueryService<AggregateShape> {}

export function build<AggregateShape, EventShape>({
  reducer, // *** DOMAIN *** reducer is the pure function that reduces an event stream into the current state of an entity.
  projectionStore,
  eventStore,
}: {
  projectionStore: ProjectionStore<AggregateShape>;
  reducer: Reducer<AggregateShape, EventShape>;
  eventStore: EventStore<EventShape>;
}): ReadModel<AggregateShape, EventShape> {
  // *** REPOSITORY ***
  // First lets use the adapter and the reducer to create a Repository.
  // This is the layer that can return the current state of a projection
  // it can also take new events, and use them to update the projection's state.
  const repository = repositoryBuilder.build({
    projectionStore,
    reducer,
  });

  // *** SERVICES ***
  // Services interact with the repository to get or update information about
  // projection. They can also have access to the event stream adapter
  // for help working with the event stream.

  // next let's initialize the refresh service.
  // we'll use this to load any new events
  // like if we make a schema change and we need to rebuild all projections
  // or if a query asks for strong consistency.
  const refreshService = refreshServiceBuilder.build({
    repository,
    eventStore,
  });

  // finally we'll initialize the query service, our main interface
  // for accessing projections.
  const queryService = queryServiceBuilder.build({
    repository,
  });

  return {
    ...refreshService,
    ...queryService,
  };
}
