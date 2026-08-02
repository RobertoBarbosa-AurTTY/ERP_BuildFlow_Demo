// cache.js (TTL no Mongo) com coleção fake em memória.
const { test } = require("node:test");
const assert = require("node:assert");

const mongodbPath = require.resolve("../../src/lib/mongodb");

const fakeDocs = new Map();

const fakeCol = {
  async createIndex() {},
  async findOne(filter) {
    return fakeDocs.get(filter.key) || null;
  },
  async deleteOne(filter) {
    fakeDocs.delete(filter.key);
    return { deletedCount: 1 };
  },
  async updateOne(filter, update, opts) {
    const now = new Date();
    fakeDocs.set(filter.key, {
      key: filter.key,
      value: update.$set.value,
      expiresAt: update.$set.expiresAt,
      updatedAt: now,
    });
    return { upsertedCount: 1 };
  },
};

const fakeDb = { collection: (name) => (name === "caches" ? fakeCol : null) };
require.cache[mongodbPath] = {
  id: mongodbPath,
  filename: mongodbPath,
  loaded: true,
  exports: { getDb: async () => fakeDb },
};

const cache = require("../../src/lib/cache");

test("cached: chama factory na primeira vez e usa cache depois", async () => {
  let calls = 0;
  const v1 = await cache.cached("k1", 60000, async () => {
    calls++;
    return { n: 1 };
  });
  assert.deepStrictEqual(v1, { n: 1 });
  assert.strictEqual(calls, 1);

  const v2 = await cache.cached("k1", 60000, async () => {
    calls++;
    return { n: 2 };
  });
  assert.deepStrictEqual(v2, { n: 1 }, "deve vir do cache");
  assert.strictEqual(calls, 1);
});

test("cached: TTL expirado reexecuta factory", async () => {
  let calls = 0;
  await cache.cached("k2", -1000, async () => {
    calls++;
    return { v: "a" };
  });
  assert.strictEqual(calls, 1);

  const v = await cache.cached("k2", -1000, async () => {
    calls++;
    return { v: "b" };
  });
  assert.strictEqual(v.v, "b", "deve regenerar após expirar");
  assert.strictEqual(calls, 2);
});

test("cached: null no cache trata como miss", async () => {
  fakeDocs.delete("k3");
  let calls = 0;
  const v = await cache.cached("k3", 60000, async () => {
    calls++;
    return { ok: true };
  });
  assert.strictEqual(calls, 1);
  assert.deepStrictEqual(v, { ok: true });
});
