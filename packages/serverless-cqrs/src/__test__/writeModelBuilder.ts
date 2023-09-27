import { test, mockRequire } from "tap";

test("build", async (assert) => {
  const build = (params: any) => params;

  const writeModelBuilder = await mockRequire("../writeModelBuilder.ts", {
    "@serverless-cqrs/write-model": {
      repositoryBuilder: { build },
      commandServiceBuilder: { build },
    },
  });

  const reducer = () => {};

  const actions = {
    foo: () => "bar",
  };

  const eventStore = {};

  const expected = {
    actions,
    repository: {
      eventStore,
      reducer,
    },
  };

  const readModel = writeModelBuilder.build({
    eventStore,
    reducer,
    actions,
  });

  assert.same(readModel, expected);
});
