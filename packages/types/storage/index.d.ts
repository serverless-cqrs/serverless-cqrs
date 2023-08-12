import { Commit, ID, Projection, VersionLock } from "../base";

export interface EventStore<EventShape> {
  loadEvents: (id: ID, version: number) => Promise<EventShape[]>;
  listCommits: (sinceCommitId?: string) => Promise<Commit<EventShape>[]>;
  append: (id: ID, version: number, events: EventShape[]) => Promise<void>;
}

export interface ProjectionStore<ProjectionShape> {
  set: (projection: Projection<ProjectionShape>) => Promise<void>;
  get: (id: ID) => Promise<Projection<ProjectionShape>>;
  setVersionLock: (versionLock: VersionLock) => Promise<void>;
  getVersionLock: () => Promise<VersionLock>;
  batchGet: (ids: ID[]) => Promise<Projection<ProjectionShape>[]>;
  batchWrite: (obj: {
    [index: ID]: Omit<Projection<ProjectionShape>, "id">;
  }) => Promise<void>;
  // search: (params: any) => Promise<SearchResults<ProjectionShape>>;
}

export interface SearchResults<AggregateShape> {
  data: Projection<AggregateShape>[];
  total: number;
}

// export interface ProjectionAdapter<AggregateShape, EventShape> {
//   set: (id: ID, state: Projection<AggregateShape>) => Promise<void>;
//   getVersionLock: () => Promise<VersionLock>;
//   setVersionLock: (versionLock: VersionLock) => Promise<void>;
//   get: (id: ID) => Promise<AdapterProjection<AggregateShape>>;
//   batchGet: (ids: ID[]) => Promise<AdapterProjection<AggregateShape>[]>;
//   batchWrite: (projections: ProjectionsById<AggregateShape>) => Promise<void>;
//   search: (params: any) => Promise<{
//     data: RepositoryProjection<AggregateShape, EventShape>[];
//     total: number;
//   }>;
// }

// export interface EventStore<EventShape> {
//   parseCommit: (commit: object) => Commit<EventShape>;
//   loadEvents: (id: ID, version: number) => Promise<EventShape[]>;
//   listCommits: (versionLock: VersionLock) => Promise<Commit<EventShape>[]>;
// }
