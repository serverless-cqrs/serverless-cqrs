export type ID = string;

export type Aggregate<AggregateShape> = {
  id: ID;
} & AggregateShape;

export interface Commit<EventShape> {
  entityId: ID;
  events: EventShape[];
  commitId: ID;
  committedAt: number;
  entityName: string;
  version: number;
}

export interface VersionLock {
  lastCommitId?: string;
  version?: number;
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
  state: ProjectionShape | undefined;
  version: number;
}
export interface SearchResults<ProjectionShape> {
  data: Projection<ProjectionShape>[];
  total: number;
}
