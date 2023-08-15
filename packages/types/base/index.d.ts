export type ID = string;

export type Aggregate<AggregateShape> = {
  id: ID;
} & AggregateShape;

export interface Commit<EventShape> {
  id: ID;
  events: EventShape[];
  commitId: ID;
  committedAt: number;
  entity: string;
  version: number;
}

export interface VersionLock {
  lastCommitId: string;
  version: number;
}

export type Reducer<StateShape, EventShape> = (
  events: EventShape[],
  state?: StateShape
) => StateShape;

interface Actions {
  [index: string]: (...args: any[]) => any;
}

export interface Projection<ProjectionShape> {
  id: ID;
  state: ProjectionShape;
  version: number;
}
export interface SearchResults<ProjectionShape> {
  data: Projection<ProjectionShape>[];
  total: number;
}
