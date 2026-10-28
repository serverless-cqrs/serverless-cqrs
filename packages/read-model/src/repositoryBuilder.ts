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
  Commit,
  FailedEntity,
  ID,
} from "@serverless-cqrs/types";

const emptyProjection = <ProjectionShape>(id: ID) =>
  ({
    id,
    state: null,
    version: 0,
  } as Projection<ProjectionShape>);

const errorMessage = (err: unknown) =>
  err instanceof Error ? err.message : String(err);

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

  // reduce an entity's complete history from scratch. Commits must be contiguous from
  // version 0; a gap means events are missing, and a projection built without them
  // would be silently wrong, so we throw instead.
  const buildProjection = (entityId: ID, commits: Commit<EventShape>[]) => {
    const sorted = [...commits].sort((a, b) => a.version - b.version);
    const events = [] as EventShape[];

    for (const commit of sorted) {
      if (commit.entityId !== entityId)
        throw new Error(`unexpected commit for entity ${commit.entityId}`);
      if (commit.version !== events.length)
        throw new Error(
          `versionMismatch: expected version ${events.length}, got ${commit.version}`
        );

      events.push(...commit.events);
    }

    return applyEvents(events, emptyProjection<ProjectionShape>(entityId));
  };

  return {
    getCheckpoint: () => projectionStore.getCheckpoint(),
    setCheckpoint: (commitId) => projectionStore.setCheckpoint(commitId),
    getById: async (id, options) => {
      return await projectionStore.get(id, options);
    },
    getByIds: async (ids = [], options) => {
      return ids.length !== 0 ? await projectionStore.batchGet(ids, options) : [];
    },

    applyEvents: async (id, events, version) => {
      const projection =
        (await projectionStore.get(id)) || emptyProjection<ProjectionShape>(id);

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
      const behind = new Set<ID>();
      const ids = [...new Set(commits.map(({ entityId }) => entityId))];
      const values = await projectionStore.batchGet(ids);

      for (const { entityId, version, events } of commits) {
        if (behind.has(entityId)) continue;

        const projection =
          projections[entityId] ||
          values.find((v) => v.id == entityId) ||
          emptyProjection<ProjectionShape>(entityId);

        // if the commit version is higher than the projection version it means that there are events missing.
        // Leave the entity out entirely; the caller can rebuild it from its full history.
        if (projection.version < version) {
          behind.add(entityId);
          delete projections[entityId];
          continue;
        }
        // if the projection version is higher it means this events have already been applied, so skip
        if (projection.version > version) continue;

        const newProjection = applyEvents(events, projection);
        projections[entityId] = newProjection;
      }
      // conflicts are projections a concurrent writer has already moved past these
      // commits, so there's nothing left to apply to them.
      if (Object.keys(projections).length > 0)
        await projectionStore.batchWrite(projections);

      return { behind: [...behind] };
    },
    rebuild: async (entities) => {
      const projections = {} as { [index: ID]: Projection<ProjectionShape> };
      const failed = [] as FailedEntity[];

      for (const commits of entities) {
        if (commits.length === 0) continue;
        const { entityId } = commits[0];

        try {
          projections[entityId] = buildProjection(entityId, commits);
        } catch (err) {
          failed.push({ entityId, reason: errorMessage(err) });
        }
      }

      const ids = Object.keys(projections);
      if (ids.length === 0) return { rebuilt: 0, failed };

      // overwrite at the same version, since a rebuild usually recomputes the state
      // (e.g. after a reducer change) without adding events. A conflict means a
      // concurrent write moved the projection past what we read, so it was derived
      // from the old state; report it so it gets rebuilt again from the newer history.
      const { conflicts } = await projectionStore.batchWrite(projections, {
        overwriteSameVersion: true,
      });

      for (const entityId of conflicts)
        failed.push({ entityId, reason: "conflict" });

      return { rebuilt: ids.length - conflicts.length, failed };
    },
    search: (params) => {
      return projectionStore.search(params);
    },
    reset: () => {
      return projectionStore.reset();
    },
  };
}
