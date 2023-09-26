import { test } from "tap";

import { build } from "../refreshServiceBuilder";
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
  append: async () => {},
};

let appliedEvents: any[] = [];
let appliedCommits: any[] = [];

let versionLock = {
  lastCommitId: "b",
  version: 2,
};

const repository: ReadModelRepository<any, any> = {
  applyEvents: async (entityId: string, events: any[], version: number) => {
    appliedEvents.push({ entityId, events, version });
  },
  applyCommits: async (commits) => {
    appliedCommits.push(...commits);
  },
  getById: async () => undefined,
  getByIds: async () => [],
  getVersionLock: async () => ({
    ...versionLock,
    save: async (commits) => {
      versionLock = {
        lastCommitId: commits[commits.length - 1].commitId,
        version: versionLock.version + commits.length,
      };
    },
  }),
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
  const expectedVersionLock = {
    version: 4,
    lastCommitId: "d",
  };

  const expectedCommits = commits.slice(2);
  await refreshService.refresh();

  assert.same(appliedCommits, expectedCommits, "applies commits");
  assert.same(versionLock, expectedVersionLock, "updated the versionLock");
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
