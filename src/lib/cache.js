// Cache serverless simples via MongoDB com TTL (coleção `caches`).
// Evita recálculo pesado (dashboard, relatórios) em cada request.
const { getDb } = require("./mongodb");

let indexEnsured = false;

async function ensureIndex(db) {
  if (indexEnsured) return;
  await db
    .collection("caches")
    .createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 })
    .catch(() => {});
  indexEnsured = true;
}

async function getCached(key) {
  const db = await getDb();
  await ensureIndex(db);
  const doc = await db.collection("caches").findOne({ key });
  if (!doc) return null;
  if (doc.expiresAt && new Date(doc.expiresAt) < new Date()) {
    await db.collection("caches").deleteOne({ key }).catch(() => {});
    return null;
  }
  return doc.value;
}

async function setCached(key, value, ttlMs) {
  const db = await getDb();
  await ensureIndex(db);
  await db.collection("caches").updateOne(
    { key },
    { $set: { key, value, expiresAt: new Date(Date.now() + ttlMs), updatedAt: new Date() } },
    { upsert: true },
  );
}

// Conveniência: retorna o valor em cache ou executa `fn` e armazena.
async function cached(key, ttlMs, fn) {
  const hit = await getCached(key);
  if (hit !== null && hit !== undefined) return hit;
  const value = await fn();
  await setCached(key, value, ttlMs);
  return value;
}

module.exports = { getCached, setCached, cached };
