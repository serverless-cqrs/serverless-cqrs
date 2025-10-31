import { test } from "tap";

const build = (key: string) => (params: any) => ({ [key]: params });

const reducer = () => {};
const eventStore = {};
const projectionStore = {};

const defaultOptions = {
  projectionStore,
  eventStore,
  reducer,
};

test("parseEvent", async (assert) => {
  const readModelBuilder = await assert.mockImport("../readModelBuilder.ts", {
    "@serverless-cqrs/read-model": {
      repositoryBuilder: { build: build("repository") },
      queryServiceBuilder: { build: build("queryService") },
      refreshServiceBuilder: { build: build("refreshService") },
    },
  });

  const expected = {
    refreshService: {
      repository: {
        repository: {
          projectionStore,
          reducer,
        },
      },
      eventStore,
    },
    queryService: {
      repository: {
        repository: {
          projectionStore,
          reducer,
        },
      },
    },
  };

  const readModel = readModelBuilder.build(defaultOptions);

  assert.same(readModel, expected);
});

// test("handleEvent", async (assert) => {
//   const readModelBuilder = proxyquire("../readModelBuilder", {
//     ...defaultStubs,
//     "serverless-cqrs.read-model": {
//       ...defaultStubs["serverless-cqrs.read-model"],
//       eventServiceBuilder: {
//         build: (params) => ({
//           handleEvent: () => params,
//         }),
//       },
//     },
//   });

//   const expected = {
//     eventAdapter: "foobar",
//     repository: {
//       adapter: "barfoo",
//       reducer,
//     },
//   };

//   const readModel = readModelBuilder.build(defaultOptions);
//   const res = readModel.handleEvent();

//   assert.deepEquals(res, expected);
// });

// test("refresh", async (assert) => {
//   const readModelBuilder = proxyquire("../readModelBuilder", {
//     ...defaultStubs,
//     "serverless-cqrs.read-model": {
//       ...defaultStubs["serverless-cqrs.read-model"],
//       refreshServiceBuilder: {
//         build: (params) => ({
//           refresh: () => params,
//         }),
//       },
//     },
//   });

//   const expected = {
//     eventAdapter: "foobar",
//     repository: {
//       adapter: "barfoo",
//       reducer,
//     },
//   };

//   const readModel = readModelBuilder.build(defaultOptions);
//   const res = readModel.refresh();

//   assert.deepEquals(res, expected);
// });

// test("getById", async (assert) => {
//   const readModelBuilder = proxyquire("../readModelBuilder", {
//     ...defaultStubs,
//     "serverless-cqrs.read-model": {
//       ...defaultStubs["serverless-cqrs.read-model"],
//       queryServiceBuilder: {
//         build: (params) => ({
//           getById: () => params,
//         }),
//       },
//     },
//   });
//   const expected = {
//     repository: {
//       adapter: "barfoo",
//       reducer,
//     },
//   };

//   const readModel = readModelBuilder.build(defaultOptions);
//   const res = readModel.getById();

//   assert.deepEquals(res, expected);
// });

// test("getByIds", async (assert) => {
//   const readModelBuilder = proxyquire("../readModelBuilder", {
//     ...defaultStubs,
//     "serverless-cqrs.read-model": {
//       ...defaultStubs["serverless-cqrs.read-model"],
//       queryServiceBuilder: {
//         build: (params) => ({
//           getByIds: () => params,
//         }),
//       },
//     },
//   });

//   const expected = {
//     repository: {
//       adapter: "barfoo",
//       reducer,
//     },
//   };

//   const readModel = readModelBuilder.build(defaultOptions);
//   const res = readModel.getByIds();

//   assert.deepEquals(res, expected);
// });

// test("search", async (assert) => {
//   const readModelBuilder = proxyquire("../readModelBuilder", {
//     ...defaultStubs,
//     "serverless-cqrs.read-model": {
//       ...defaultStubs["serverless-cqrs.read-model"],
//       queryServiceBuilder: {
//         build: (params) => ({
//           search: () => params,
//         }),
//       },
//     },
//   });

//   const expected = {
//     repository: {
//       adapter: "barfoo",
//       reducer,
//     },
//   };

//   const readModel = readModelBuilder.build(defaultOptions);
//   const res = readModel.search();

//   assert.deepEquals(res, expected);
// });
