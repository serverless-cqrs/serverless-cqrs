import {
  // AdapterConfig,
  ID,
  Commit,
  EventStore,
  ProjectionStore,
  Projection,
  VersionLock,
} from "@serverless-cqrs/types";

interface MemoryAdapter<ProjectionShape, EventShape>
  extends ProjectionStore<ProjectionShape>,
    EventStore<EventShape> {
  addListener: (id: ID, func: (c: Commit<EventShape>) => void) => void;
  removeListener: (id: ID) => void;
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
  metadataStore?: {
    [index: string]: VersionLock;
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
    metadataStore = {},
  }: MemoryAdapterConfig<AggregateShape, EventShape> = {}
): MemoryAdapter<AggregateShape, EventShape> {
  if (!eventStore[entityName]) eventStore[entityName] = [];
  if (!projectionStore[entityName]) projectionStore[entityName] = {};
  if (!metadataStore[entityName])
    metadataStore[entityName] = {
      lastCommitId: "",
      version: -1,
    };

  const eventClient = eventStore[entityName];
  const projClient = projectionStore[entityName];
  const versionLock = metadataStore[entityName];

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
    listCommits: async (sinceCommitId = "0") => {
      const res = eventClient.filter((e) => e.commitId > sinceCommitId);
      return res;
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

    setVersionLock: async ({ version, lastCommitId }) => {
      if (versionLock.version >= version) throw "versionAlreadyExists";
      versionLock.lastCommitId = lastCommitId;
      versionLock.version = version;
    },
    getVersionLock: async () => {
      return versionLock;
    },

    batchGet: async (ids) => {
      return ids.map((id) => projClient[id]).filter((e) => !!e);
    },
    batchWrite: async (obj) => {
      Object.keys(obj).forEach((id) => {
        projClient[id] = {
          id,
          ...obj[id],
        };
      });
    },
    search: async (filter) => {
      const data = Object.values(projClient).filter(filter);

      return {
        data,
        total: data.length,
      };
    },
  };
}
