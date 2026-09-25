/*
  A refresh service brings your read model up to date by pulling new commits from the event store
  and applying them on top of your existing projections. It resumes from the checkpoint (the last
  commit it applied) stored in the projection store, and moves the checkpoint forward after each batch.

  Events must be applied consecutively. i.e. if an existing projection record exists, it's version number (the number events
  used to derive the current state) must be the same as the version number of the event we want to apply (the number of preceding events)
  if the projection is already past that commit, we skip it. If it's behind, events are missing and we throw.

  To reconstruct projections from scratch, use the rebuild service instead.
*/

import {
  EventStore,
  ReadModelRepository,
  RefreshService,
} from "@serverless-cqrs/types";

export function build<AggregateShape, EventShape>({
  repository,
  eventStore,
}: {
  repository: ReadModelRepository<AggregateShape, EventShape>;
  eventStore: EventStore<EventShape>;
}): RefreshService<EventShape> {
  return {
    applyEvents: async ({ entityId, events, version }) => {
      await repository.applyEvents(entityId, events, version);
    },

    getAggregateEvents: async (aggregateId: string) => {
      return eventStore.loadEvents(aggregateId);
    },
    refresh: async () => {
      while (true) {
        // load new commits
        const checkpoint = await repository.getCheckpoint();
        const commits = await eventStore.listCommits(checkpoint);

        if (commits.length == 0)
          // if there are no more commits to process, return
          return;

        await repository.applyCommits(commits);

        await repository.setCheckpoint(commits[commits.length - 1].commitId);

        console.log("processed commits:", commits.length);
      }
    },
  };
}
