import { Commit, FailedEntity, ID, Partition } from "../base";

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
  // apply every commit after the checkpoint on top of the existing projections, and move the
  // checkpoint forward. An entity whose projection is missing earlier commits is rebuilt from
  // its full history instead. If that fails too, it's returned in `failed` and the checkpoint
  // still moves past it, so one broken entity can't hold up the rest.
  //
  // requireCheckpoint: do nothing if there's no checkpoint yet, rather than replaying the
  // whole event store. Use it for background refreshes that might run during a rebuild with
  // reset, which removes the checkpoint until the rebuild finishes.
  refresh: (options?: {
    requireCheckpoint?: boolean;
  }) => Promise<{ failed: FailedEntity[] }>;
}

export interface RebuildPlan {
  // the commit to set the checkpoint to once every partition has been rebuilt.
  // undefined if the event store is empty.
  checkpoint?: string;
  partitions: Partition[];
}

export interface RebuildResult {
  rebuilt: number;
  failed: FailedEntity[];
}

// Rebuilds projections from scratch. Every method except rebuild() is one step of a
// fan-out, sized to run in a single worker, with JSON-serializable input and output:
//
//   planRebuild → (wait) → rebuildPartition for each partition, in parallel
//     → rebuildEntities for any failed ids → finalizeRebuild → refresh
//
// Rebuilding is idempotent, so any step can be retried.
export interface RebuildService {
  // optionally wipe the projection store, then capture the checkpoint and split the
  // event stream into partitions. Wait a while (see settleMs on rebuild) before
  // scanning, so commits that were in flight when the checkpoint was read have landed.
  planRebuild: (options: {
    targetPartitionSize: number;
    reset?: boolean;
  }) => Promise<RebuildPlan>;
  rebuildPartition: (options: { partition: Partition }) => Promise<RebuildResult>;
  rebuildEntities: (options: { ids: ID[] }) => Promise<RebuildResult>;
  // set the checkpoint from the plan. Call it only once nothing has failed, then refresh.
  finalizeRebuild: (options: { checkpoint?: string }) => Promise<void>;
  // run every step in this process with bounded concurrency. It stops before
  // finalizing if any entity failed, and returns the checkpoint so you can retry the
  // failures with rebuildEntities and then call finalizeRebuild yourself. Once finalized,
  // `failed` holds any entities the closing refresh couldn't repair.
  rebuild: (options?: {
    targetPartitionSize?: number;
    concurrency?: number;
    reset?: boolean;
    settleMs?: number;
  }) => Promise<RebuildResult & { checkpoint?: string }>;
}

export interface ReadModel<AggregateShape, EventShape>
  extends RefreshService<EventShape>,
    RebuildService,
    QueryService<AggregateShape> {}
