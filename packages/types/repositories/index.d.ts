import { ID, Projection, Commit, Aggregate, FailedEntity } from "../base";
import { StorageSearchResults } from "../storage";

export interface ReadModelRepository<ProjectionShape, EventShape> {
  getCheckpoint: () => Promise<string | undefined>;
  setCheckpoint: (commitId: string) => Promise<void>;
  getById: (id: ID) => Promise<Projection<ProjectionShape> | undefined>;
  getByIds: (ids: ID[]) => Promise<Projection<ProjectionShape>[]>;
  applyEvents: (id: ID, events: EventShape[], version: number) => Promise<void>;
  // apply commits on top of the existing projections. An entity whose projection is missing
  // earlier commits can't be applied; it's skipped and returned in `behind`, and the rest of
  // the batch is still written.
  applyCommits: (commits: Commit<EventShape>[]) => Promise<{ behind: ID[] }>;
  // reduce each entity from its complete commit history and overwrite its projection.
  // Each element of `entities` is one entity's commits.
  rebuild: (
    entities: Commit<EventShape>[][]
  ) => Promise<{ rebuilt: number; failed: FailedEntity[] }>;
  search: (params: any) => Promise<StorageSearchResults<ProjectionShape>>;
  reset: () => Promise<void>;
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
