import { test } from "tap";

import { build } from "../refreshServiceBuilder";
import { REBUILDING, START_OF_STREAM } from "../checkpoints";
import { EventStore, ReadModelRepository } from "@serverless-cqrs/types";

const baseCommit = {
  entityName: "foo",
  commitId: "123",
  committedAt: 123,
};
const commits = [
  {
    ...baseCommit,
    entityId: "123",
    version: 3,
    commitId: "a",
    events: ["event1"],
  },
  {
    ...baseCommit,
    entityId: "123",
    version: 4,
    commitId: "b",
    events: ["event2", "event3"],
  },
  {
    ...baseCommit,
    entityId: "123",
    version: 6,
    commitId: "c",
    events: ["event4", "event5"],
  },
  {
    ...baseCommit,
    entityId: "456",
    version: 0,
    commitId: "d",
    events: ["event1", "event2"],
  },
];

const eventStore: EventStore<string> = {
  listCommits: async (commitId = "") => {
    const startAt = commits.findIndex((e) => e.commitId === commitId) + 1;
    return commits.slice(startAt, startAt + 3);
  },
  loadEvents: async (id, version = 0) => {
    const results = commits.filter(
      (c) => c.entityId == id && c.version >= version
    );
    return results.reduce((p, c) => [...p, ...c.events], [] as string[]);
  },
  loadCommits: async () => [],
  append: async () => {},
  getLatestCommitId: async () => undefined,
  listPartitions: async () => [],
  scanPartition: async function* () {},
};

let appliedEvents: any[] = [];
let appliedCommits: any[] = [];

let checkpoint = "b";

const repository: ReadModelRepository<any, any> = {
  reset: async () => {},
  applyEvents: async (entityId: string, events: any[], version: number) => {
    appliedEvents.push({ entityId, events, version });
  },
  applyCommits: async (commits) => {
    appliedCommits.push(...commits);
    return { behind: [] };
  },
  getById: async () => undefined,
  getByIds: async () => [],
  rebuild: async () => ({ rebuilt: 0, failed: [] }),
  getCheckpoint: async () => checkpoint,
  setCheckpoint: async (commitId) => {
    checkpoint = commitId;
  },
  search: async () => ({
    data: [],
    total: 0,
  }),
};

const refreshService = build({
  eventStore,
  repository,
});

test("applyEvents", async (assert) => {
  const commit = {
    entityId: "123",
    events: ["abc", "def"],
    version: 0,
  };

  await refreshService.applyEvents({
    ...baseCommit,
    ...commit,
  });

  assert.same(appliedEvents, [commit], "forwards event to repository");
});

test("getAggregateEvents", async (assert) => {
  const expected = ["event1", "event2", "event3", "event4", "event5"];
  const result = await refreshService.getAggregateEvents("123");

  assert.same(result, expected, "loads events for aggregate");
});

test("refresh", async (assert) => {
  const expectedCommits = commits.slice(2);
  await refreshService.refresh();

  assert.same(appliedCommits, expectedCommits, "applies commits");
  assert.same(checkpoint, "d", "moves the checkpoint to the last commit");
});

test("refresh - rebuilds entities that are behind", async (assert) => {
  let checkpoint: string | undefined = "b";
  const rebuilt: any[] = [];

  const { refresh } = build({
    eventStore: {
      ...eventStore,
      loadCommits: async (id) => commits.filter((c) => c.entityId === id),
    },
    repository: {
      ...repository,
      getCheckpoint: async () => checkpoint,
      setCheckpoint: async (commitId) => {
        checkpoint = commitId;
      },
      // "123" is missing commits, and "456" can be applied
      applyCommits: async () => ({ behind: ["123"] }),
      rebuild: async (entities) => {
        rebuilt.push(...entities);
        return {
          rebuilt: 0,
          failed: [
            { entityId: "123", reason: "versionMismatch" },
            { entityId: "999", reason: "conflict" },
          ],
        };
      },
    },
  });

  const error = console.error;
  console.error = () => {};
  const result = await refresh();
  console.error = error;

  assert.same(
    rebuilt,
    [commits.filter((c) => c.entityId === "123")],
    "rebuilds the entity from its full history"
  );
  assert.same(
    result,
    { failed: [{ entityId: "123", reason: "versionMismatch" }] },
    "reports entities it couldn't rebuild, but not conflicts"
  );
  assert.same(checkpoint, "d", "still moves the checkpoint past them");
});

test("refresh - paused during a rebuild with reset", async (assert) => {
  let checkpoint: string | undefined = "b";
  let listed = 0;
  let applied = 0;

  const { refresh } = build({
    eventStore: {
      ...eventStore,
      listCommits: async (commitId) => {
        listed++;
        return eventStore.listCommits(commitId);
      },
    },
    repository: {
      ...repository,
      getCheckpoint: async () => checkpoint,
      setCheckpoint: async (commitId) => {
        checkpoint = commitId;
      },
      applyCommits: async () => {
        applied++;
        // a rebuild with reset starts while this batch is being applied
        checkpoint = REBUILDING;
        return { behind: [] };
      },
    },
  });

  const warn = console.warn;
  console.warn = () => {};

  const midBatch = await refresh();
  assert.same(midBatch, { failed: [], paused: true }, "reports that it's paused");
  assert.equal(checkpoint, REBUILDING, "doesn't overwrite the marker with its own checkpoint");
  assert.equal(applied, 1, "stops after the batch in flight");

  const before = await refresh();
  assert.same(before, { failed: [], paused: true }, "stays paused");
  assert.equal(listed, 1, "doesn't list commits at all while paused");

  console.warn = warn;
});

test("refresh - replays the stream from the start", async (assert) => {
  // a store can return null, e.g. Mongo after a checkpoint was saved as undefined
  for (const checkpoint of [undefined, null as any, START_OF_STREAM]) {
    const listedFrom: (string | undefined)[] = [];

    const { refresh } = build({
      eventStore: {
        ...eventStore,
        listCommits: async (commitId) => {
          listedFrom.push(commitId);
          return [];
        },
      },
      repository: { ...repository, getCheckpoint: async () => checkpoint },
    });

    const result = await refresh();

    assert.same(result, { failed: [] }, `with checkpoint ${checkpoint}, returns without failures`);
    assert.same(listedFrom, [undefined], `with checkpoint ${checkpoint}, lists from the start`);
  }
});

// test("handles consecutive events", async (assert) => {
//   const saved = [];

//   let versionLock = {
//     lastCommitId: "",
//     version: 0,
//   };
//   const repository = {
//     getVersionLock: async () => {
//       return {
//         ...versionLock,
//         save: (commits: Commit<any>[]) => {
//           versionLock = {
//             lastCommitId: commits[commits.length - 1].commitId,
//             version: versionLock.version + commits.length,
//           };
//         },
//       };
//     },
//     getByIds: async () => ({
//       results: [
//         {
//           id: 123,
//           version: 3,
//         },
//         {
//           id: 456,
//           version: 7,
//         },
//       ],
//     }),
//   };

//   const { refresh } = build({
//     repository,
//     eventStore,
//   });

//   const expected = [
//     {
//       123: ["event1", "event2", "event3"],
//       456: ["event3", "event4", "event5"],
//     },
//     {
//       789: ["event1", "event2"],
//     },
//   ];

//   await refresh("foo");

//   assert.deepEquals(
//     saved,
//     expected,
//     "consolidates events and saves them to repo"
//   );
// });

// test("doesnt handle inconsecutive events", async (assert) => {
//   const saved = [];
//   var meta;
//   const repository = {
//     getMetadata: () => {
//       return Promise.resolve({
//         state: meta,
//         save: (commits) => (meta = commits[commits.length - 1]),
//       });
//     },
//     getByIds: () =>
//       Promise.resolve({
//         results: [
//           {
//             id: 123,
//             version: 5,
//           },
//           {
//             id: 456,
//             version: 7,
//           },
//         ],
//         save: (params) => Promise.resolve(saved.push(params)),
//       }),
//   };

//   const { refresh } = build({
//     repository,
//     eventAdapter,
//   });

//   const expected = [
//     {
//       456: ["event3", "event4", "event5"],
//     },
//     {
//       789: ["event1", "event2"],
//     },
//   ];

//   await refresh("foo");

//   assert.deepEquals(
//     saved,
//     expected,
//     "ignores inconsecutive events but still processes others"
//   );
// });
