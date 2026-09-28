/*
  A refresh service brings your read model up to date by pulling new commits from the event store
  and applying them on top of your existing projections. It resumes from the checkpoint (the last
  commit it applied) stored in the projection store, and moves the checkpoint forward after each batch.

  Events must be applied consecutively. i.e. if an existing projection record exists, it's version number (the number events
  used to derive the current state) must be the same as the version number of the event we want to apply (the number of preceding events)
  if the projection is already past that commit, we skip it. If it's behind, events are missing, so we rebuild that entity from its
  full history instead. The missing events may be from before the checkpoint, where the refresh would never see them.

  An entity that can't be rebuilt either is reported and skipped, and the checkpoint moves past it anyway: otherwise one broken
  entity would stop the read model from ever catching up.

  To reconstruct projections from scratch, use the rebuild service instead.
*/

import {
  EventStore,
  FailedEntity,
  ID,
  ReadModelRepository,
  RefreshService,
} from "@serverless-cqrs/types";
import { mapWithConcurrency } from "./mapWithConcurrency";

const REPAIR_CONCURRENCY = 10;

export function build<AggregateShape, EventShape>({
  repository,
  eventStore,
}: {
  repository: ReadModelRepository<AggregateShape, EventShape>;
  eventStore: EventStore<EventShape>;
}): RefreshService<EventShape> {
  // rebuild entities that are missing commits, returning any that still can't be rebuilt.
  const repair = async (ids: ID[]) => {
    const entities = await mapWithConcurrency(ids, REPAIR_CONCURRENCY, (id) =>
      eventStore.loadCommits(id)
    );
    const { failed } = await repository.rebuild(entities);

    // a conflict means a concurrent write already moved the projection past these commits.
    return failed.filter((f) => f.reason !== "conflict");
  };

  return {
    applyEvents: async ({ entityId, events, version }) => {
      await repository.applyEvents(entityId, events, version);
    },

    getAggregateEvents: async (aggregateId: string) => {
      return eventStore.loadEvents(aggregateId);
    },
    refresh: async ({ requireCheckpoint = false } = {}) => {
      const failed = [] as FailedEntity[];

      if (requireCheckpoint && !(await repository.getCheckpoint()))
        return { failed };

      while (true) {
        // load new commits
        const checkpoint = await repository.getCheckpoint();
        const commits = await eventStore.listCommits(checkpoint);

        if (commits.length == 0)
          // if there are no more commits to process, return
          return { failed };

        const { behind } = await repository.applyCommits(commits);
        if (behind.length > 0) {
          const unrepaired = await repair(behind);
          for (const entity of unrepaired)
            console.error("refresh couldn't rebuild entity:", JSON.stringify(entity));
          failed.push(...unrepaired);
        }

        await repository.setCheckpoint(commits[commits.length - 1].commitId);

        console.log("processed commits:", commits.length);
      }
    },
  };
}
