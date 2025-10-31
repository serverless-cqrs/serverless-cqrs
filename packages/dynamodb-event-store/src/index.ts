import { DynamoDB, DynamoDBClientConfig, ReturnValue } from "@aws-sdk/client-dynamodb";
import { Commit, EventStore, RepositoryError } from "@serverless-cqrs/types";
import { default as cuid } from "cuid";

export interface DynamoDBConfig extends DynamoDBClientConfig {
  tableName: string;
  indexName: string;
}

interface BuildParams {
  entityName: string;
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

  return {
    loadEvents: async (entityId, version = 0) => {
      const params = {
        TableName: tableName,
        ConsistentRead: true,
        KeyConditionExpression: "entityId = :entityId and version >= :version",
        ExpressionAttributeValues: {
          ":entityId": { S: entityId },
          ":version": { N: version.toString() },
        },
      };

      const { Items = [] } = await dynamodb.query(params);

      return Items.map((item) => parseCommit<EventShape>(item as Item)).reduce(
        (p, c) => [...p, ...c.events],
        [] as EventShape[]
      );
    },
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
          throw new RepositoryError({
            name: "versionExists",
            message: "A commit already exists with the specified version",
          });
        }

        throw err;
      }
    },
  };
}
