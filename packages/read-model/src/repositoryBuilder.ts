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
        await projectionStore.getVersionLock();

      return {
        lastCommitId,
        version,
        save: (commits) => {
          projectionStore.setVersionLock({
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

    applyCommit: async ({ id, version, events }) => {
      const projection = (await projectionStore.get(id)) || {
        id,
        state: null,
        version: 0,
      };

      if (projection.version !== version) throw new Error("versionMismatch");

      const reduced = applyEvents(events, projection);
      return projectionStore.set(reduced);
    },
    applyCommits: async (commits) => {
      const projections = {} as { [index: ID]: Projection<ProjectionShape> };

      for (const commit of commits) {
        const projection = projections[commit.id] ||
          (await projectionStore.get(commit.id)) || {
            id: commit.id,
            state: null,
            version: 0,
          };

        if (projection.version !== commit.version)
          throw new Error("versionMismatch");

        const newProjection = applyEvents(commit.events, projection);

        projections[commit.id] = newProjection;
      }

      await projectionStore.batchWrite(projections);
    },
    // search: (params) => {
    //   return projectionStore.search(params);
    // },
  };
}
