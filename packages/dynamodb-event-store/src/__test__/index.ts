import { test } from "tap";
import { mockClient } from "aws-sdk-client-mock";
import { DynamoDBClient, QueryCommand, PutItemCommand } from "@aws-sdk/client-dynamodb";

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
