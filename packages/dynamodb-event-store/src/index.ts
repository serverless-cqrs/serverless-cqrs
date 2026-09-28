import {
  DynamoDB,
  DynamoDBClientConfig,
  QueryCommandInput,
  ReturnValue,
  ScanCommandInput,
} from "@aws-sdk/client-dynamodb";
import { Commit, EventStore, ConcurrencyError } from "@serverless-cqrs/types";
import { default as cuid } from "cuid";

export interface DynamoDBConfig extends DynamoDBClientConfig {
  tableName: string;
  indexName: string;
}

interface BuildParams {
  entityName: string;
}

// DynamoDB allows at most 1,000,000 segments in a parallel scan.
const MAX_SEGMENTS = 1000000;

interface DynamoDBPartition {
  segment: number;
  totalSegments: number;
}
export interface AttributeValue {
  B?: string | undefined;
  BS?: string[] | undefined;
  BOOL?: boolean | undefined;
  L?: AttributeValue[] | undefined;
  M?: { [id: string]: AttributeValue } | undefined;
  N?: string | undefined;
  NS?: string[] | undefined;
  NULL?: boolean | undefined;
  S?: string | undefined;
  SS?: string[] | undefined;
}
type Item = Record<string, AttributeValue>;

export const parseCommit = <EventShape>(item: Item): Commit<EventShape> => ({
  entityId: item.entityId.S!,
  version: parseInt(item.version.N!),
  entityName: item.entityName.S!,
  commitId: item.commitId.S!,
  events: JSON.parse(item.events.S!),
  committedAt: parseInt(item.committedAt.N!),
});

export function build<EventShape>(
  { entityName }: BuildParams,
  { tableName, indexName, ...awsOptions }: DynamoDBConfig
): EventStore<EventShape> {
  const dynamodb = new DynamoDB(awsOptions);

  // query returns at most 1MB per call, so follow LastEvaluatedKey to get every page.
  const queryAll = async (params: QueryCommandInput) => {
    const items = [] as Item[];
    let ExclusiveStartKey: QueryCommandInput["ExclusiveStartKey"];

    do {
      const { Items = [], LastEvaluatedKey } = await dynamodb.query({
        ...params,
        ...(ExclusiveStartKey && { ExclusiveStartKey }),
      });
      items.push(...(Items as Item[]));
      ExclusiveStartKey = LastEvaluatedKey;
    } while (ExclusiveStartKey);

    return items;
  };

  const queryCommits = async (entityId: string, version: number) => {
    const items = await queryAll({
      TableName: tableName,
      ConsistentRead: true,
      KeyConditionExpression: "entityId = :entityId and version >= :version",
      ExpressionAttributeValues: {
        ":entityId": { S: entityId },
        ":version": { N: version.toString() },
      },
    });

    return items.map((item) => parseCommit<EventShape>(item));
  };

  return {
    loadEvents: async (entityId, version = 0) => {
      const commits = await queryCommits(entityId, version);
      return commits.flatMap((c) => c.events);
    },
    loadCommits: (entityId) => queryCommits(entityId, 0),
    listCommits: async (sinceCommitId = "0") => {
      const params = {
        TableName: tableName,
        IndexName: indexName,
        KeyConditionExpression:
          "entityName = :entityName and commitId > :commitId",
        ExpressionAttributeValues: {
          ":entityName": { S: entityName },
          ":commitId": { S: sinceCommitId },
        },
      };

      const { Items = [] } = await dynamodb.query(params);

      return Items.map((item) => parseCommit<EventShape>(item as Item));
    },
    getLatestCommitId: async () => {
      const { Items = [] } = await dynamodb.query({
        TableName: tableName,
        IndexName: indexName,
        KeyConditionExpression: "entityName = :entityName",
        ExpressionAttributeValues: {
          ":entityName": { S: entityName },
        },
        ScanIndexForward: false,
        Limit: 1,
        ProjectionExpression: "commitId",
      });

      return Items[0]?.commitId?.S;
    },
    listPartitions: async ({ targetSize }) => {
      // ItemCount covers every entity type in the table and is only refreshed every few
      // hours, so this is an estimate. Overestimating just means smaller segments.
      const { Table } = await dynamodb.describeTable({ TableName: tableName });
      const totalSegments = Math.min(
        MAX_SEGMENTS,
        Math.max(1, Math.ceil((Table?.ItemCount ?? 0) / targetSize))
      );

      return Array.from({ length: totalSegments }, (_, segment) => ({
        segment,
        totalSegments,
      }));
    },
    // a parallel scan segment covers a range of the partition-key hash space, so all of an
    // entity's commits are in the same segment, next to each other and sorted by version.
    // Group them as they stream past, carrying an entity over a page boundary if needed.
    scanPartition: async function* (partition) {
      const { segment, totalSegments } = partition as DynamoDBPartition;
      let ExclusiveStartKey: ScanCommandInput["ExclusiveStartKey"];
      let entity = [] as Commit<EventShape>[];

      do {
        const { Items = [], LastEvaluatedKey } = await dynamodb.scan({
          TableName: tableName,
          Segment: segment,
          TotalSegments: totalSegments,
          ConsistentRead: false,
          FilterExpression: "entityName = :entityName",
          ExpressionAttributeValues: {
            ":entityName": { S: entityName },
          },
          ...(ExclusiveStartKey && { ExclusiveStartKey }),
        });

        for (const item of Items) {
          const commit = parseCommit<EventShape>(item as Item);
          if (entity.length > 0 && entity[0].entityId !== commit.entityId) {
            yield entity;
            entity = [];
          }
          entity.push(commit);
        }

        ExclusiveStartKey = LastEvaluatedKey;
      } while (ExclusiveStartKey);

      if (entity.length > 0) yield entity;
    },
    append: async (entityId, version, events) => {
      const now = Date.now();
      const commitId = cuid();

      const params = {
        TableName: tableName,
        Item: {
          commitId: { S: commitId },
          committedAt: { N: now.toString() },
          entityId: { S: entityId },
          entityName: { S: entityName },
          version: { N: version.toString() },
          events: { S: JSON.stringify(events) },
        },
        ConditionExpression: "attribute_not_exists(version)",
        ReturnValues: ReturnValue.NONE,
      };
      try {
        await dynamodb.putItem(params);
      } catch (err: any) {
        if (err.name === "ConditionalCheckFailedException") {
          throw new ConcurrencyError({
            name: "ConcurrencyError",
            message: "A commit already exists with the specified version",
          });
        }

        throw err;
      }
    },
  };
}
