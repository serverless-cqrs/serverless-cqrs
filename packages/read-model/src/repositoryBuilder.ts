/*
  A repository controls access to the underlying datastore.
  Outermore layers must call it to get/set entity projections.
  It should implement the following methods:

  getById(id: String)
  // returns an object with the following properties:
  // {
  //   state: Object, // the current projection state
  //   version: Integer, // the number of events used to calculate the current projection state
  //   save: Function (events), // a function for appending new events to the projection,
  // }
  // `getById` is called by the eventHandler and the queryHandler


  getByIds(ids: [String])
  // returns an object with the following properties
  // {
  //   results: [{      // an array of projection objects with the following properties:
  //     state: String, // the current projection state
  //     vesion: Integer, // the number of events used to calculate the current projection state
  //   }],
  //   save: Function (events) // a function for appending new events to any of the returned projections
  // }
  // `getByIds` is called by the queryHandler and the refreshHandler


  search(params: Object) // used by the queryHandler. just forwards params object to the underlying adapter  
  
*/

import {
  ProjectionStore,
  Reducer,
  ReadModelRepository,
  Projection,
  ID,
  VersionLock,
} from "@serverless-cqrs/types";

export function build<ProjectionShape, EventShape>({
  projectionStore,
  reducer,
}: {
  projectionStore: ProjectionStore<ProjectionShape>;
  reducer: Reducer<ProjectionShape, EventShape>;
}): ReadModelRepository<ProjectionShape, EventShape> {
  const applyEvents = (
    events: EventShape[],
    { id, state, version }: Projection<ProjectionShape>
  ) => ({
    id,
    state: reducer(events, state),
    version: version + events.length,
  });

  return {
    getVersionLock: async () => {
      const { lastCommitId = "", version = 0 } =
        (await projectionStore.getVersionLock()) || ({} as VersionLock);

      return {
        lastCommitId,
        version,
        save: async (commits) => {
          await projectionStore.setVersionLock({
            version: version + commits.length,
            lastCommitId: commits[commits.length - 1].commitId,
          });
        },
      };
    },
    getById: async (id) => {
      return await projectionStore.get(id);
    },
    getByIds: async (ids = []) => {
      return ids.length !== 0 ? await projectionStore.batchGet(ids) : [];
    },

    applyEvents: async (id, events, version) => {
      const projection =
        (await projectionStore.get(id)) ||
        ({
          id,
          state: null,
          version: 0,
        } as Projection<ProjectionShape>);

      // version is a count of events
      // for a projection, it's the number of events used to derive the current state
      // for an event commit, it's the number of preceding events
      // therefore, when receiving a new event commit, it's version should always match the
      // version of our projection before applying these events
      // if it doesn't, that means we've missed an event and need to fetch the missing ones

      // if the commit version is higher than the projection version it means that there are events missing
      if (projection.version < version) throw new Error("versionMismatch");
      // if the projection version is higher it means this events have already been applied, so skip
      if (projection.version > version) return;

      const reduced = applyEvents(events, projection);
      return projectionStore.set(reduced);
    },
    applyCommits: async (commits) => {
      const projections = {} as { [index: ID]: Projection<ProjectionShape> };
      console.log(commits);
      for (const { id, version, events } of commits) {
        const projection = projections[id] ||
          (await projectionStore.get(id)) || {
            id: id,
            state: null,
            version: 0,
          };

        // if the commit version is higher than the projection version it means that there are events missing
        if (projection.version < version) throw new Error("versionMismatch");
        // if the projection version is higher it means this events have already been applied, so skip
        if (projection.version > version) continue;

        const newProjection = applyEvents(events, projection);
        projections[id] = newProjection;
      }

      await projectionStore.batchWrite(projections);
    },
    search: (params) => {
      return projectionStore.search(params);
    },
  };
}
