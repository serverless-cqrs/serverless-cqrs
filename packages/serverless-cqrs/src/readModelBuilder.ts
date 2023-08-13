import {
  repositoryBuilder,
  queryServiceBuilder,
  eventServiceBuilder,
  refreshServiceBuilder,
} from "@serverless-cqrs/read-model";

import {
  ProjectionStore,
  EventStore,
  Reducer,
  RefreshService,
  EventService,
  QueryService,
} from "@serverless-cqrs/types";

interface ReadModel<AggregateShape, EventShape>
  extends EventService<EventShape>,
    RefreshService,
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

  // First let's initialize the event service.
  // inbound events are one way to apply updates to your projection.
  // the event service listens for updates and uses the event adapter to
  // parse them before passing them to the repo. The event service also knows
  // how to fetch missing events in case the event version is not
  // the one we are expecting
  const eventService = eventServiceBuilder.build({
    repository,
  });

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
    ...eventService,
    ...refreshService,
    ...queryService,
    // handleEvent: eventService.handleEvent,
    // refresh: refreshService.refresh,
    // getById: queryService.getById,
    // getByIds: queryService.getByIds,
    // search: queryService.search,
  };
}
