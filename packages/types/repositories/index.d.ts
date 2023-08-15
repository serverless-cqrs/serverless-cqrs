import { ID, VersionLock, Projection, Commit, Aggregate } from "../base";
import { StorageSearchResults } from "../storage";

export interface RepositoryVersionLock extends VersionLock {
  save: (commits: { commitId: string }[]) => Promise<void>;
}

export interface ReadModelRepository<ProjectionShape, EventShape> {
  getVersionLock: () => Promise<RepositoryVersionLock>;
  getById: (id: ID) => Promise<Projection<ProjectionShape> | undefined>;
  getByIds: (ids: ID[]) => Promise<Projection<ProjectionShape>[]>;
  applyEvents: (id: ID, events: EventShape[], version: number) => Promise<void>;
  applyCommits: (commits: Commit<EventShape>[]) => Promise<void>;
  search: (params: any) => Promise<StorageSearchResults<ProjectionShape>>;
}

export interface WriteModelRepository<AggregateShape, EventShape> {
  getById: (id: ID) => Promise<{
    state: AggregateShape;
    save: (events: EventShape[]) => Promise<void>;
  }>;
}

// export interface RepositoryResult<ProjectionShape, EventShape> {
//   state: RepositoryProjection<ProjectionShape>,
//   save: (events: EventShape[]) => void;
// }

// export interface RepositoryProjection<ProjectionShape> {
//   id: ID;
//   state: ProjectionShape;
//   version: number;
//   // save: (events: EventShape[]) => void;
// }
