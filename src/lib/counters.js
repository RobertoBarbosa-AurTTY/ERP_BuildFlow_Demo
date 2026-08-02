// Sequenciadores atômicos (coleção counters) — funcionam em qualquer tier
// do Atlas (inclusive shared M0/M2/M5, sem transações).
const { getDb } = require("./mongodb");

// Incrementa a sequência de forma atômica e retorna o próximo valor.
async function nextSequence(name) {
  const db = await getDb();
  const res = await db.collection("counters").findOneAndUpdate(
    { _id: name },
    { $inc: { seq: 1 } },
    { upsert: true, returnDocument: "after" },
  );
  const doc = res && res.value !== undefined ? res.value : res;
  return doc && typeof doc.seq === "number" ? doc.seq : 1;
}

module.exports = { nextSequence };
