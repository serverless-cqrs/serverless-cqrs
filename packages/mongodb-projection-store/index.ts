import { ProjectionStore, VersionLock } from "@serverless-cqrs/types";
import { MongoClient, MongoClientOptions, FindOptions } from "mongodb";

const clients: {
  [index: string]: MongoClient;
} = {};

export interface MongodbConfig extends MongoClientOptions {
  uri: string;
  database: string;
}

export const flattenQuery = (obj: Record<string, any>, prefix=''):Record<string, any> => {

  // for each deeply nested key, create key at the root which is a concatenation of all the keys to get there
  // 

// { a: { b: { $c: [1, 2],  } } }
  return Object.keys(obj).reduce((p, key) => {
    const value = obj[key];

    const nextPrefix = `${prefix}${prefix ? '.' : ''}${key}`

    if (
      typeof value == 'object'
      && !Array.isArray(value)
      && !Object.keys(value).some(k => k.startsWith('$')) // exclude objects which have operator keys

    ) 
      return {
        ...p,
        ...flattenQuery(value, nextPrefix)
      }
    

    return {
      ...p,
      [nextPrefix]: value
    }

  }, {})

}

export const getDb = ({ uri, database, ...config }: MongodbConfig) => {
  if (clients[uri]) return clients[uri].db(database);
  const newClient = new MongoClient(uri, config);
  clients[uri] = newClient;
  return newClient.db(database);
};

interface Result<AggregateShape> {
  _id: string;
  _version: number;
  _state?: AggregateShape;
}

const parseResult = <AggregateShape>({
  _id,
  _version = 0,
  _state,
}: Result<AggregateShape>) => ({
  id: _id,
  version: _version,
  state: _state,
});

interface BuildParams {
  entityName: string;
}

export function build<AggregateShape>(
  { entityName }: BuildParams,
  config: MongodbConfig
): ProjectionStore<AggregateShape> {
  const db = getDb(config);
  const collection = db.collection<Result<AggregateShape>>(entityName);
  const versionLock = db.collection<Result<string>>("versionLock");

  return {
    set: async ({ id, version, state }) => {
        await collection.replaceOne(
          { _id: id, _version: { $lt: version } },
          { _version: version, ...(state && { _state: state }) },
          { upsert: true }
        );
    },
    get: async (id) => {
      const res = await collection.findOne({ _id: id });
      if (!res) return;

      return parseResult(res);
    },
    reset: async () => {
      await versionLock.deleteOne({ _id: entityName });
      await db.dropCollection(entityName);
    },

    setVersionLock: async ({
      version,
      lastCommitId,
    }: Required<VersionLock>) => {
      await versionLock.replaceOne(
        { _id: entityName, _version: { $lt: version } },
        { _version: version, _state: lastCommitId },
        { upsert: true }
      );
    },
    getVersionLock: async () => {
      // use readPreference primary to ensure we always read the latest version lock, even if we're connected to a replica set
      // because we process commits sequentially, we can be sure that if the version lock is updated, it will be available on the primary by the time we read it
      const res = await versionLock.findOne({ _id: entityName }, { readPreference: "primary"});
      if (!res) return;

      return { lastCommitId: res._state, version: res._version };
    },
    batchGet: async (ids) => {
      const res = await collection
        .find({
          _id: {
            $in: ids,
          },
        })
        .toArray();

      return res.map(parseResult);
    },
    batchWrite: async (obj) => {
      const params = Object.keys(obj).map((id) => {
        const { version, state } = obj[id];
          return {
            replaceOne: {
              filter: { _id: id, _version: { $lt: version } },
              replacement: { _id: id, _version: version, ...(state && { _state: state }) },
              upsert: true,
            },
          };
      });

      await collection.bulkWrite(params);
    },
    search: async (params) => {
      if (params.rawSearch) throw new Error("rawSearchNotSupported");
      
      const filterArray = [{ _state: {'$exists':true}}]
      const filterParams = params.filter && Object.keys(params.filter).length > 0
      ? flattenQuery({ _state: params.filter })
      : params.rawQuery;
      if (filterParams) filterArray.unshift(filterParams)
      console.log(filterParams)
      const filter:any = {
        '$and': filterArray
      }

      let options: FindOptions = {};
      if (params.pagination) {
        const { page, perPage } = params.pagination;
        options.skip = (page - 1) * perPage;
        options.limit = perPage;
      }

      if (params.sort) {
        let { field, order } = params.sort;

        if (field == "id") field = "_id";
        else field = "_state." + field;

        options.sort = [field, order.toLowerCase()];
      }
      const total = await collection.countDocuments(filter);
      const results = await collection.find(filter, options).toArray();

      return {
        data: results.map(parseResult),
        total,
      };
    },
  };
}
