import { Actions, EventStore, Reducer } from "@serverless-cqrs/types";
import {
  repositoryBuilder,
  commandServiceBuilder,
} from "@serverless-cqrs/write-model";

export function build<
  AggregateShape,
  EventShape,
  ActionsShape extends Actions
>({
  actions,
  reducer,
  eventStore,
}: {
  actions: ActionsShape;
  reducer: Reducer<AggregateShape, EventShape>;
  eventStore: EventStore<EventShape>;
}) {
  // *** REPOSITORY ***
  // First lets use the adapter and the reducer to create a Repository.
  // This is the layer that can return the current state of an entity
  // it can also take new events and append them to the entities event stream.
  const repository = repositoryBuilder.build({
    eventStore,
    reducer,
  });

  // *** SERVICES ***
  // let's initialize the command service.
  // Commands are the mechanism through which external applications
  // add changes to our entities.
  // The command service builder is takes two parameters:
  // build({
  //   actions, // an object containing action functions
  //   repository, // a repository that provides access to the data store
  // })
  return commandServiceBuilder.build({
    actions,
    repository,
  });
}
