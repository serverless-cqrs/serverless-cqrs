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
  // With no checkpoint yet, it replays the whole stream. While a rebuild with reset is in
  // progress, it does nothing and returns `paused: true`, until finalizeRebuild.
  refresh: () => Promise<{ failed: FailedEntity[]; paused?: boolean }>;
}

export interface RebuildPlan {
  // the checkpoint to set once every partition has been rebuilt: the latest commit, or
  // the start of the stream if the event store is empty.
  checkpoint: string;
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
  // capture the checkpoint, split the event stream into partitions, and optionally wipe
  // the projection store. A reset pauses refreshes until finalizeRebuild. Wait a while
  // (see settleMs on rebuild) before scanning, so commits that were in flight when the
  // checkpoint was read have landed.
  planRebuild: (options: {
    targetPartitionSize: number;
    reset?: boolean;
  }) => Promise<RebuildPlan>;
  rebuildPartition: (options: { partition: Partition }) => Promise<RebuildResult>;
  rebuildEntities: (options: { ids: ID[] }) => Promise<RebuildResult>;
  // set the checkpoint from the plan, which resumes refreshes after a reset. Call it
  // only once nothing has failed, then refresh.
  finalizeRebuild: (options: { checkpoint: string }) => Promise<void>;
  // run every step in this process with bounded concurrency. It stops before
  // finalizing if any entity failed, and returns the checkpoint so you can retry the
  // failures with rebuildEntities and then call finalizeRebuild yourself. Once finalized,
  // `failed` holds any entities the closing refresh couldn't repair.
  rebuild: (options?: {
    targetPartitionSize?: number;
    concurrency?: number;
    reset?: boolean;
    settleMs?: number;
  }) => Promise<RebuildResult & { checkpoint: string }>;
}

export interface ReadModel<AggregateShape, EventShape>
  extends RefreshService<EventShape>,
    RebuildService,
    QueryService<AggregateShape> {}
