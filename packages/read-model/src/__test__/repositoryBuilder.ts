import { test } from "tap";
import { build } from "../repositoryBuilder";

interface ProjectionShape {
  foo: string;
}
interface EventShape {
  foo: string;
}

let projections: Record<string, any> = {
  "123": {
    id: "123",
    version: 2,
    state: {
      foo: "bar",
    },
  },
};
let checkpoint: string | undefined;

const projectionStore = {
  reset: async () => {},
  get: async (id: string) => projections[id],
  set: async (obj: any) => {
    projections[obj.id] = obj;
  },
  getCheckpoint: async () => checkpoint,
  setCheckpoint: async (commitId: string) => {
    checkpoint = commitId;
  },
  batchGet: async (ids: string[]) =>
    ids.map((id) => projections[id]).filter((p) => !!p),
  batchWrite: async (
    obj: Record<string, any>,
    { overwriteSameVersion = false } = {}
  ) => {
    const conflicts = [] as string[];
    for (const id of Object.keys(obj)) {
      const existing = projections[id];
      if (
        existing &&
        (overwriteSameVersion
          ? existing.version > obj[id].version
          : existing.version >= obj[id].version)
      ) {
        conflicts.push(id);
        continue;
      }
      projections[id] = obj[id];
    }
    return { conflicts };
  },
  search: async (params: any) => params,
};

const reducer = (events: EventShape[], state?: ProjectionShape) =>
  events.reduce((p, c) => ({ ...p, ...c }), state || ({} as ProjectionShape));

const repo = build<ProjectionShape, EventShape>({
  projectionStore,
  reducer,
});

test("checkpoint", async (assert) => {
  assert.same(await repo.getCheckpoint(), undefined, "undefined when none is set");

  await repo.setCheckpoint("456");

  assert.same(checkpoint, "456", "saves the checkpoint to the store");
  assert.same(await repo.getCheckpoint(), "456", "returns the saved checkpoint");
});

test("getById", async (assert) => {
  const res = await repo.getById("123");

  assert.same(
    res,
    {
      id: "123",
      version: 2,
      state: {
        foo: "bar",
      },
    },
    "returns the projection"
  );
});

test("getByIds", async (assert) => {
  const res = await repo.getByIds(["123"]);

  assert.same(
    res,
    [
      {
        id: "123",
        version: 2,
        state: {
          foo: "bar",
        },
      },
    ],
    "returns results from batchGet"
  );

  const empty = await repo.getByIds([]);
  assert.same([], empty, "returns an empty array if no ids");
});

test("search", async (assert) => {
  const res = await repo.search({
    foo: "bar",
  });

  assert.same(
    res,
    {
      foo: "bar",
    },
    "forwards search params to adapter"
  );
});

test("applyEvents", async (assert) => {
  await repo.applyEvents("123", [{ foo: "bar" }, { foo: "baz" }], 2);
  assert.same(
    projections["123"],
    {
      id: "123",
      version: 4,
      state: { foo: "baz" },
    },
    "applys events to existing projection"
  );

  await repo.applyEvents("456", [{ foo: "bar" }], 0);
  assert.same(
    projections["456"],
    {
      id: "456",
      version: 1,
      state: { foo: "bar" },
    },
    "applys events to new projection"
  );

  assert.rejects(
    () => repo.applyEvents("123", [{ foo: "bar" }], 5),
    "throws if there is a version missing"
  );

  let previousCopy = { ...projections };

  await repo.applyEvents("123", [{ foo: "zab" }], 2);
  assert.same(
    previousCopy,
    projections,
    "does nothing if the version has already been applied"
  );
});

test("applyCommits", async (assert) => {
  projections = {
    "123": {
      id: "123",
      version: 2,
      state: {
        foo: "bar",
      },
    },
  };

  const expected = {
    "123": {
      id: "123",
      version: 3,
      state: {
        foo: "baz",
      },
    },
    "456": {
      id: "456",
      version: 2,
      state: {
        foo: "zab",
      },
    },
  };

  const commitBase = {
    entityName: "foo",
    commitId: "123",
    committedAt: 123,
  };

  const applied = await repo.applyCommits([
    {
      ...commitBase,
      entityId: "123",
      version: 2,
      events: [
        {
          foo: "baz",
        },
      ],
    },
    {
      ...commitBase,
      entityId: "456",
      version: 0,
      events: [
        {
          foo: "baz",
        },
        {
          foo: "zab",
        },
      ],
    },
  ]);

  assert.same(
    projections,
    expected,
    "applies commits to new and existing projections"
  );
  assert.same(applied, { behind: [] }, "reports nothing behind");

  const gap = await repo.applyCommits([
    {
      ...commitBase,
      entityId: "123",
      version: 4,
      events: [
        {
          foo: "gap",
        },
      ],
    },
    {
      ...commitBase,
      entityId: "123",
      version: 5,
      events: [
        {
          foo: "gap",
        },
      ],
    },
    {
      ...commitBase,
      entityId: "789",
      version: 0,
      events: [
        {
          foo: "new",
        },
      ],
    },
  ]);

  assert.same(gap, { behind: ["123"] }, "reports an entity with a version missing");
  assert.same(projections["123"], expected["123"], "leaves that entity alone");
  assert.same(
    projections["789"],
    { id: "789", version: 1, state: { foo: "new" } },
    "still applies the rest of the batch"
  );

  let previousCopy = { ...projections };

  await repo.applyCommits([
    {
      ...commitBase,
      entityId: "456",
      version: 0,
      events: [
        {
          foo: "baz",
        },
        {
          foo: "zab",
        },
      ],
    },
  ]);
  assert.same(
    previousCopy,
    projections,
    "does nothing if the version has already been applied"
  );
});

test("rebuild", async (assert) => {
  const commitBase = {
    entityName: "foo",
    commitId: "123",
    committedAt: 123,
  };
  const commit = (entityId: string, version: number, ...foos: string[]) => ({
    ...commitBase,
    entityId,
    version,
    events: foos.map((foo) => ({ foo })),
  });

  projections = {
    "123": { id: "123", version: 3, state: { foo: "stale" } },
    "999": { id: "999", version: 5, state: { foo: "newer" } },
  };

  const result = await repo.rebuild([
    // out of order, as a store might return them
    [commit("123", 1, "b", "c"), commit("123", 0, "a")],
    [commit("456", 0, "x")],
    [commit("789", 0, "a"), commit("789", 2, "c")],
    [commit("999", 0, "old")],
  ]);

  assert.same(
    projections["123"],
    { id: "123", version: 3, state: { foo: "c" } },
    "overwrites an existing projection at the same version"
  );
  assert.same(
    projections["456"],
    { id: "456", version: 1, state: { foo: "x" } },
    "creates a new projection"
  );
  assert.notOk(projections["789"], "doesn't write an entity with missing versions");
  assert.same(
    projections["999"].state,
    { foo: "newer" },
    "doesn't regress a projection that's already further along"
  );
  assert.same(result.rebuilt, 2, "counts written projections");
  assert.match(
    result.failed,
    [
      { entityId: "789", reason: /versionMismatch/ },
      { entityId: "999", reason: "conflict" },
    ],
    "reports version gaps and conflicts as failures"
  );

  assert.same(
    await repo.rebuild([[]]),
    { rebuilt: 0, failed: [] },
    "ignores empty entities"
  );
});
