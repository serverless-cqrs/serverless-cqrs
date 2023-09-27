import { test } from "tap";

// we have to do this because the typescript compiler doesnt find tap in nodemodules, and so we need to use an old @types/tap which doesnt have mockImport yet
const { mockRequire } = require("tap");

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
