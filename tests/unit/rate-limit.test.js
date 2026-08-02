const { test } = require("node:test");
const assert = require("node:assert");

// Stub do módulo mongodb para isolar o rate-limit
const mongodbPath = require.resolve("../../src/lib/mongodb");
const fakeDb = { collection: () => fakeCol };
const fakeCol = {
  counts: {},
  async createIndex() {},
  async deleteMany(filter) {
    return { deletedCount: 0 };
  },
  async findOneAndUpdate(filter, update, opts) {
    const key = filter.key;
    const count = (this.counts[key] || 0) + 1;
    this.counts[key] = count;
    return { value: { key, count } };
  },
};
require.cache[mongodbPath] = {
  id: mongodbPath,
  filename: mongodbPath,
  loaded: true,
  exports: { getDb: async () => fakeDb },
};

const { checkRateLimit, rateLimit, getClientIp } = require("../../src/lib/rate-limit");

test("permite até o máximo de tentativas", async () => {
  fakeCol.counts = {};
  const r1 = await checkRateLimit("test:ip", { max: 3 });
  assert.strictEqual(r1.allowed, true);
  assert.strictEqual(r1.remaining, 2);
  await checkRateLimit("test:ip", { max: 3 });
  const r3 = await checkRateLimit("test:ip", { max: 3 });
  assert.strictEqual(r3.remaining, 0);
});

test("bloqueia após exceder o máximo", async () => {
  fakeCol.counts = {};
  for (let i = 0; i < 3; i++) await checkRateLimit("test:block", { max: 3 });
  const r = await checkRateLimit("test:block", { max: 3 });
  assert.strictEqual(r.allowed, false);
  assert.ok(r.retryAfterMs > 0);
});

test("rateLimit retorna 429 quando bloqueado e null quando liberado", async () => {
  fakeCol.counts = {};
  const event = { headers: { "x-forwarded-for": "1.2.3.4" } };
  assert.strictEqual(await rateLimit(event, "login", { max: 1 }), null);
  const blocked = await rateLimit(event, "login", { max: 1 });
  assert.strictEqual(blocked.statusCode, 429);
  assert.ok(blocked.headers["Retry-After"]);
});

test("getClientIp extrai IP de x-forwarded-for", () => {
  assert.strictEqual(getClientIp({ headers: { "x-forwarded-for": "8.8.8.8, 1.1.1.1" } }), "8.8.8.8");
  assert.strictEqual(getClientIp({ headers: { "client-ip": "9.9.9.9" } }), "9.9.9.9");
  assert.strictEqual(getClientIp({ headers: {} }), "local");
});
