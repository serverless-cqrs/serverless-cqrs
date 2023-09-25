import { test } from "tap";
import { build } from "../index";
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
    "versionAlreadyExists",
    "can't set if the version already exists"
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

test("setVersionLock", async (assert) => {
  const versionLockStore = {};
  const adapter = build({ entityName: "foo" }, { versionLockStore });

  const expected = {
    foo: {
      version: 0,
      lastCommitId: "123",
    },
  };

  await adapter.setVersionLock({
    version: 0,
    lastCommitId: "123",
  });

  assert.same(versionLockStore, expected, "sets versionLock in store");
  assert.rejects(
    () =>
      adapter.setVersionLock({
        version: 0,
        lastCommitId: "123",
      }),
    "versionAlreadyExists",
    "can't set if version already exists"
  );
});

test("getVersionLock", async (assert) => {
  const versionLockStore = {
    foo: {
      version: 0,
      lastCommitId: "123",
    },
  };

  const expected = {
    version: 0,
    lastCommitId: "123",
  };

  const adapter = build({ entityName: "foo" }, { versionLockStore });

  const res = await adapter.getVersionLock();

  assert.same(res, expected, "returns exisiting versionLock from store");
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
