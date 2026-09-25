import { test } from "tap";
import { mockClient } from "aws-sdk-client-mock";
import {
  DynamoDBClient,
  DescribeTableCommand,
  QueryCommand,
  PutItemCommand,
  ScanCommand,
} from "@aws-sdk/client-dynamodb";

import { build } from "../index";

const ddbMock = mockClient(DynamoDBClient);

const clientParams = {
  tableName: "fooTable",
  indexName: "fooIndex",
};

test("loadEvents", async (assert) => {
  ddbMock.reset();

  const events = [
    { foo: "bar" },
    { bar: "baz" },
    { baz: "bar " },
    { zab: "foo" },
  ];

  const response = {
    Count: 3,
    Items: [
      {
        entityId: { S: "p123" },
        version: { N: "1" },
        entityName: { S: "foo" },
        commitId: { S: "commit1" },
        committedAt: { N: "1234567890" },
        events: { S: JSON.stringify(events.slice(0, 2)) }
      },
      {
        entityId: { S: "p123" },
        version: { N: "2" },
        entityName: { S: "foo" },
        commitId: { S: "commit2" },
        committedAt: { N: "1234567891" },
        events: { S: JSON.stringify(events.slice(2)) }
      },
    ],
  };

  ddbMock.on(QueryCommand).resolves(response);

  const expectedParams = {
    TableName: "fooTable",
    ConsistentRead: true,
    KeyConditionExpression: "entityId = :entityId and version >= :version",
    ExpressionAttributeValues: {
      ":entityId": { S: "p123" },
      ":version": { N: "0" },
    },
  };

  const res = await build({ entityName: "foo" }, clientParams).loadEvents(
    "p123"
  );

  const sentParams = ddbMock.call(0).args[0].input;

  assert.same(sentParams, expectedParams, "queries dynamodb for events");
  assert.same(res, events, "returns parsed events");
});

const item = (entityId: string, version: number, events: any[]) => ({
  entityId: { S: entityId },
  version: { N: version.toString() },
  entityName: { S: "foo" },
  commitId: { S: `${entityId}-${version}` },
  committedAt: { N: "1234567890" },
  events: { S: JSON.stringify(events) },
});

test("loadEvents - pagination", async (assert) => {
  ddbMock.reset();

  const lastKey = { entityId: { S: "p123" }, version: { N: "1" } };
  ddbMock
    .on(QueryCommand)
    .resolvesOnce({ Items: [item("p123", 0, ["a"]), item("p123", 1, ["b"])], LastEvaluatedKey: lastKey })
    .resolvesOnce({ Items: [item("p123", 2, ["c"])] });

  const res = await build({ entityName: "foo" }, clientParams).loadEvents("p123");

  assert.same(res, ["a", "b", "c"], "returns events from every page");
  assert.equal(ddbMock.calls().length, 2, "follows LastEvaluatedKey");
  assert.same(
    (ddbMock.call(1).args[0].input as any).ExclusiveStartKey,
    lastKey,
    "resumes after the last key"
  );
});

test("loadCommits", async (assert) => {
  ddbMock.reset();

  ddbMock.on(QueryCommand).resolves({ Items: [item("p123", 0, ["a"]), item("p123", 1, ["b", "c"])] });

  const res = await build({ entityName: "foo" }, clientParams).loadCommits("p123");

  assert.same(
    ddbMock.call(0).args[0].input,
    {
      TableName: "fooTable",
      ConsistentRead: true,
      KeyConditionExpression: "entityId = :entityId and version >= :version",
      ExpressionAttributeValues: {
        ":entityId": { S: "p123" },
        ":version": { N: "0" },
      },
    },
    "queries every commit for the entity"
  );
  assert.match(
    res,
    [
      { entityId: "p123", version: 0, events: ["a"] },
      { entityId: "p123", version: 1, events: ["b", "c"] },
    ],
    "returns parsed commits"
  );
});

test("getLatestCommitId", async (assert) => {
  ddbMock.reset();

  ddbMock.on(QueryCommand).resolves({ Items: [{ commitId: { S: "c9" } }] });
  const store = build({ entityName: "foo" }, clientParams);

  assert.equal(await store.getLatestCommitId(), "c9", "returns the newest commitId");
  assert.same(
    ddbMock.call(0).args[0].input,
    {
      TableName: "fooTable",
      IndexName: "fooIndex",
      KeyConditionExpression: "entityName = :entityName",
      ExpressionAttributeValues: { ":entityName": { S: "foo" } },
      ScanIndexForward: false,
      Limit: 1,
      ProjectionExpression: "commitId",
    },
    "reads the commit index in reverse"
  );

  ddbMock.reset();
  ddbMock.on(QueryCommand).resolves({ Items: [] });
  assert.equal(await store.getLatestCommitId(), undefined, "undefined when empty");
});

test("listPartitions", async (assert) => {
  ddbMock.reset();

  ddbMock.on(DescribeTableCommand).resolves({ Table: { ItemCount: 2500 } });
  const store = build({ entityName: "foo" }, clientParams);

  const partitions = await store.listPartitions({ targetSize: 1000 });
  assert.same(
    partitions,
    [
      { segment: 0, totalSegments: 3 },
      { segment: 1, totalSegments: 3 },
      { segment: 2, totalSegments: 3 },
    ],
    "sizes segments from the table's item count"
  );

  ddbMock.reset();
  ddbMock.on(DescribeTableCommand).resolves({ Table: { ItemCount: 0 } });
  assert.equal((await store.listPartitions({ targetSize: 1000 })).length, 1, "at least one segment");
});

test("scanPartition", async (assert) => {
  ddbMock.reset();

  const lastKey = { entityId: { S: "b" }, version: { N: "0" } };
  ddbMock
    .on(ScanCommand)
    .resolvesOnce({
      Items: [item("a", 0, ["a0"]), item("a", 1, ["a1"]), item("b", 0, ["b0"])],
      LastEvaluatedKey: lastKey,
    })
    .resolvesOnce({ Items: [item("b", 1, ["b1"]), item("c", 0, ["c0"])] });

  const store = build({ entityName: "foo" }, clientParams);
  const entities = [] as any[];
  for await (const commits of store.scanPartition({ segment: 2, totalSegments: 8 }))
    entities.push(commits.map((c) => `${c.entityId}${c.version}`));

  assert.same(entities, [["a0", "a1"], ["b0", "b1"], ["c0"]], "groups commits by entity across pages");
  assert.same(
    ddbMock.call(0).args[0].input,
    {
      TableName: "fooTable",
      Segment: 2,
      TotalSegments: 8,
      ConsistentRead: true,
      FilterExpression: "entityName = :entityName",
      ExpressionAttributeValues: { ":entityName": { S: "foo" } },
    },
    "scans the segment for this entity type"
  );
  assert.same(
    (ddbMock.call(1).args[0].input as any).ExclusiveStartKey,
    lastKey,
    "resumes after the last key"
  );
});

test("listCommits", async (assert) => {
  ddbMock.reset();

  const events = [
    "zero",
    "one",
    "two",
    "three",
    "four",
    "five",
    "six",
    "seven",
    "eight",
    "nine",
    "ten",
  ];

  const commits = events.map((e, i) => ({
    entityId: "e123",
    entityName: "foo",
    commitId: "c" + i.toString(),
    version: i + 1,
    events: [e],
    committedAt: 1234567890,
  }));

  const response = {
    Count: commits.length,
    Items: commits.map((c) => ({
      entityId: {
        S: c.entityId,
      },
      commitId: {
        S: c.commitId,
      },
      entityName: {
        S: c.entityName,
      },
      version: {
        N: c.version.toString(),
      },
      committedAt: {
        N: c.committedAt.toString(),
      },
      events: {
        S: JSON.stringify(c.events),
      },
    })),
  };

  ddbMock.on(QueryCommand).resolves(response);

  const { listCommits } = build({ entityName: "foo" }, clientParams);

  const results = await listCommits();

  const expectedParams = {
    TableName: "fooTable",
    IndexName: "fooIndex",
    ExpressionAttributeValues: {
      ":entityName": {
        S: "foo",
      },
      ":commitId": {
        S: "0",
      },
    },
    KeyConditionExpression: "entityName = :entityName and commitId > :commitId",
  };

  const sentParams = ddbMock.call(0).args[0].input;

  assert.same(sentParams, expectedParams, "queries dynamodb");

  assert.same(results, commits, "returns all events");
});

test("append", async (assert) => {
  ddbMock.reset();

  ddbMock.on(PutItemCommand).resolves({});

  const events = [{ foo: "bar" }, { bar: "baz" }];

  const expectedParams = {
    Item: {
      commitId: { S: /\w*/ },
      committedAt: { N: /\d*/ },
      entityId: { S: "p123" },
      entityName: { S: "foo" },
      version: { N: "3" },
      events: { S: JSON.stringify(events) },
    },
    ConditionExpression: "attribute_not_exists(version)",
    ReturnValues: "NONE",
  };

  await build({ entityName: "foo" }, clientParams).append("p123", 3, events);

  const sentParams = ddbMock.call(0).args[0].input;

  assert.match(sentParams, expectedParams, "makes putItem request to dynamodb");

  ddbMock.reset();
  
  const error = new Error("ConditionalCheckFailedException");
  error.name = "ConditionalCheckFailedException";
  ddbMock.on(PutItemCommand).rejects(error);

  await build({ entityName: "foo" }, clientParams)
    .append("p123", 3, events)
    .catch((e) => {
      assert.equal(
        e.message,
        "A commit already exists with the specified version"
      );
    });
});
