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
  state: StateShape
) => StateShape;

export interface Projection<ProjectionShape> {
  id: ID;
  state: ProjectionShape;
  version: number;
}

interface CommitsById<EventShape> {
  [index: ID]: Commit<EventShape>[];
}

interface EventsById<EventShape> {
  [index: ID]: EventShape[];
}

interface ProjectionsById<ProjectionShape> {
  [index: ID]: Projection<ProjectionShape>;
}
