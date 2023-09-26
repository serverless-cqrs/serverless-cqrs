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
let versionLock = {};

const projectionStore = {
  get: async (id: string) => projections[id],
  set: async (obj: any) => {
    projections[obj.id] = obj;
  },
  getVersionLock: async () => ({
    version: 2,
    lastCommitId: "123",
  }),
  setVersionLock: async (lock: any) => {
    versionLock = lock;
  },
  batchGet: async (ids: string[]) =>
    ids.map((id) => ({
      id,
      version: 2,
      state: {
        foo: "bar",
      },
    })),
  batchWrite: async (obj: Record<string, any>) => {
    projections = {
      ...projections,
      ...obj,
    };
  },
  search: async (params: any) => params,
};

const reducer = (events: EventShape[], state?: ProjectionShape) =>
  events.reduce((p, c) => ({ ...p, ...c }), state || ({} as ProjectionShape));

const repo = build<ProjectionShape, EventShape>({
  projectionStore,
  reducer,
});

test("getVersionLock", async (assert) => {
  const res = await repo.getVersionLock();
  assert.same(res.version, 2, "returns the version");

  assert.same(res.lastCommitId, "123", "returns the lastCommitId");

  await res.save([{ commitId: "456" }]);

  assert.same(
    versionLock,
    {
      version: 3,
      lastCommitId: "456",
    },
    "saves the last commit id and increments version"
  );
});

test("getVersionLock - none", async (assert) => {
  const repo = build({
    projectionStore: {
      ...projectionStore,
      getVersionLock: async () => undefined,
    },
    reducer,
  });

  const res = await repo.getVersionLock();
  assert.same(res.version, 0, "returns the default version");

  assert.same(res.lastCommitId, undefined, "returns undefined lastCommitId ");
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

  await repo.applyCommits([
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

  assert.rejects(
    () =>
      repo.applyCommits([
        {
          ...commitBase,
          entityId: "123",
          version: 4,
          events: [
            {
              foo: "baz",
            },
          ],
        },
      ]),
    "throws if there is a version missing"
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
