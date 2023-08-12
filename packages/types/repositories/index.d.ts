import { ID, VersionLock, Projection, Commit, EventsById } from "../base";

export interface RepositoryVersionLock extends VersionLock {
  save: (commits: { commitId: string }[]) => void;
}

export interface ReadModelRepository<ProjectionShape, EventShape> {
  getVersionLock: () => Promise<RepositoryVersionLock>;
  getById: (id: ID) => Promise<Projection<ProjectionShape>>;
  getByIds: (ids: ID[]) => Promise<Projection<ProjectionShape>[]>;
  applyCommit: (commit: Commit<EventShape>) => Promise<void>;
  applyCommits: (commits: Commit<EventShape>[]) => Promise<void>;

  // search: (params: any) => Promise<{
  //   data: Projection<AggregateShape>[];
  //   total: number;
  // }>;
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
