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

// Query operators that also match documents where the field is absent.
const MATCHES_MISSING = ["$ne", "$nin", "$not", "$exists"];

// True if `value` could match a document that lacks the field being filtered.
// `{ field: null }` and the operators above all match absent fields; plain
// equality, $in, and range operators do not.
export const canMatchMissing = (value: unknown): boolean => {
  if (value === null) return true;
  if (Array.isArray(value)) return value.some(canMatchMissing);
  if (typeof value === "object")
    return Object.entries(value as Record<string, unknown>).some(
      ([k, v]) => MATCHES_MISSING.includes(k) || canMatchMissing(v)
    );
  return false;
};

export const getDb = ({ uri, database, ...config }: MongodbConfig) => {
  if (!clients[uri]) {
    const newClient = new MongoClient(uri, config);
    // Once a client's topology closes (e.g. its first connect attempt failed),
    // the driver never reopens it on subsequent operations — every call throws
    // MongoTopologyClosedError forever. Evict it so the next operation builds
    // a fresh client instead.
    newClient.on("topologyClosed", () => {
      if (clients[uri] === newClient) delete clients[uri];
    });
    clients[uri] = newClient;
  }
  return clients[uri].db(database);
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
  // Resolve db/collection handles per operation (they're cheap namespace
  // wrappers, no I/O) so that operations always go through the client cache —
  // if a poisoned client was evicted, the next operation gets a fresh one.
  const collection = () => getDb(config).collection<Result<AggregateShape>>(entityName);
  const versionLock = () => getDb(config).collection<Result<string>>("versionLock");

  return {
    set: async ({ id, version, state }) => {
        await collection().replaceOne(
          { _id: id, _version: { $lt: version } },
          { _version: version, ...(state && { _state: state }) },
          { upsert: true }
        );
    },
    get: async (id) => {
      const res = await collection().findOne({ _id: id });
      if (!res) return;

      return parseResult(res);
    },
    reset: async () => {
      await versionLock().deleteOne({ _id: entityName });
      await getDb(config).dropCollection(entityName);
    },

    setVersionLock: async ({
      version,
      lastCommitId,
    }: Required<VersionLock>) => {
      await versionLock().replaceOne(
        { _id: entityName, _version: { $lt: version } },
        { _version: version, _state: lastCommitId },
        { upsert: true }
      );
    },
    getVersionLock: async () => {
      // use readPreference primary to ensure we always read the latest version lock, even if we're connected to a replica set
      // because we process commits sequentially, we can be sure that if the version lock is updated, it will be available on the primary by the time we read it
      const res = await versionLock().findOne({ _id: entityName }, { readPreference: "primary"});
      if (!res) return;

      return { lastCommitId: res._state, version: res._version };
    },
    batchGet: async (ids) => {
      const res = await collection()
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

      await collection().bulkWrite(params);
    },
    search: async (params) => {
      if (params.rawSearch) throw new Error("rawSearchNotSupported");
      
      const hasFilter =
        !!params.filter && Object.keys(params.filter).length > 0;
      const filterParams = hasFilter
        ? flattenQuery({ _state: params.filter })
        : params.rawQuery;

      // `{ _state: { $exists: true } }` excludes tombstones — documents left
      // holding only _id/_version after a delete. It is only *required* when
      // the filter could itself match one: negation operators and null
      // equality match absent fields, plain equality and $in do not.
      const needsStateGuard = !hasFilter || canMatchMissing(params.filter);

      const stateGuard = { _state: { $exists: true } };
      const base: any[] = [];
      if (filterParams) base.push(filterParams);

      const combine = (conditions: any[]): any =>
        conditions.length > 1 ? { $and: conditions } : conditions[0] ?? {};

      // The count omits the guard wherever correctness allows. No _state.*
      // index can answer $exists on _state, so including it costs a document
      // fetch per index entry (IXSCAN, ~670us each) instead of a covered scan
      // (IXONLYSCAN, ~1us each) — 39.6s versus 87ms on the prod policy
      // collection, for the same 58k rows.
      const countFilter = combine(needsStateGuard ? [...base, stateGuard] : base);

      // The find always keeps it, and must. Several _state.* indexes are
      // partial on exactly `{ _state: { $exists: true } }`, and DocumentDB
      // only considers a partial index when the query carries a predicate
      // satisfying that filter. Drop the guard and every one of them becomes
      // ineligible, so a sort on a partially-indexed field loses its stream
      // and falls back to scanning all matches into a blocking SORT.
      //
      // Measured on prod policy, filtering status and sorting createdAt:
      //   without the guard: 43/43 finds took LIMIT_SKIP->SORT->IXSCAN on an
      //     unrelated index, 262ms-57.6s, never once touching
      //     _state.createdAt_-1
      //   with the guard: LIMIT_SKIP->IXSCAN on _state.createdAt_-1, no SORT
      //     stage, 69-124ms
      //
      // So this is load-bearing, not redundancy to be tidied away, and it is
      // not a plan hint — a hint on the sort index would not restore
      // eligibility. Any new index meant to serve a sort should be created
      // non-partial, so it does not depend on this predicate surviving.
      const findFilter = combine([...base, stateGuard]);

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
      const total = await collection().countDocuments(countFilter);
      const results = await collection().find(findFilter, options).toArray();

      return {
        data: results.map(parseResult),
        total,
      };
    },
  };
}
