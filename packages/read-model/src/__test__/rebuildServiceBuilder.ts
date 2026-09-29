import { test } from "tap";
import { Commit, Projection } from "@serverless-cqrs/types";

import { build } from "../rebuildServiceBuilder";
import { build as buildRefreshService } from "../refreshServiceBuilder";
import { build as buildRepository } from "../repositoryBuilder";
import { REBUILDING, START_OF_STREAM } from "../checkpoints";

interface State {
  events: string[];
}

const reducer = (events: string[], state?: State | null): State => ({
  events: [...(state?.events ?? []), ...events],
});

const commit = (
  entityId: string,
  version: number,
  commitId: string,
  events: string[]
): Commit<string> => ({
  entityId,
  version,
  commitId,
  events,
  entityName: "foo",
  committedAt: 123,
});

// commitIds are zero-padded so they sort in the order they were committed.
const history = () => [
  commit("a", 0, "01", ["a0"]),
  commit("b", 0, "02", ["b0", "b1"]),
  commit("a", 1, "03", ["a1"]),
  commit("c", 0, "04", ["c0"]),
  commit("b", 2, "05", ["b2"]),
  commit("d", 0, "06", ["d0"]),
];

const setup = async ({
  commits = history(),
  projections = {} as Record<string, Projection<State>>,
  checkpoint,
  batchSize,
}: {
  commits?: Commit<string>[];
  projections?: Record<string, Projection<State>>;
  checkpoint?: string;
  batchSize?: number;
} = {}) => {
  const eventStore = { foo: commits };
  const projectionStore = { foo: projections };
  const checkpointStore: Record<string, string> = checkpoint ? { foo: checkpoint } : {};

  // memory-store is an ES module, so it can't be required from this CommonJS package
  const { build: buildStore } = await import("@serverless-cqrs/memory-store");
  const store = buildStore<State, string>(
    { entityName: "foo" },
    { eventStore, projectionStore, checkpointStore }
  );
  const repository = buildRepository({ projectionStore: store, reducer });
  const service = build({ repository, eventStore: store, batchSize });
  const { refresh } = buildRefreshService({ repository, eventStore: store });

  const stateOf = async (id: string) => (await store.get(id))?.state;

  return { eventStore, store, service, refresh, stateOf };
};

test("rebuild", async (assert) => {
  const { service, store, stateOf } = await setup({
    // built by an old reducer, at the current version
    projections: {
      a: { id: "a", version: 2, state: { events: ["stale"] } },
    },
    batchSize: 2,
  });

  const result = await service.rebuild({ targetPartitionSize: 2, settleMs: 0 });

  assert.same(result, { rebuilt: 4, failed: [], checkpoint: "06" }, "reports the result");
  assert.same(await stateOf("a"), { events: ["a0", "a1"] }, "overwrites an existing projection");
  assert.same(await stateOf("b"), { events: ["b0", "b1", "b2"] }, "rebuilds from every commit");
  assert.same((await store.get("b"))?.version, 3, "sets the version to the event count");
  assert.same(await stateOf("d"), { events: ["d0"] }, "rebuilds every entity");
  assert.same(await store.getCheckpoint(), "06", "sets the checkpoint");
});

test("rebuild - reset", async (assert) => {
  const orphan = { id: "gone", version: 1, state: { events: ["x"] } };

  const kept = await setup({ projections: { gone: { ...orphan } } });
  await kept.service.rebuild({ settleMs: 0 });
  assert.ok(await kept.store.get("gone"), "leaves other projections without reset");

  const wiped = await setup({ projections: { gone: { ...orphan } } });
  await wiped.service.rebuild({ reset: true, settleMs: 0 });
  assert.notOk(await wiped.store.get("gone"), "wipes the projection store first");
  assert.same(await wiped.stateOf("a"), { events: ["a0", "a1"] }, "then rebuilds");
});

test("rebuild - failures hold the checkpoint until they're retried", async (assert) => {
  // "b" is missing version 2
  const commits = history().filter((c) => c.commitId !== "05");
  commits.push(commit("b", 3, "07", ["b3"]));

  const { service, store, eventStore, stateOf } = await setup({ commits, checkpoint: "01" });

  const result = await service.rebuild({ targetPartitionSize: 2, settleMs: 0 });

  assert.match(
    result,
    { rebuilt: 3, failed: [{ entityId: "b", reason: /versionMismatch/ }], checkpoint: "07" },
    "reports the failed entity"
  );
  assert.notOk(await store.get("b"), "doesn't write the failed entity");
  assert.same(await store.getCheckpoint(), "01", "leaves the checkpoint alone");

  // fix the history and retry just that entity
  eventStore.foo.push(commit("b", 2, "05", ["b2"]));
  const retry = await service.rebuildEntities({ ids: ["b"] });

  assert.same(retry, { rebuilt: 1, failed: [] }, "rebuilds the entity");
  assert.same(await stateOf("b"), { events: ["b0", "b1", "b2", "b3"] }, "from its full history");

  await service.finalizeRebuild({ checkpoint: result.checkpoint });
  assert.same(await store.getCheckpoint(), "07", "sets the checkpoint once finalized");
});

test("step by step, with commits landing during the rebuild", async (assert) => {
  const { service, store, eventStore, refresh, stateOf } = await setup();

  const plan = await service.planRebuild({ targetPartitionSize: 2 });
  // partitions have to survive being passed between processes
  const partitions = JSON.parse(JSON.stringify(plan.partitions));

  assert.equal(plan.checkpoint, "06", "captures the latest commit");
  assert.equal(partitions.length, 3, "splits the stream");

  // lands before its partition is scanned, so the rebuild includes it
  eventStore.foo.push(commit("a", 2, "07", ["a2"]));

  let rebuilt = 0;
  for (const partition of partitions)
    rebuilt += (await service.rebuildPartition({ partition })).rebuilt;
  assert.equal(rebuilt, 4, "rebuilds every entity across the partitions");

  // lands after the rebuild, so only the refresh picks it up
  eventStore.foo.push(commit("e", 0, "08", ["e0"]));

  await service.finalizeRebuild({ checkpoint: plan.checkpoint });
  assert.same(await store.getCheckpoint(), "06", "sets the planned checkpoint");

  await refresh();

  assert.same(
    await stateOf("a"),
    { events: ["a0", "a1", "a2"] },
    "a commit already included by the rebuild isn't applied twice"
  );
  assert.same(await stateOf("e"), { events: ["e0"] }, "the refresh applies later commits");
  assert.same(await store.getCheckpoint(), "08", "and moves the checkpoint");
});

test("refresh repairs an entity missing commits from before the checkpoint", async (assert) => {
  const { store, eventStore, refresh, stateOf } = await setup({
    // "a" never got its version 1 commit ("03"), which is behind the checkpoint
    projections: {
      a: { id: "a", version: 1, state: { events: ["a0"] } },
      b: { id: "b", version: 3, state: { events: ["b0", "b1", "b2"] } },
      c: { id: "c", version: 1, state: { events: ["c0"] } },
    },
    checkpoint: "05",
  });
  eventStore.foo.push(commit("a", 2, "07", ["a2"]));

  const result = await refresh();

  assert.same(result, { failed: [] }, "reports no failures");
  assert.same(await stateOf("a"), { events: ["a0", "a1", "a2"] }, "rebuilds it from its full history");
  assert.same(await stateOf("d"), { events: ["d0"] }, "still applies the rest");
  assert.same(await store.getCheckpoint(), "07", "and moves the checkpoint");
});

test("rebuild - empty event store", async (assert) => {
  const { service, store, eventStore, refresh, stateOf } = await setup({ commits: [] });

  const result = await service.rebuild({ reset: true, settleMs: 0 });

  assert.same(
    result,
    { rebuilt: 0, failed: [], checkpoint: START_OF_STREAM },
    "rebuilds nothing"
  );
  assert.same(await store.getCheckpoint(), START_OF_STREAM, "checkpoints the start of the stream");

  eventStore.foo.push(commit("a", 0, "01", ["a0"]));

  assert.same(await refresh(), { failed: [] }, "later refreshes aren't paused");
  assert.same(await stateOf("a"), { events: ["a0"] }, "and pick up the commits that arrive");
  assert.same(await store.getCheckpoint(), "01", "and move the checkpoint");
});

test("rebuild - reset pauses refreshes until it's finalized", async (assert) => {
  const { service, store, eventStore, refresh, stateOf } = await setup({ checkpoint: "06" });

  const plan = await service.planRebuild({ targetPartitionSize: 2, reset: true });
  assert.equal(await store.getCheckpoint(), REBUILDING, "marks the rebuild in progress");

  for (const partition of plan.partitions) await service.rebuildPartition({ partition });

  // lands after the rebuild, so only the refresh picks it up
  eventStore.foo.push(commit("e", 0, "07", ["e0"]));

  const warn = console.warn;
  console.warn = () => {};
  const paused = await refresh();
  console.warn = warn;

  assert.same(paused, { failed: [], paused: true }, "a refresh during the rebuild pauses");
  assert.notOk(await store.get("e"), "and applies nothing");

  await service.finalizeRebuild({ checkpoint: plan.checkpoint });

  assert.same(await refresh(), { failed: [] }, "refreshes resume once it's finalized");
  assert.same(await stateOf("e"), { events: ["e0"] }, "and catch up");
});

test("finalizeRebuild - without a checkpoint", async (assert) => {
  const { service, store } = await setup({ commits: [] });

  await service.planRebuild({ targetPartitionSize: 2, reset: true });
  // e.g. an untyped caller, or a plan whose JSON dropped the field
  await service.finalizeRebuild({ checkpoint: undefined as any });

  assert.equal(await store.getCheckpoint(), START_OF_STREAM, "checkpoints the start of the stream");
});

test("rebuild - reset with failures leaves refreshes paused", async (assert) => {
  // "b" is missing version 2
  const commits = history().filter((c) => c.commitId !== "05");
  commits.push(commit("b", 3, "07", ["b3"]));

  const { service, store } = await setup({ commits, checkpoint: "01" });

  const result = await service.rebuild({ reset: true, settleMs: 0 });

  assert.equal(result.failed.length, 1, "reports the failed entity");
  assert.equal(await store.getCheckpoint(), REBUILDING, "keeps refreshes paused");
});

test("refresh without a checkpoint replays the whole stream", async (assert) => {
  const { store, refresh, stateOf } = await setup();

  assert.same(await refresh(), { failed: [] }, "a new read model doesn't need a rebuild");
  assert.same(await stateOf("b"), { events: ["b0", "b1", "b2"] }, "applies every commit");
  assert.same(await store.getCheckpoint(), "06", "and sets the checkpoint");
});
