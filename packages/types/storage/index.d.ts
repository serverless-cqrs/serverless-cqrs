import { Commit, ID, Partition, Projection } from "../base";

export interface EventStore<EventShape> {
  loadEvents: (id: ID, version?: number) => Promise<EventShape[]>;
  // every commit for one entity, in ascending version order.
  loadCommits: (id: ID) => Promise<Commit<EventShape>[]>;
  listCommits: (sinceCommitId?: string) => Promise<Commit<EventShape>[]>;
  append: (id: ID, version: number, events: EventShape[]) => Promise<void>;
  // the newest commitId, or undefined if there are no commits.
  getLatestCommitId: () => Promise<string | undefined>;
  // split the stream into partitions of roughly `targetSize` commits each. The size
  // is an estimate, not a guarantee.
  listPartitions: (options: { targetSize: number }) => Promise<Partition[]>;
  // yield every entity in the partition exactly once, as all of its commits in
  // ascending version order. An entity must never appear in more than one partition.
  scanPartition: (partition: Partition) => AsyncIterable<Commit<EventShape>[]>;
}

export interface ProjectionStore<ProjectionShape> {
  set: (projection: Projection<ProjectionShape>) => Promise<void>;
  get: (id: ID) => Promise<Projection<ProjectionShape> | undefined>;
  // the commitId that refresh has applied up to.
  getCheckpoint: () => Promise<string | undefined>;
  setCheckpoint: (commitId: string) => Promise<void>;
  // delete every projection, but not the checkpoint: the rebuild service manages that.
  reset: () => Promise<void>;
  batchGet: (ids: ID[]) => Promise<Projection<ProjectionShape>[]>;
  // writes a projection only if its version is newer than the stored one, or, with
  // overwriteSameVersion, at least as new. Projections that lose that check are
  // skipped and returned as conflicts; the rest of the batch is still written.
  batchWrite: (
    obj: {
      [index: ID]: Omit<Projection<ProjectionShape>, "id">;
    },
    options?: { overwriteSameVersion?: boolean }
  ) => Promise<{ conflicts: ID[] }>;
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
      filter?: never;
      rawQuery: any;
      rawSearch?: never;
    } & BasicListParams)
  | {
      filter?: never;
      rawQuery?: never;
      rawSearch: any;
      pagination?: never;
      sort?: never;
    };

interface StorageSearchResults<ProjectionShape> {
  data: Projection<ProjectionShape>[];
  total: number;
}
