import { Commit, ID, Projection, VersionLock } from "../base";

export interface EventStore<EventShape> {
  loadEvents: (id: ID, version?: number) => Promise<EventShape[]>;
  listCommits: (sinceCommitId?: string) => Promise<Commit<EventShape>[]>;
  append: (id: ID, version: number, events: EventShape[]) => Promise<void>;
}

export interface ProjectionStore<ProjectionShape> {
  set: (projection: Projection<ProjectionShape>) => Promise<void>;
  get: (id: ID) => Promise<Projection<ProjectionShape> | undefined>;
  setVersionLock: (versionLock: VersionLock) => Promise<void>;
  getVersionLock: () => Promise<VersionLock | null>;
  batchGet: (ids: ID[]) => Promise<Projection<ProjectionShape>[]>;
  batchWrite: (obj: {
    [index: ID]: Omit<Projection<ProjectionShape>, "id">;
  }) => Promise<void>;
  search: (
    params: ProjectionSearchParams<ProjectionShape>
  ) => Promise<StorageSearchResults<ProjectionShape>>;
}

interface BasicListParams {
  pagination?: {
    page: number;
    perPage: number;
  };
  sort?: {
    field: string;
    order: "DESC" | "ASC";
  };
}

type ProjectionSearchParams<ProjectionShape> =
  | ({
      filter?: Partial<ProjectionShape>;
      rawQuery?: never;
      rawSearch?: never;
    } & BasicListParams)
  | ({
      filter: never;
      rawQuery?: any;
      rawSearch?: never;
    } & BasicListParams)
  | {
      filter: never;
      rawQuery?: never;
      rawSearch?: any;
      pagination: never;
      sort: never;
    };

interface StorageSearchResults<ProjectionShape> {
  data: Projection<ProjectionShape>[];
  total: number;
}
