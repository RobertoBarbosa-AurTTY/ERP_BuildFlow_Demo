const { test } = require("node:test");
const assert = require("node:assert");
const stock = require("../../src/lib/stock");
const { ObjectId } = require("mongodb");

const PID1 = new ObjectId();
const PID2 = new ObjectId();
const pid1 = PID1.toHexString();
const pid2 = PID2.toHexString();

function makeCol(initial) {
  const docs = new Map();
  for (const [id, doc] of Object.entries(initial)) {
    docs.set(id, { ...doc });
  }
  return {
    async updateOne(filter, update) {
      const id = filter._id instanceof ObjectId ? filter._id.toHexString() : String(filter._id);
      const doc = docs.get(id);
      if (!doc) return { modifiedCount: 0 };
      if (filter.quantity !== undefined) {
        const need =
          typeof filter.quantity === "object" && filter.quantity.$gte !== undefined
            ? filter.quantity.$gte
            : filter.quantity;
        if ((doc.quantity || 0) < need) return { modifiedCount: 0 };
      }
      if (filter.$expr) {
        const q = doc.quantity || 0;
        const r = doc.reserved || 0;
        const need = filter.$expr.$gte[1];
        if (q - r < need) return { modifiedCount: 0 };
      }
      const inc = update.$inc || {};
      if (inc.quantity !== undefined) doc.quantity = (doc.quantity || 0) + inc.quantity;
      if (inc.reserved !== undefined) doc.reserved = (doc.reserved || 0) + inc.reserved;
      return { modifiedCount: 1 };
    },
    async bulkWrite(ops) {
      for (const op of ops) {
        await this.updateOne(op.updateOne.filter, op.updateOne.update);
      }
    },
    get(id) {
      return { ...docs.get(id) };
    },
  };
}

test("deductStock baixa estoque e bloqueia saldo negativo", async () => {
  const col = makeCol({ [pid1]: { quantity: 5 } });
  const r1 = await stock.deductStock(col, [{ id: pid1, qty: 3 }]);
  assert.strictEqual(r1.ok, true);
  assert.strictEqual(col.get(pid1).quantity, 2);

  const r2 = await stock.deductStock(col, [{ id: pid1, qty: 3 }]);
  assert.strictEqual(r2.ok, false);
  assert.strictEqual(col.get(pid1).quantity, 2, "saldo não pode ficar negativo");
});

test("deductStock faz rollback parcial em falha", async () => {
  const col = makeCol({ [pid1]: { quantity: 2 }, [pid2]: { quantity: 1 } });
  const r = await stock.deductStock(col, [
    { id: pid1, qty: 1 },
    { id: pid2, qty: 5 }, // falha
  ]);
  assert.strictEqual(r.ok, false);
  assert.strictEqual(col.get(pid1).quantity, 2, "primeiro item revertido");
});

test("reserveStock respeita o saldo livre (quantity - reserved)", async () => {
  const col = makeCol({ [pid1]: { quantity: 5, reserved: 3 } });
  const r1 = await stock.reserveStock(col, [{ id: pid1, qty: 2 }]);
  assert.strictEqual(r1.ok, true);
  assert.strictEqual(col.get(pid1).reserved, 5);

  const r2 = await stock.reserveStock(col, [{ id: pid1, qty: 1 }]);
  assert.strictEqual(r2.ok, false);
  assert.strictEqual(col.get(pid1).reserved, 5, "reserva bloqueada sem saldo livre");
});

test("restoreStock e releaseReserved repõem estoque", async () => {
  const col = makeCol({ [pid1]: { quantity: 3, reserved: 2 } });
  await stock.restoreStock(col, [{ id: pid1, qty: 4 }]);
  assert.strictEqual(col.get(pid1).quantity, 7);
  await stock.releaseReserved(col, [{ id: pid1, qty: 2 }]);
  assert.strictEqual(col.get(pid1).reserved, 0);
});

test("finalizeReserved deduz e libera reserva", async () => {
  const col = makeCol({ [pid1]: { quantity: 10, reserved: 2 } });
  const r = await stock.finalizeReserved(col, [{ id: pid1, qty: 2 }]);
  assert.strictEqual(r.ok, true);
  const doc = col.get(pid1);
  assert.strictEqual(doc.quantity, 8);
  assert.strictEqual(doc.reserved, 0);
});

test("finalizeReserved falha sem estoque físico", async () => {
  const col = makeCol({ [pid1]: { quantity: 1, reserved: 1 } });
  const r = await stock.finalizeReserved(col, [{ id: pid1, qty: 2 }]);
  assert.strictEqual(r.ok, false);
  const doc = col.get(pid1);
  assert.strictEqual(doc.quantity, 1, "não deduz em falha");
  assert.strictEqual(doc.reserved, 1, "não libera reserva em falha");
});

test("applyStock/revertStock por modo", async () => {
  const col = makeCol({ [pid1]: { quantity: 5 } });
  const a = await stock.applyStock(col, [{ id: pid1, qty: 2 }], "FINALIZED");
  assert.strictEqual(a.ok, true);
  assert.strictEqual(col.get(pid1).quantity, 3);
  await stock.revertStock(col, a.applied, "FINALIZED");
  assert.strictEqual(col.get(pid1).quantity, 5);

  const b = await stock.applyStock(col, [{ id: pid1, qty: 2 }], "RESERVED");
  assert.strictEqual(b.ok, true);
  assert.strictEqual(col.get(pid1).reserved, 2);
  await stock.revertStock(col, b.applied, "RESERVED");
  assert.strictEqual(col.get(pid1).reserved, 0);
});

test("contadores são atômicos e sequenciais", async () => {
  const fakeDb = {
    seqs: {},
    collection(name) {
      return {
        findOneAndUpdate: async (filter, update) => {
          const key = String(filter._id);
          const val = { _id: key, seq: (this.seqs[key] || 0) + 1 };
          this.seqs[key] = val.seq;
          return { value: val };
        },
      };
    },
  };
  const mongodbPath = require.resolve("../../src/lib/mongodb");
  require.cache[mongodbPath] = {
    id: mongodbPath,
    filename: mongodbPath,
    loaded: true,
    exports: { getDb: async () => fakeDb },
  };
  const { nextSequence } = require("../../src/lib/counters");
  const a = await nextSequence("saleNumber");
  const b = await nextSequence("saleNumber");
  assert.strictEqual(a, 1);
  assert.strictEqual(b, 2);
});
