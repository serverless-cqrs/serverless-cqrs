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

// An opaque, JSON-serializable slice of the event stream. It's produced by
// EventStore.listPartitions and handed back, unmodified, to EventStore.scanPartition,
// possibly by a different process (e.g. a worker in a fan-out).
export type Partition = unknown;

// An entity a rebuild couldn't write, and why. Retry these by id.
export interface FailedEntity {
  entityId: ID;
  reason: string;
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
  state?: ProjectionShape;
  version: number;
}
export interface SearchResults<ProjectionShape> {
  data: Projection<ProjectionShape>[];
  total: number;
}
