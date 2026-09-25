import { test } from "tap";
import { build } from "../index.js";
// const { build } = require("../index");

test("listeners", async (assert) => {
  const adapter = build({ entityName: "foo" });
  const commits: any[] = [];
  const expected = [
    {
      commitId: /\w/,
      committedAt: /\d/,
      entityId: "1",
      entityName: "foo",
      version: 1,
      events: ["a"],
    },
  ];
  adapter.addListener("123", (commit) => commits.push(commit));
  adapter.append("1", 1, ["a"]);

  assert.match(commits, expected, "notifies listener of commit");
  adapter.removeListener("123");

  adapter.append("1", 1, ["a"]);
  assert.same(commits.length, 1, "doesn't notify once removed");
});

test("loadEvents", async (assert) => {
  const baseCommit = {
    entityId: "123",
    commitId: "123",
    committedAt: 123,
    entityName: "foo",
  };

  const eventStore = {
    foo: [
      { version: 0, events: ["a"], ...baseCommit },
      { version: 1, events: ["b", "c"], ...baseCommit },
      { version: 3, events: ["d", "e", "f"], ...baseCommit },
      { version: 6, events: ["g", "h", "i"], ...baseCommit },
    ],
  };
  const expected = ["d", "e", "f", "g", "h", "i"];

  const adapter = build({ entityName: "foo" }, { eventStore });

  const res = await adapter.loadEvents("123", 1);

  assert.same(res, expected, "returns events after given version");
});

test("listCommits", async (assert) => {
  const baseCommit = { version: 0, committedAt: 123, entityName: "foo" };

  const eventStore = {
    foo: [
      { entityId: "123", commitId: "0", events: ["a"], ...baseCommit },
      { entityId: "456", commitId: "1", events: ["b"], ...baseCommit },
      { entityId: "789", commitId: "2", events: ["c"], ...baseCommit },
      { entityId: "012", commitId: "3", events: ["d"], ...baseCommit },
    ],
  };

  const expected = [
    { entityId: "789", commitId: "2", events: ["c"], ...baseCommit },
    { entityId: "012", commitId: "3", events: ["d"], ...baseCommit },
  ];
  const adapter = build({ entityName: "foo" }, { eventStore });

  const res = await adapter.listCommits("1");

  assert.same(res, expected, "returns commits after given commitId");
});

const rebuildCommits = () => {
  const base = { committedAt: 123, entityName: "foo" };
  return [
    { entityId: "a", commitId: "1", version: 0, events: ["a0"], ...base },
    { entityId: "b", commitId: "2", version: 0, events: ["b0"], ...base },
    { entityId: "a", commitId: "4", version: 2, events: ["a2"], ...base },
    { entityId: "a", commitId: "3", version: 1, events: ["a1"], ...base },
    { entityId: "c", commitId: "5", version: 0, events: ["c0"], ...base },
  ];
};

test("loadCommits", async (assert) => {
  const adapter = build({ entityName: "foo" }, { eventStore: { foo: rebuildCommits() } });

  const res = await adapter.loadCommits("a");

  assert.same(
    res.map((c) => c.version),
    [0, 1, 2],
    "returns the entity's commits in version order"
  );
  assert.same(await adapter.loadCommits("zzz"), [], "empty for unknown entities");
});

test("getLatestCommitId", async (assert) => {
  const adapter = build({ entityName: "foo" }, { eventStore: { foo: rebuildCommits() } });
  assert.same(await adapter.getLatestCommitId(), "5", "returns the highest commitId");

  const empty = build({ entityName: "foo" });
  assert.same(await empty.getLatestCommitId(), undefined, "undefined when empty");
});

test("listPartitions and scanPartition", async (assert) => {
  const adapter = build({ entityName: "foo" }, { eventStore: { foo: rebuildCommits() } });

  const partitions = await adapter.listPartitions({ targetSize: 2 });
  assert.equal(partitions.length, 3, "sizes partitions by commit count");

  const seen: string[][] = [];
  for (const partition of partitions)
    for await (const commits of adapter.scanPartition(partition)) {
      assert.ok(
        commits.every((c) => c.entityId === commits[0].entityId),
        "yields one entity at a time"
      );
      seen.push(commits.map((c) => c.commitId));
    }

  assert.same(
    seen.sort(),
    [["1", "3", "4"], ["2"], ["5"]],
    "yields every entity exactly once, with its commits in version order"
  );

  const single = await adapter.listPartitions({ targetSize: 100 });
  assert.equal(single.length, 1, "at least one partition");
});

test("append", async (assert) => {
  const eventStore = { foo: [] };
  const adapter = build({ entityName: "foo" }, { eventStore });

  await adapter.append("123", 0, ["a"]);
  const expected1 = [
    {
      commitId: /\w/,
      committedAt: /\d/,
      entityId: "123",
      entityName: "foo",
      version: 0,
      events: ["a"],
    },
  ];

  assert.match(eventStore.foo, expected1, "appends event to new entityName");

  await adapter.append("456", 1, ["b"]);

  const expected2 = [
    ...expected1,
    {
      commitId: /\w/,
      committedAt: /\d/,
      entityId: "456",
      entityName: "foo",
      version: 1,
      events: ["b"],
    },
  ];
  assert.match(
    eventStore.foo,
    expected2,
    "appends event to existing entityName"
  );
});

test("set", async (assert) => {
  const projectionStore = {};
  const adapter = build({ entityName: "foo" }, { projectionStore });

  const expected = {
    foo: {
      123: {
        id: "123",
        version: 0,
        state: "foobar",
      },
    },
  };

  await adapter.set({
    id: "123",
    version: 0,
    state: "foobar",
  });

  assert.same(projectionStore, expected, "sets projection in store");

  assert.rejects(
    () =>
      adapter.set({
        id: "123",
        version: 0,
        state: "foobar",
      }),
    "versionAlreadyExists"
  );
});

test("get", async (assert) => {
  const projectionStore = {
    foo: {
      123: {
        id: "123",
        version: 0,
        state: "foobar",
      },
    },
  };

  const expected = {
    id: "123",
    version: 0,
    state: "foobar",
  };

  const adapter = build({ entityName: "foo" }, { projectionStore });

  const res = await adapter.get("123");

  assert.same(res, expected, "returns exisiting projection from store");
});

test("setCheckpoint", async (assert) => {
  const checkpointStore = {};
  const adapter = build({ entityName: "foo" }, { checkpointStore });

  await adapter.setCheckpoint("123");
  assert.same(checkpointStore, { foo: "123" }, "sets checkpoint in store");

  await adapter.setCheckpoint("100");
  assert.same(checkpointStore, { foo: "100" }, "can move the checkpoint back");
});

test("getCheckpoint", async (assert) => {
  const adapter = build({ entityName: "foo" }, { checkpointStore: { foo: "123" } });
  assert.same(await adapter.getCheckpoint(), "123", "returns existing checkpoint");

  const empty = build({ entityName: "foo" });
  assert.same(await empty.getCheckpoint(), undefined, "undefined when none is set");
});

test("reset", async (assert) => {
  const projectionStore = {
    foo: { 123: { id: "123", version: 0, state: "foobar" } },
  };
  const checkpointStore = { foo: "123" };
  const adapter = build({ entityName: "foo" }, { projectionStore, checkpointStore });

  await adapter.reset();

  assert.same(await adapter.get("123"), undefined, "clears projections");
  assert.same(await adapter.getCheckpoint(), undefined, "clears the checkpoint");
});

test("batchGet", async (assert) => {
  const projectionStore = {
    foo: {
      123: {
        id: "123",
        version: 0,
        state: "foobar",
      },
      456: {
        id: "456",
        version: 1,
        state: "barfoo",
      },
      789: {
        id: "789",
        version: 3,
        state: "bazbar",
      },
    },
  };

  const expected = [
    {
      id: "123",
      version: 0,
      state: "foobar",
    },
    {
      id: "789",
      version: 3,
      state: "bazbar",
    },
  ];

  const adapter = build({ entityName: "foo" }, { projectionStore });

  const res = await adapter.batchGet(["123", "789", "999"]);

  assert.same(res, expected, "returns exisiting projections from store");
});

test("batchWrite", async (assert) => {
  const projectionStore = {
    foo: {
      456: {
        id: "456",
        version: 1,
        state: "barfoo",
      },
    },
  };

  const expected = {
    foo: {
      123: {
        id: "123",
        version: 0,
        state: "foobar",
      },
      456: {
        id: "456",
        version: 1,
        state: "barfoo",
      },
      789: {
        id: "789",
        version: 3,
        state: "bazbar",
      },
    },
  };
  const adapter = build({ entityName: "foo" }, { projectionStore });

  await adapter.batchWrite({
    123: {
      version: 0,
      state: "foobar",
    },
    789: {
      version: 3,
      state: "bazbar",
    },
  });

  assert.same(projectionStore, expected, "updates multiple projections");
});

test("batchWrite - conflicts", async (assert) => {
  const projectionStore = {
    foo: {
      123: { id: "123", version: 2, state: "old" },
      456: { id: "456", version: 5, state: "newer" },
    },
  };
  const adapter = build({ entityName: "foo" }, { projectionStore });

  const strict = await adapter.batchWrite({
    123: { version: 2, state: "rebuilt" },
    789: { version: 1, state: "new" },
  });
  assert.same(strict.conflicts, ["123"], "rejects the same version by default");
  assert.same(projectionStore.foo[123].state, "old", "keeps the stored projection");
  assert.same((projectionStore.foo as any)[789].state, "new", "still writes the rest");

  const overwrite = await adapter.batchWrite(
    {
      123: { version: 2, state: "rebuilt" },
      456: { version: 4, state: "stale" },
    },
    { overwriteSameVersion: true }
  );
  assert.same(overwrite.conflicts, ["456"], "rejects only older versions");
  assert.same(projectionStore.foo[123].state, "rebuilt", "overwrites the same version");
  assert.same(projectionStore.foo[456].state, "newer", "keeps the newer projection");
});

test("filter search", async (assert) => {
  const projectionStore = {
    foo: {
      123: {
        id: "123",
        version: 0,
        state: {
          foo: "bar",
          baz: "foo",
        },
      },
      456: {
        id: "456",
        version: 1,
        state: {
          foo: "bar",
          baz: "foo",
        },
      },
      789: {
        id: "789",
        version: 3,
        state: {
          foo: "baz",
          baz: "foo",
        },
      },
    },
  };

  const expected = {
    data: [
      {
        id: "123",
        version: 0,
        state: {
          foo: "bar",
          baz: "foo",
        },
      },
      {
        id: "456",
        version: 1,
        state: {
          foo: "bar",
          baz: "foo",
        },
      },
    ],
    total: 2,
  };

  const adapter = build({ entityName: "foo" }, { projectionStore });

  const res = await adapter.search({
    filter: {
      foo: "bar",
      baz: "foo",
    },
  });

  assert.same(res, expected, "searches projections");
});

test("rawSearch search", async (assert) => {
  const projectionStore = {
    foo: {
      123: {
        id: "123",
        version: 0,
        state: {
          foo: "bar",
          baz: "foo",
        },
      },
      456: {
        id: "456",
        version: 1,
        state: {
          foo: "bar",
          baz: "foo",
        },
      },
      789: {
        id: "789",
        version: 3,
        state: {
          foo: "baz",
          baz: "foo",
        },
      },
    },
  };

  const expected = {
    data: [
      {
        id: "123",
        version: 0,
        state: {
          foo: "bar",
          baz: "foo",
        },
      },
      {
        id: "456",
        version: 1,
        state: {
          foo: "bar",
          baz: "foo",
        },
      },
    ],
    total: 2,
  };

  const adapter = build({ entityName: "foo" }, { projectionStore });

  const res = await adapter.search({
    rawSearch: (obj: { version: number }) => obj.version < 2,
  });

  assert.same(res, expected, "searches projections");
});

test("rawQuery search", async (assert) => {
  const projectionStore = {
    foo: {
      123: {
        id: "123",
        version: 0,
        state: {
          foo: "bar",
          baz: "foo",
        },
      },
      456: {
        id: "456",
        version: 1,
        state: {
          foo: "bar",
          baz: "foo",
        },
      },
      789: {
        id: "789",
        version: 3,
        state: {
          foo: "baz",
          baz: "foo",
        },
      },
    },
  };

  const expected = {
    data: [
      {
        id: "123",
        version: 0,
        state: {
          foo: "bar",
          baz: "foo",
        },
      },
      {
        id: "456",
        version: 1,
        state: {
          foo: "bar",
          baz: "foo",
        },
      },
    ],
    total: 2,
  };

  const adapter = build({ entityName: "foo" }, { projectionStore });

  const res = await adapter.search({
    rawQuery: (obj: { version: number }) => obj.version < 2,
  });

  assert.same(res, expected, "searches projections");
});

test("rawQuery search with pagination", async (assert) => {
  const projectionStore = {
    foo: {
      123: {
        id: "123",
        version: 0,
        state: {
          foo: "bar",
          baz: "foo",
        },
      },
      456: {
        id: "456",
        version: 1,
        state: {
          foo: "bar",
          baz: "foo",
        },
      },
      789: {
        id: "789",
        version: 3,
        state: {
          foo: "baz",
          baz: "foo",
        },
      },
    },
  };

  const expected = {
    data: [
      {
        id: "456",
        version: 1,
        state: {
          foo: "bar",
          baz: "foo",
        },
      },
    ],
    total: 3,
  };

  const adapter = build({ entityName: "foo" }, { projectionStore });

  const res = await adapter.search({
    rawQuery: () => true,
    pagination: {
      page: 2,
      perPage: 1,
    },
  });

  assert.same(res, expected, "searches projections");
});
