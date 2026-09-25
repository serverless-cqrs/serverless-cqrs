import {
  // AdapterConfig,
  ID,
  Commit,
  EventStore,
  ProjectionStore,
  Projection,
} from "@serverless-cqrs/types";

interface MemoryAdapter<ProjectionShape, EventShape>
  extends ProjectionStore<ProjectionShape>,
    EventStore<EventShape> {
  addListener: (id: ID, func: (c: Commit<EventShape>) => void) => void;
  removeListener: (id: ID) => void;
}

const matches = (params: Record<string, any>, obj: Record<string, any>) =>
  Object.keys(params).every((k) => obj[k] == params[k]);

// a stable string hash, used to assign entities to partitions.
const hash = (str: string) => {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  return h >>> 0;
};

interface MemoryPartition {
  segment: number;
  totalSegments: number;
}

export interface MemoryAdapterConfig<AggregateShape, EventShape> {
  eventStore?: {
    [index: string]: Commit<EventShape>[];
  };
  projectionStore?: {
    [index: string]: {
      [index: ID]: Projection<AggregateShape>;
    };
  };
  checkpointStore?: {
    [index: string]: string;
  };
}

interface BuildParams {
  entityName: string;
}

export function build<AggregateShape, EventShape>(
  { entityName }: BuildParams,
  {
    eventStore = {},
    projectionStore = {},
    checkpointStore = {},
  }: MemoryAdapterConfig<AggregateShape, EventShape> = {}
): MemoryAdapter<AggregateShape, EventShape> {
  if (!eventStore[entityName]) eventStore[entityName] = [];
  if (!projectionStore[entityName]) projectionStore[entityName] = {};

  const eventClient = eventStore[entityName];
  const projClient = projectionStore[entityName];

  const byVersion = (a: Commit<EventShape>, b: Commit<EventShape>) =>
    a.version - b.version;

  const listeners = {} as { [index: string]: Function };

  const notifyListeners = (commit: Commit<EventShape>) =>
    Object.values(listeners).map((func) => func(commit));

  return {
    addListener: (id, func) => {
      listeners[id] = func;
    },
    removeListener: (id: ID) => {
      delete listeners[id];
    },
    loadEvents: async (id, version = -1) => {
      const res = eventClient
        .filter((e) => e.entityId == id && e.version > version)
        .reduce((p, c) => [...p, ...c.events], [] as EventShape[]);
      return res;
    },
    loadCommits: async (id) => {
      return eventClient.filter((e) => e.entityId == id).sort(byVersion);
    },
    listCommits: async (sinceCommitId = "0") => {
      const res = eventClient.filter((e) => e.commitId > sinceCommitId);
      return res;
    },
    getLatestCommitId: async () => {
      return eventClient.reduce<string | undefined>(
        (latest, { commitId }) =>
          latest === undefined || commitId > latest ? commitId : latest,
        undefined
      );
    },
    listPartitions: async ({ targetSize }) => {
      const totalSegments = Math.max(
        1,
        Math.ceil(eventClient.length / targetSize)
      );
      return Array.from({ length: totalSegments }, (_, segment) => ({
        segment,
        totalSegments,
      }));
    },
    scanPartition: async function* (partition) {
      const { segment, totalSegments } = partition as MemoryPartition;
      const entities = new Map<ID, Commit<EventShape>[]>();

      for (const commit of eventClient) {
        if (hash(commit.entityId) % totalSegments !== segment) continue;
        if (!entities.has(commit.entityId)) entities.set(commit.entityId, []);
        entities.get(commit.entityId)!.push(commit);
      }

      for (const commits of entities.values()) yield commits.sort(byVersion);
    },
    append: async (entityId: ID, version: number, events: EventShape[]) => {
      const committedAt = Date.now();
      const commitId =
        committedAt.toString() + Math.random().toString(36).slice(2, 8);

      const commit: Commit<EventShape> = {
        entityId,
        events,
        commitId,
        committedAt,
        entityName,
        version: parseInt(version.toString()),
      };

      eventClient.push(commit);
      notifyListeners(commit);
    },
    set: async ({ id, version, state }) => {
      if (projClient[id]?.version >= version) throw "versionAlreadyExists";

      projClient[id] = { id, version, state };
    },
    get: async (id) => {
      return projClient[id];
    },
    reset: async () => {
      // clear in place: projClient is the same object as projectionStore[entityName]
      Object.keys(projClient).forEach((id) => delete projClient[id]);
      delete checkpointStore[entityName];
    },

    setCheckpoint: async (commitId) => {
      checkpointStore[entityName] = commitId;
    },
    getCheckpoint: async () => {
      return checkpointStore[entityName];
    },

    batchGet: async (ids) => {
      return ids.map((id) => projClient[id]).filter((e) => !!e);
    },
    batchWrite: async (obj, { overwriteSameVersion = false } = {}) => {
      const conflicts = [] as ID[];

      Object.keys(obj).forEach((id) => {
        const existing = projClient[id];
        const isStale =
          existing &&
          (overwriteSameVersion
            ? existing.version > obj[id].version
            : existing.version >= obj[id].version);

        if (isStale) {
          conflicts.push(id);
          return;
        }

        projClient[id] = {
          id,
          ...obj[id],
        };
      });

      return { conflicts };
    },
    search: async ({ filter, rawQuery, rawSearch, pagination }) => {
      if (rawSearch) {
        const data = Object.values(projClient).filter(rawSearch);
        return {
          data,
          total: data.length,
        };
      }

      let data;

      if (filter)
        data = Object.values(projClient).filter((item) =>
          matches(
            filter as Record<string, any>,
            item.state as Record<string, any>
          )
        );
      else data = Object.values(projClient).filter(rawQuery);

      return {
        data: pagination
          ? data.slice(
              pagination.perPage * (pagination.page - 1),
              pagination.perPage * pagination.page
            )
          : data,
        total: data.length,
      };
    },
  };
}
