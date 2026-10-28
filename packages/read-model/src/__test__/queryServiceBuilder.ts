import { test } from "tap";
import { build } from "../queryServiceBuilder";
import { ReadModelRepository } from "@serverless-cqrs/types";

const repository: ReadModelRepository<any, any> = {
  reset: async () => {},
  getById: async (id) => ({
    id,
    version: 0,
    state: {
      foo: "bar",
    },
  }),
  getByIds: async (ids) =>
    ids.map((id) => ({
      id,
      version: 0,
      state: {
        bar: "baz",
      },
    })),
  search: async () => ({
    total: 1,
    data: [
      {
        id: "a123",
        version: 0,
        state: {
          userId: "u123",
        },
      },
    ],
  }),
  getCheckpoint: async () => undefined,
  setCheckpoint: async () => {},
  rebuild: async () => ({ rebuilt: 0, failed: [] }),
  applyEvents: async (_id, _events, _version) => {},
  applyCommits: async (_commits) => ({ behind: [] }),
};

const handler = build({
  repository,
});

test("getById", async (assert) => {
  const expected = {
    id: "a123",
    foo: "bar",
  };

  const res = await handler.getById({ id: "a123" });
  assert.same(res, expected, "returns for id");
});

test("getByIds", async (assert) => {
  const expected = [
    {
      id: "a123",
      bar: "baz",
    },
    {
      id: "a456",
      bar: "baz",
    },
  ];

  const res = await handler.getByIds({ ids: ["a123", "a456"] });
  assert.same(res, expected, "returns for ids");
});

test("search", async (assert) => {
  const expected = {
    total: 1,
    data: [
      {
        id: "a123",
        userId: "u123",
      },
    ],
  };

  const res = await handler.search({ userId: "u123" });
  assert.same(res, expected, "returns for search");
});

test("only an explicit consistentRead: true reads the primary", async (assert) => {
  const reads: any[] = [];
  const recording = build({
    repository: {
      ...repository,
      getById: async (id, options) => (reads.push(["getById", options]), repository.getById(id)),
      getByIds: async (ids, options) => (reads.push(["getByIds", options]), repository.getByIds(ids)),
      search: async (params) => (reads.push(["search", params.consistentRead]), repository.search(params)),
    },
  });

  await recording.getById({ id: "a123" });
  await recording.getById({ id: "a123", consistentRead: false });
  await recording.getById({ id: "a123", consistentRead: true });
  await recording.getByIds({ ids: ["a123"] });
  await recording.getByIds({ ids: ["a123"], consistentRead: true });
  await recording.search({ filter: { userId: "u123" } });
  await recording.search({ filter: { userId: "u123" }, consistentRead: null });
  await recording.search({ filter: { userId: "u123" }, consistentRead: true });

  assert.same(reads, [
    ["getById", { consistentRead: false }],
    ["getById", { consistentRead: false }],
    ["getById", { consistentRead: true }],
    ["getByIds", { consistentRead: false }],
    ["getByIds", { consistentRead: true }],
    ["search", false],
    ["search", false],
    ["search", true],
  ]);
});

