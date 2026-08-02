// Operações atômicas de estoque, centralizadas para uso em vendas e movimentos.
// Sem transações (tier shared), a segurança vem de updateOne com condição
// (impede saldo negativo) + rollback automático em caso de falha parcial.
const { ObjectId } = require("mongodb");

function _id(id) {
  return { _id: new ObjectId(String(id)) };
}

// Reserva: reserved += qty, apenas se houver saldo livre (quantity - reserved).
// Retorna { ok, applied } — em falha, reverte o que já foi aplicado.
async function reserveStock(col, items) {
  const applied = [];
  for (const item of items) {
    const filter = {
      ..._id(item.id),
      $expr: {
        $gte: [
          { $subtract: [{ $ifNull: ["$quantity", 0] }, { $ifNull: ["$reserved", 0] }] },
          item.qty,
        ],
      },
    };
    const upd = await col.updateOne(filter, { $inc: { reserved: item.qty } });
    if (upd.modifiedCount !== 1) {
      await releaseReserved(col, applied);
      return { ok: false, applied };
    }
    applied.push({ id: item.id, qty: item.qty });
  }
  return { ok: true, applied };
}

// Dedução: quantity -= qty, apenas se quantity >= qty. Rollback em falha.
async function deductStock(col, items) {
  const applied = [];
  for (const item of items) {
    const filter = { ..._id(item.id), quantity: { $gte: item.qty } };
    const upd = await col.updateOne(filter, { $inc: { quantity: -item.qty } });
    if (upd.modifiedCount !== 1) {
      await restoreStock(col, applied);
      return { ok: false, applied };
    }
    applied.push({ id: item.id, qty: item.qty });
  }
  return { ok: true, applied };
}

// Libera reserva: reserved -= qty (incondicional).
async function releaseReserved(col, items) {
  if (!items || !items.length) return;
  await col.bulkWrite(
    items.map((i) => ({
      updateOne: { filter: _id(i.id), update: { $inc: { reserved: -i.qty } } },
    })),
  );
}

// Repõe estoque físico: quantity += qty (incondicional).
async function restoreStock(col, items) {
  if (!items || !items.length) return;
  await col.bulkWrite(
    items.map((i) => ({
      updateOne: { filter: _id(i.id), update: { $inc: { quantity: i.qty } } },
    })),
  );
}

// Transição RESERVED -> FINALIZED: deduz o físico (com condição e rollback)
// e, só se OK, libera a reserva. Ordem segura: nunca libera reserva sem deduzir.
async function finalizeReserved(col, items) {
  const deducted = await deductStock(col, items);
  if (!deducted.ok) return deducted;
  await releaseReserved(col, items);
  return { ok: true, applied: deducted.applied };
}

// Aplica saída conforme o modo da venda.
async function applyStock(col, items, mode) {
  if (mode === "RESERVED") return reserveStock(col, items);
  return deductStock(col, items);
}

// Reverte uma aplicação conforme o modo.
async function revertStock(col, items, mode) {
  if (mode === "RESERVED") return releaseReserved(col, items);
  return restoreStock(col, items);
}

module.exports = {
  reserveStock,
  deductStock,
  releaseReserved,
  restoreStock,
  finalizeReserved,
  applyStock,
  revertStock,
};
