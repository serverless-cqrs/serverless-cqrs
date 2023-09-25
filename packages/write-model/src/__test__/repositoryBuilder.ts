import { test } from "tap";
import { build } from "../repositoryBuilder";
import { EventStore, Commit } from "@serverless-cqrs/types";

interface TestShape {
  [index: string]: string | undefined;
}

const commits: Commit<TestShape>[] = [];
const eventStore: EventStore<TestShape> = {
  loadEvents: (_id: string) =>
    Promise.resolve([{ foo: "bar" }, { bar: "foo" }, { foo: "baz" }]),
  listCommits: async () => commits,
  append: async (entityId, version, events) => {
    commits.push({
      entityId,
      version,
      events,
      commitId: "123",
      committedAt: 123,
      entityName: "foo",
    });
  },
};
const reducer = (events: any[]) =>
  events.reduce((p, c) => ({ ...p, ...c }), {});

const repo = build({
  eventStore: eventStore as EventStore<any>,
  reducer,
});

test("getById", async (assert) => {
  const expected = {
    foo: "baz",
    bar: "foo",
  };

  const { state, save } = await repo.getById("123");

  assert.same(state, expected, "returns current state");

  await save([{ foo: "bar" }]);
  const expectedCommits = [
    {
      entityId: "123",
      version: 3,
      events: [{ foo: "bar" }],
      commitId: "123",
      committedAt: 123,
      entityName: "foo",
    },
  ];
  assert.same(commits, expectedCommits, "appends commits");
});
