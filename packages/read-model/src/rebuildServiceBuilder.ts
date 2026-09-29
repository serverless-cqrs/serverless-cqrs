/*
  A rebuild service reconstructs projections from scratch: for every entity it loads the complete
  commit history, reduces it, and overwrites the projection. Unlike refresh, it doesn't depend on the
  existing projections or the checkpoint, so it can be split across many workers.

  The steps, each small enough for one worker, with JSON-serializable input and output:

  1. planRebuild: capture the latest commitId as the checkpoint (or the start of the stream, if the
     event store is empty), ask the event store to split the stream into partitions, and optionally
     wipe the projection store. No entity spans two partitions.
  2. wait: commits that were in flight when the checkpoint was read can still land with a lower
     commitId. Waiting before scanning gives them time to land so the scan picks them up.
  3. rebuildPartition, for each partition in parallel. Entities that can't be rebuilt (a reducer
     error, missing versions, or a concurrent write) are returned as failed rather than thrown.
  4. rebuildEntities: retry the failed ids once the cause is fixed.
  5. finalizeRebuild: set the checkpoint captured in step 1, then refresh to apply everything
     committed since. Re-applying a commit a projection already includes is a no-op, so the overlap
     between the rebuild and the refresh is safe.

  A rebuild with reset pauses refreshes until it's finalized: before wiping the projections, planRebuild
  replaces the checkpoint with a marker that refresh recognizes, and finalizeRebuild replaces the marker.
  If the rebuild is abandoned, refreshes stay paused (and log a warning) until another rebuild is
  finalized. Without reset, refreshes keep running alongside the rebuild.

  rebuild() runs every step in this process, which is enough for tests and small stores. For large
  stores, drive the steps from an orchestrator (e.g. a Step Functions Distributed Map over the partitions).
*/

import {
  Commit,
  EventStore,
  ReadModelRepository,
  RebuildResult,
  RebuildService,
} from "@serverless-cqrs/types";
import { build as buildRefreshService } from "./refreshServiceBuilder";
import { REBUILDING, START_OF_STREAM } from "./checkpoints";
import { mapWithConcurrency } from "./mapWithConcurrency";

const DEFAULT_PARTITION_SIZE = 10000;
const DEFAULT_CONCURRENCY = 10;
const DEFAULT_SETTLE_MS = 5000;
const DEFAULT_BATCH_SIZE = 100;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function build<AggregateShape, EventShape>({
  repository,
  eventStore,
  batchSize = DEFAULT_BATCH_SIZE,
}: {
  repository: ReadModelRepository<AggregateShape, EventShape>;
  eventStore: EventStore<EventShape>;
  // how many projections to write at once.
  batchSize?: number;
}): RebuildService {
  const refreshService = buildRefreshService({ repository, eventStore });

  // rebuild entities as they stream in, writing every `batchSize`, so a partition never has
  // to fit in memory.
  const rebuildEntities = async (
    entities: AsyncIterable<Commit<EventShape>[]> | Iterable<Commit<EventShape>[]>
  ) => {
    const result: RebuildResult = { rebuilt: 0, failed: [] };
    let batch = [] as Commit<EventShape>[][];

    const flush = async () => {
      const { rebuilt, failed } = await repository.rebuild(batch);
      result.rebuilt += rebuilt;
      result.failed.push(...failed);
      batch = [];
    };

    for await (const commits of entities) {
      batch.push(commits);
      if (batch.length >= batchSize) await flush();
    }
    if (batch.length > 0) await flush();

    return result;
  };

  const planRebuild: RebuildService["planRebuild"] = async ({
    targetPartitionSize,
    reset = false,
  }) => {
    // capture the checkpoint before anything is scanned. Commits after it are left for the
    // refresh that follows finalizeRebuild.
    const checkpoint = (await eventStore.getLatestCommitId()) ?? START_OF_STREAM;
    const partitions = await eventStore.listPartitions({
      targetSize: targetPartitionSize,
    });

    // pause refreshes before wiping, so none replays the stream into the half-empty store.
    if (reset) {
      await repository.setCheckpoint(REBUILDING);
      await repository.reset();
    }

    return { checkpoint, partitions };
  };

  const rebuildPartition: RebuildService["rebuildPartition"] = ({ partition }) =>
    rebuildEntities(eventStore.scanPartition(partition));

  // this also replaces the marker from a reset, which resumes refreshes. An untyped caller
  // may leave the checkpoint out (e.g. a plan whose JSON dropped it), and storing that as-is
  // would leave a null checkpoint behind.
  const finalizeRebuild: RebuildService["finalizeRebuild"] = async ({
    checkpoint,
  }) => {
    await repository.setCheckpoint(checkpoint ?? START_OF_STREAM);
  };

  return {
    planRebuild,
    rebuildPartition,
    rebuildEntities: async ({ ids }) => {
      const entities = await mapWithConcurrency(ids, DEFAULT_CONCURRENCY, (id) =>
        eventStore.loadCommits(id)
      );
      return rebuildEntities(entities);
    },
    finalizeRebuild,
    rebuild: async ({
      targetPartitionSize = DEFAULT_PARTITION_SIZE,
      concurrency = DEFAULT_CONCURRENCY,
      reset = false,
      settleMs = DEFAULT_SETTLE_MS,
    } = {}) => {
      const { checkpoint, partitions } = await planRebuild({
        targetPartitionSize,
        reset,
      });

      if (settleMs > 0) await sleep(settleMs);

      const results = await mapWithConcurrency(partitions, concurrency, (partition) =>
        rebuildPartition({ partition })
      );

      const rebuilt = results.reduce((sum, r) => sum + r.rebuilt, 0);
      const failed = results.flatMap((r) => r.failed);

      // leave the checkpoint alone until the failures are resolved. After a reset, that keeps
      // refreshes paused, since the failed entities are missing from the store.
      if (failed.length > 0) return { rebuilt, failed, checkpoint };

      await finalizeRebuild({ checkpoint });
      const refreshed = await refreshService.refresh();

      return { rebuilt, failed: refreshed.failed, checkpoint };
    },
  };
}
