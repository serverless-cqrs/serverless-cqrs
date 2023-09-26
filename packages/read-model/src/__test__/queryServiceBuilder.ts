import { test } from "tap";
import { build } from "../queryServiceBuilder";
import { ReadModelRepository } from "@serverless-cqrs/types";

const repository: ReadModelRepository<any, any> = {
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
  getVersionLock: async () => ({ save: async () => {} }),
  applyEvents: async (_id, _events, _version) => {},
  applyCommits: async (_commits) => {},
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
