import { test } from "tap";
import { build } from "../commandServiceBuilder";

const actions = {
  foo: (state: any, metadata: any, payload: any) => ({
    state,
    payload,
    metadata,
  }),
};

test("build", async (assert) => {
  const expectedEvents = [
    [
      {
        state: {
          id: "123",
          foo: "bar",
        },
        payload: {
          bar: "baz",
        },
        metadata: {
          at: 123,
          aggregateId: "123",
        },
      },
    ],
  ];

  const events: any[] = [];
  const repository = {
    getById: async (id: string) => ({
      state: {
        id,
        foo: "bar",
      },
      save: async (event: any) => {
        events.push(event);
      },
    }),
  };

  const commandService = build({
    repository,
    actions,
  });

  await commandService.foo("123", { at: 123 }, { bar: "baz" });

  assert.same(events, expectedEvents, "wraps given actions with reducer");
});
