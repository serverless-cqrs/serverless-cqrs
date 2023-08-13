/*
  A refresh handler is for rebuilding your readmodel by replaying events to your repository
  it gets injected with an event adapter (where it loads events from) and a projection repo (where it writes the rebuilt entities)

  The event repo must implement an iterator method which we can loop through to get batches of records
  for each group of events, the refresh method attempts to load any existing projections and the apply those events.

  Events must be applied consecutively. i.e. if an existing projection record exists, it's version number (the number events 
  used to derive the current state) must be the same as the version number of the event we want to apply (the number of preceding events)
  if they don't match, we don't throw an error, just ignore that event. 
*/

import {
  EventStore,
  ReadModelRepository,
  RefreshService,
} from "@serverless-cqrs/types";

// function sanitizeCommits<AggregateShape, EventShape>(
//   groupedCommits: CommitsById<EventShape>,
//   projections: Projection<AggregateShape>[]
// ) {
//   // we look at the version of the projection (which counts events used to dervie the current state) and compare it to the
//   // vesion of the the event (which counts all previous events). Those version numbers should match. If they don't, it means that we
//   // are either missing an event, or we already applied this one.
//   // if the projection has a HIGHER version number it means we already applied this commit, so we can safely ignore it.
//   // if the projection has a LOWER version number, it means that we're missing some commits and our store is inconsistent, so we throw.

//   const projectionsById = projections.reduce(
//     (p, c) => ({
//       ...p,
//       [c.id]: c,
//     }),
//     {} as ProjectionsById<AggregateShape>
//   );

//   return Object.keys(groupedCommits).reduce((pre, id) => {
//     const [commit] = groupedCommits[id]; // get the first commit
//     const record = projectionsById[id] || { version: 0 };

//     if (record.version > commit.version) return pre; // skip if we already applied this version

//     if (record.version < commit.version) {
//       console.error(JSON.stringify({ record, commit }, null, 2));
//       throw "missingVersions"; // throw if we're missing a version
//     }

//     return {
//       ...pre,
//       [id]: groupedCommits[id],
//     };
//   }, {} as CommitsById<EventShape>);
// }

export function build<AggregateShape, EventShape>({
  repository,
  eventStore,
}: {
  repository: ReadModelRepository<AggregateShape, EventShape>;
  eventStore: EventStore<EventShape>;
}): RefreshService {
  return {
    refresh: async () => {
      while (true) {
        // load new commits
        const versionLock = await repository.getVersionLock();
        const commits = await eventStore.listCommits(versionLock.lastCommitId);

        if (commits.length == 0)
          // if there are no more commits to process, return
          return;

        await repository.applyCommits(commits);

        await versionLock.save(commits);

        console.log("processed commits:", commits.length);
      }
    },
  };
}
