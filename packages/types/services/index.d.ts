import { Commit, ID } from "../base";

export interface EventService<EventShape> {
  handleEvent: (commit: Commit<EventShape>) => Promise<void>;
}

export type QueryServiceResult<ProjectionShape> = {
  id: ID;
} & ProjectionShape;

export interface QueryService<ProjectionShape> {
  getById: ({
    id,
  }: {
    id: ID;
  }) => Promise<QueryServiceResult<ProjectionShape> | undefined>;
  getByIds: ({
    ids,
  }: {
    ids: ID[];
  }) => Promise<QueryServiceResult<ProjectionShape>[]>;
  search: (params: any) => Promise<QueryServiceSearchResults<ProjectionShape>>;
}

export interface QueryServiceSearchResults<ProjectionShape> {
  total: number;
  data: QueryServiceResult<ProjectionShape>[];
}

export interface RefreshService<EventShape> {
  applyEvents: (commit: Commit<EventShape>) => Promise<void>;
  getAggregateEvents: (aggregateId: string) => Promise<EventShape[]>;
  refresh: () => Promise<void>;
}
