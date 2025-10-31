import { test } from "tap";

test("build", async (assert) => {
  const build = (params: any) => params;

  const writeModelBuilder = await assert.mockImport("../writeModelBuilder.ts", {
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

  const aggregateName = "TestAggregate";

  const expected = {
    aggregateName,
    actions,
    repository: {
      eventStore,
      reducer,
    },
  };

  const writeModel = writeModelBuilder.build({
    aggregateName,
    eventStore,
    reducer,
    actions,
  });

  assert.same(writeModel, expected);
});
