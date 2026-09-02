import { test } from "tap";
import { flattenQuery, canMatchMissing } from "../index";

// Filters the adapter handed to the driver, newest last. Lets tests assert on
// the query shape itself, not just the rows it happens to return.
const capturedFilters: any[] = [];

// Mock MongoDB client and collections
class MockCollection {
  private data: Map<string, any> = new Map();

  async replaceOne(filter: any, replacement: any, _options?: any) {
    const id = filter._id;
    const currentDoc = this.data.get(id);
    
    // Check version constraint
    if (currentDoc && filter._version && currentDoc._version >= filter._version.$lt) {
      return { matchedCount: 0 };
    }
    
    this.data.set(id, { _id: id, ...replacement });
    return { matchedCount: 1, modifiedCount: 1 };
  }

  async findOne(filter: any) {
    if (filter._id) {
      return this.data.get(filter._id) || null;
    }
    return null;
  }

  private matchesCondition(doc: any, condition: any): boolean {
    // Check for _state: { $ne: null }
    if (condition._state && condition._state.$ne === null) {
      return doc._state !== null;
    }
    // Check other conditions
    return Object.keys(condition).every((key) => {
      if (key.startsWith('_state.')) {
        const stateKey = key.substring(7);
        const value = condition[key];
        return this.getNestedValue(doc._state, stateKey) === value;
      }
      return true;
    });
  }

  find(filter: any, options?: any) {
    capturedFilters.push(filter);
    let results = Array.from(this.data.values());

    // Apply filter. The adapter drops the $and wrapper when a single condition
    // is enough, so both shapes have to be handled.
    if (filter.$and) {
      results = results.filter((doc: any) =>
        filter.$and.every((condition: any) => this.matchesCondition(doc, condition))
      );
    } else if (!filter._id) {
      results = results.filter((doc: any) => this.matchesCondition(doc, filter));
    }

    if (filter._id && filter._id.$in) {
      results = results.filter((doc: any) => filter._id.$in.includes(doc._id));
    }

    // Apply sort
    if (options?.sort) {
      const [field, order] = options.sort;
      results.sort((a: any, b: any) => {
        const aVal = this.getNestedValue(a, field);
        const bVal = this.getNestedValue(b, field);
        if (order === 'asc') return aVal > bVal ? 1 : -1;
        return aVal < bVal ? 1 : -1;
      });
    }

    // Apply pagination
    if (options?.skip) {
      results = results.slice(options.skip);
    }
    if (options?.limit) {
      results = results.slice(0, options.limit);
    }

    // Return object with toArray method for MongoDB compatibility
    return {
      toArray: () => Promise.resolve(results),
    };
  }

  async countDocuments(filter: any) {
    const findResult = await this.find(filter);
    const array = await findResult.toArray();
    return array.length;
  }

  async deleteOne(filter: any) {
    if (filter._id) {
      this.data.delete(filter._id);
      return { deletedCount: 1 };
    }
    return { deletedCount: 0 };
  }

  async bulkWrite(operations: any[]) {
    for (const op of operations) {
      if (op.replaceOne) {
        await this.replaceOne(
          op.replaceOne.filter,
          op.replaceOne.replacement,
          { upsert: op.replaceOne.upsert }
        );
      }
    }
    return { ok: 1 };
  }

  private getNestedValue(obj: any, path: string) {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }

  // Helper for tests
  clear() {
    this.data.clear();
  }
}

class MockDb {
  private collections: Map<string, MockCollection> = new Map();

  collection(name: string) {
    if (!this.collections.has(name)) {
      this.collections.set(name, new MockCollection());
    }
    return this.collections.get(name)!;
  }

  async dropCollection(name: string) {
    const coll = this.collections.get(name);
    if (coll) {
      coll.clear();
    }
    return true;
  }
}

class MockMongoClient {
  private mockDb = new MockDb();
  listeners: Record<string, Array<() => void>> = {};

  db(_dbName: string) {
    return this.mockDb;
  }

  on(event: string, listener: () => void) {
    (this.listeners[event] ??= []).push(listener);
    return this;
  }

  emit(event: string) {
    for (const listener of this.listeners[event] ?? []) listener();
  }
}

test("flattenQuery - simple object", async (assert) => {
  const input = { a: 1, b: 2 };
  const expected = { a: 1, b: 2 };
  const result = flattenQuery(input);
  assert.same(result, expected, "handles simple object");
});

test("flattenQuery - nested object", async (assert) => {
  const input = { a: { b: { c: 1 } } };
  const expected = { "a.b.c": 1 };
  const result = flattenQuery(input);
  assert.same(result, expected, "flattens nested object");
});

test("flattenQuery - object with operator", async (assert) => {
  const input = { a: { $gt: 5 }, b: { c: { $in: [1, 2] } } };
  const expected = { a: { $gt: 5 }, "b.c": { $in: [1, 2] } };
  const result = flattenQuery(input);
  assert.same(result, expected, "preserves operators at appropriate level");
});

test("flattenQuery - mixed nested and flat", async (assert) => {
  const input = { 
    a: { b: 1 }, 
    c: 2,
    d: { e: { f: 3 } }
  };
  const expected = { 
    "a.b": 1, 
    c: 2,
    "d.e.f": 3
  };
  const result = flattenQuery(input);
  assert.same(result, expected, "handles mixed structures");
});

test("set", async (assert) => {
  const storage = await assert.mockRequire("../index", {
    mongodb: {
      MongoClient: MockMongoClient,
    },
  });
  
  const adapter = storage.build(
    { entityName: "foo" },
    { uri: "mongodb://localhost", database: "test" }
  );

  await adapter.set({
    id: "123",
    version: 1,
    state: { foo: "bar" },
  });

  const result = await adapter.get("123");
  const expected = {
    id: "123",
    version: 1,
    state: { foo: "bar" },
  };

  assert.same(result, expected, "sets projection in store");
});

test("set - version constraint", async (assert) => {
  const storage = await assert.mockRequire("../index", {
    mongodb: {
      MongoClient: MockMongoClient,
    },
  });
  
  const adapter = storage.build(
    { entityName: "foo" },
    { uri: "mongodb://localhost", database: "test" }
  );

  await adapter.set({
    id: "456",
    version: 2,
    state: { foo: "bar" },
  });

  // Try to set with lower version - should not update
  await adapter.set({
    id: "456",
    version: 1,
    state: { foo: "baz" },
  });

  const result = await adapter.get("456");
  assert.equal(result?.version, 2, "doesn't update with lower version");
  assert.same(result?.state, { foo: "bar" }, "state unchanged");
});

test("get", async (assert) => {
  const storage = await assert.mockRequire("../index", {
    mongodb: {
      MongoClient: MockMongoClient,
    },
  });
  
  const adapter = storage.build(
    { entityName: "foo" },
    { uri: "mongodb://localhost", database: "test" }
  );

  await adapter.set({
    id: "123",
    version: 0,
    state: { foo: "bar" },
  });

  const result = await adapter.get("123");
  const expected = {
    id: "123",
    version: 0,
    state: { foo: "bar" },
  };

  assert.same(result, expected, "returns existing projection from store");
});

test("get - non-existent", async (assert) => {
  const storage = await assert.mockRequire("../index", {
    mongodb: {
      MongoClient: MockMongoClient,
    },
  });
  
  const adapter = storage.build(
    { entityName: "foo" },
    { uri: "mongodb://localhost", database: "test" }
  );

  const result = await adapter.get("nonexistent");
  assert.equal(result, undefined, "returns undefined for non-existent id");
});

test("setVersionLock", async (assert) => {
  const storage = await assert.mockRequire("../index", {
    mongodb: {
      MongoClient: MockMongoClient,
    },
  });
  
  const adapter = storage.build(
    { entityName: "foo" },
    { uri: "mongodb://localhost", database: "test" }
  );

  await adapter.setVersionLock({
    version: 5,
    lastCommitId: "commit123",
  });

  const result = await adapter.getVersionLock();
  const expected = {
    version: 5,
    lastCommitId: "commit123",
  };

  assert.same(result, expected, "sets versionLock in store");
});

test("setVersionLock - version constraint", async (assert) => {
  const storage = await assert.mockRequire("../index", {
    mongodb: {
      MongoClient: MockMongoClient,
    },
  });
  
  const adapter = storage.build(
    { entityName: "foo" },
    { uri: "mongodb://localhost", database: "test" }
  );

  await adapter.setVersionLock({
    version: 5,
    lastCommitId: "commit123",
  });

  // Try to set with lower version
  await adapter.setVersionLock({
    version: 3,
    lastCommitId: "commit456",
  });

  const result = await adapter.getVersionLock();
  assert.equal(result?.version, 5, "doesn't update with lower version");
  assert.equal(result?.lastCommitId, "commit123", "commit ID unchanged");
});

test("getVersionLock", async (assert) => {
  const storage = await assert.mockRequire("../index", {
    mongodb: {
      MongoClient: MockMongoClient,
    },
  });
  
  const adapter = storage.build(
    { entityName: "foo" },
    { uri: "mongodb://localhost", database: "test" }
  );

  await adapter.setVersionLock({
    version: 0,
    lastCommitId: "123",
  });

  const result = await adapter.getVersionLock();
  const expected = {
    version: 0,
    lastCommitId: "123",
  };

  assert.same(result, expected, "returns existing versionLock from store");
});

test("batchGet", async (assert) => {
  const storage = await assert.mockRequire("../index", {
    mongodb: {
      MongoClient: MockMongoClient,
    },
  });
  
  const adapter = storage.build(
    { entityName: "foo" },
    { uri: "mongodb://localhost", database: "test" }
  );

  await adapter.set({
    id: "123",
    version: 0,
    state: { foo: "bar" },
  });

  await adapter.set({
    id: "456",
    version: 1,
    state: { bar: "baz" },
  });

  await adapter.set({
    id: "789",
    version: 2,
    state: { baz: "qux" },
  });

  const result = await adapter.batchGet(["123", "789", "999"]);
  
  // Sort by id to ensure consistent ordering
  result.sort((a: any, b: any) => a.id.localeCompare(b.id));

  const expected = [
    {
      id: "123",
      version: 0,
      state: { foo: "bar" },
    },
    {
      id: "789",
      version: 2,
      state: { baz: "qux" },
    },
  ];

  assert.same(result, expected, "returns existing projections from store");
});

test("batchWrite", async (assert) => {
  const storage = await assert.mockRequire("../index", {
    mongodb: {
      MongoClient: MockMongoClient,
    },
  });
  
  const adapter = storage.build(
    { entityName: "foo" },
    { uri: "mongodb://localhost", database: "test" }
  );

  await adapter.batchWrite({
    "123": {
      version: 0,
      state: { foo: "bar" },
    },
    "789": {
      version: 3,
      state: { baz: "qux" },
    },
  });

  const result1 = await adapter.get("123");
  const result2 = await adapter.get("789");

  assert.same(result1, { id: "123", version: 0, state: { foo: "bar" } }, "writes first projection");
  assert.same(result2, { id: "789", version: 3, state: { baz: "qux" } }, "writes second projection");
});

test("search - filter", async (assert) => {
  const storage = await assert.mockRequire("../index", {
    mongodb: {
      MongoClient: MockMongoClient,
    },
  });
  
  const adapter = storage.build(
    { entityName: "foo" },
    { uri: "mongodb://localhost", database: "test" }
  );

  await adapter.set({
    id: "123",
    version: 0,
    state: { foo: "bar", baz: "qux" },
  });

  await adapter.set({
    id: "456",
    version: 1,
    state: { foo: "bar", baz: "other" },
  });

  await adapter.set({
    id: "789",
    version: 2,
    state: { foo: "different", baz: "qux" },
  });

  const result = await adapter.search({
    filter: { foo: "bar" },
  });

  // Sort by id for consistent comparison
  result.data.sort((a: any, b: any) => a.id.localeCompare(b.id));

  assert.equal(result.total, 2, "returns correct total");
  assert.equal(result.data.length, 2, "returns filtered results");
  assert.same(result.data[0].id, "123", "includes first matching record");
  assert.same(result.data[1].id, "456", "includes second matching record");
});

test("search - nested filter", async (assert) => {
  const storage = await assert.mockRequire("../index", {
    mongodb: {
      MongoClient: MockMongoClient,
    },
  });
  
  const adapter = storage.build(
    { entityName: "foo" },
    { uri: "mongodb://localhost", database: "test" }
  );

  await adapter.set({
    id: "123",
    version: 0,
    state: { user: { name: "Alice", age: 30 } },
  });

  await adapter.set({
    id: "456",
    version: 1,
    state: { user: { name: "Bob", age: 25 } },
  });

  const result = await adapter.search({
    filter: { user: { name: "Alice" } },
  });

  assert.equal(result.total, 1, "returns correct total for nested filter");
  assert.equal(result.data[0].id, "123", "returns matching nested record");
});

test("search - pagination", async (assert) => {
  const storage = await assert.mockRequire("../index", {
    mongodb: {
      MongoClient: MockMongoClient,
    },
  });
  
  const adapter = storage.build(
    { entityName: "foo" },
    { uri: "mongodb://localhost", database: "test" }
  );

  for (let i = 1; i <= 10; i++) {
    await adapter.set({
      id: `${i}`,
      version: i,
      state: { value: i },
    });
  }

  const result = await adapter.search({
    filter: {},
    pagination: {
      page: 2,
      perPage: 3,
    },
  });

  assert.equal(result.total, 10, "returns total count");
  assert.equal(result.data.length, 3, "returns correct page size");
});

test("search - sorting", async (assert) => {
  const storage = await assert.mockRequire("../index", {
    mongodb: {
      MongoClient: MockMongoClient,
    },
  });
  
  const adapter = storage.build(
    { entityName: "foo" },
    { uri: "mongodb://localhost", database: "test" }
  );

  await adapter.set({
    id: "123",
    version: 0,
    state: { value: 3 },
  });

  await adapter.set({
    id: "456",
    version: 1,
    state: { value: 1 },
  });

  await adapter.set({
    id: "789",
    version: 2,
    state: { value: 2 },
  });

  const resultAsc = await adapter.search({
    filter: {},
    sort: {
      field: "value",
      order: "ASC",
    },
  });

  assert.equal(resultAsc.data[0].state.value, 1, "sorts ascending");
  assert.equal(resultAsc.data[2].state.value, 3, "sorts ascending - last");

  const resultDesc = await adapter.search({
    filter: {},
    sort: {
      field: "value",
      order: "DESC",
    },
  });

  assert.equal(resultDesc.data[0].state.value, 3, "sorts descending");
  assert.equal(resultDesc.data[2].state.value, 1, "sorts descending - last");
});

test("search - sort by id", async (assert) => {
  const storage = await assert.mockRequire("../index", {
    mongodb: {
      MongoClient: MockMongoClient,
    },
  });
  
  const adapter = storage.build(
    { entityName: "foo" },
    { uri: "mongodb://localhost", database: "test" }
  );

  await adapter.set({
    id: "c",
    version: 0,
    state: { value: 1 },
  });

  await adapter.set({
    id: "a",
    version: 1,
    state: { value: 2 },
  });

  await adapter.set({
    id: "b",
    version: 2,
    state: { value: 3 },
  });

  const result = await adapter.search({
    filter: {},
    sort: {
      field: "id",
      order: "ASC",
    },
  });

  assert.equal(result.data[0].id, "a", "sorts by id when specified");
  assert.equal(result.data[1].id, "b", "sorts by id - middle");
  assert.equal(result.data[2].id, "c", "sorts by id - last");
});

test("search - rawSearch not supported", async (assert) => {
  const storage = await assert.mockRequire("../index", {
    mongodb: {
      MongoClient: MockMongoClient,
    },
  });
  
  const adapter = storage.build(
    { entityName: "foo" },
    { uri: "mongodb://localhost", database: "test" }
  );

  await assert.rejects(
    () => adapter.search({ rawSearch: (_x: any) => true }),
    /rawSearchNotSupported/,
    "throws error for rawSearch"
  );
});

test("search - rawQuery", async (assert) => {
  const storage = await assert.mockRequire("../index", {
    mongodb: {
      MongoClient: MockMongoClient,
    },
  });
  
  const adapter = storage.build(
    { entityName: "foo" },
    { uri: "mongodb://localhost", database: "test" }
  );

  await adapter.set({
    id: "123",
    version: 0,
    state: { foo: "bar" },
  });

  const result = await adapter.search({
    rawQuery: { "_state.foo": "bar" },
  });

  assert.equal(result.total, 1, "rawQuery returns results");
  assert.equal(result.data[0].id, "123", "rawQuery filters correctly");
});

test("reset", async (assert) => {
  const storage = await assert.mockRequire("../index", {
    mongodb: {
      MongoClient: MockMongoClient,
    },
  });
  
  const adapter = storage.build(
    { entityName: "foo" },
    { uri: "mongodb://localhost", database: "test" }
  );

  await adapter.set({
    id: "123",
    version: 0,
    state: { foo: "bar" },
  });

  await adapter.setVersionLock({
    version: 5,
    lastCommitId: "commit123",
  });

  await adapter.reset();

  const result = await adapter.get("123");
  const versionLock = await adapter.getVersionLock();

  assert.equal(result, undefined, "clears projections after reset");
  assert.equal(versionLock, undefined, "clears version lock after reset");
});

test("topologyClosed - evicts client and next operation builds a fresh one", async (assert) => {
  const instances: MockMongoClient[] = [];
  class TrackingMockClient extends MockMongoClient {
    constructor(..._args: any[]) {
      super();
      instances.push(this);
    }
  }

  const storage = await assert.mockRequire("../index", {
    mongodb: {
      MongoClient: TrackingMockClient,
    },
  });

  const adapter = storage.build(
    { entityName: "foo" },
    { uri: "mongodb://localhost", database: "test" }
  );

  await adapter.set({ id: "123", version: 1, state: { foo: "bar" } });
  await adapter.set({ id: "456", version: 1, state: { foo: "baz" } });
  assert.equal(instances.length, 1, "healthy client is reused across operations");

  instances[0].emit("topologyClosed");

  await adapter.set({ id: "789", version: 1, state: { foo: "qux" } });
  assert.equal(instances.length, 2, "closed client is evicted and replaced on next operation");

  await adapter.get("789");
  assert.equal(instances.length, 2, "replacement client is cached and reused");
});

test("canMatchMissing", async (assert) => {
  assert.notOk(canMatchMissing({ status: "inforce" }), "plain equality cannot match absent");
  assert.notOk(
    canMatchMissing({ status: { $in: ["inforce", "new"] } }),
    "$in cannot match absent"
  );
  assert.notOk(
    canMatchMissing({ userId: { id: "a", source: "b" } }),
    "nested equality cannot match absent"
  );
  assert.ok(canMatchMissing({ status: { $ne: "canceled" } }), "$ne matches absent");
  assert.ok(canMatchMissing({ status: { $nin: ["canceled"] } }), "$nin matches absent");
  assert.ok(canMatchMissing({ status: null }), "null equality matches absent");
  assert.ok(
    canMatchMissing({ terms: { period: { $ne: null } } }),
    "detects operators nested below the top level"
  );
});

// A search issues countDocuments and then find, and the mock routes both
// through find(), so capturedFilters is [countFilter, findFilter].
const searchAdapter = async (assert: any) => {
  const storage = await assert.mockRequire("../index", {
    mongodb: { MongoClient: MockMongoClient },
  });
  return storage.build(
    { entityName: "foo" },
    { uri: "mongodb://localhost", database: "test" }
  );
};

test("search - count drops the _state guard, find keeps it", async (assert) => {
  const adapter = await searchAdapter(assert);

  capturedFilters.length = 0;
  await adapter.search({ filter: { foo: "bar" } });
  const [countFilter, findFilter] = capturedFilters;

  // Bare filter lets DocumentDB answer the count from the index alone
  // (IXONLYSCAN) instead of fetching a document per index entry.
  assert.same(countFilter, { "_state.foo": "bar" }, "count filter has no guard");

  // Redundant for correctness, but it keeps the planner on the _id_ index
  // rather than scanning every match and blocking-sorting to satisfy the sort.
  assert.same(
    findFilter,
    { $and: [{ "_state.foo": "bar" }, { _state: { $exists: true } }] },
    "find filter keeps the guard"
  );
});

test("search - both keep the guard when the filter could match a tombstone", async (assert) => {
  const adapter = await searchAdapter(assert);

  capturedFilters.length = 0;
  await adapter.search({ filter: { foo: { $ne: "bar" } } });
  const [countFilter, findFilter] = capturedFilters;

  const expected = {
    $and: [{ "_state.foo": { $ne: "bar" } }, { _state: { $exists: true } }],
  };
  assert.same(countFilter, expected, "$ne keeps the guard on the count");
  assert.same(findFilter, expected, "and on the find");
});

test("search - both keep the guard when there is no filter", async (assert) => {
  const adapter = await searchAdapter(assert);

  capturedFilters.length = 0;
  await adapter.search({});
  const [countFilter, findFilter] = capturedFilters;

  assert.same(countFilter, { _state: { $exists: true } }, "unfiltered count excludes tombstones");
  assert.same(findFilter, { _state: { $exists: true } }, "unfiltered find excludes tombstones");
});
