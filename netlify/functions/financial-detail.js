// Drill-down do DRE: retorna a composição de cada linha do resumo financeiro.
// Usa os mesmos filtros de período/fuso do /financial-report, com paginação.
const { getDb } = require("../../src/lib/mongodb");
const { withAuth, badRequest } = require("../../src/lib/helpers");
const { cached } = require("../../src/lib/cache");
const { getPeriodRange } = require("../../src/lib/financial-period");

// Datas de contas (paidDate/receivedDate) são gravadas como meia-noite
// UTC do dia local — a janela usa a DATA pura, sem conversão de fuso,
// igual ao /financial-report.
function billWindow(rangeStart, rangeEnd) {
  return {
    billStart: new Date(`${rangeStart.toISOString().slice(0, 10)}T00:00:00.000Z`),
    billEnd: new Date(`${rangeEnd.toISOString().slice(0, 10)}T00:00:00.000Z`),
  };
}

const ALLOWED_LINES = new Set(["receita", "liquida", "deducoes", "cmv", "despesas", "outros", "resultado"]);
const DEFAULT_LIMIT = 50;

function pagination(pageParam, limitParam) {
  const pageNum = Math.max(1, parseInt(pageParam, 10) || 1);
  const limitNum = Math.min(200, Math.max(1, parseInt(limitParam, 10) || DEFAULT_LIMIT));
  return { pageNum, limitNum, skip: (pageNum - 1) * limitNum };
}

function toCount(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

exports.handler = withAuth(async (event) => {
  const db = await getDb();
  const params = event.queryStringParameters || {};
  const line = params.line;
  if (!line || !ALLOWED_LINES.has(line)) {
    return badRequest("Linha inválida. Use receita, liquida, deducoes, cmv, despesas, outros ou resultado.");
  }

  const period = params.period || "month";
  const tzOffset = parseInt(params.tzOffset, 10) || 0;
  const selectedDate = params.date;
  const { pageNum, limitNum, skip } = pagination(params.page, params.limit);

  const { rangeStart, rangeEnd } = getPeriodRange({ period, tzOffset, selectedDate });
  const { billStart, billEnd } = billWindow(rangeStart, rangeEnd);

  const cacheKey = `fd:${line}:${period}:${selectedDate || ""}:${tzOffset}:${pageNum}:${limitNum}`;

  return cached(cacheKey, 60 * 1000, async () => {
    const sales = db.collection("sales");

    // CMV: custo das mercadorias vendidas, agrupado por produto
    if (line === "cmv") {
      const facets = await sales
        .aggregate([
          { $match: { status: "FINALIZED", createdAt: { $gte: rangeStart, $lt: rangeEnd } } },
          { $unwind: { path: "$items", preserveNullAndEmptyArrays: true } },
          { $match: { $expr: { $gt: [{ $ifNull: ["$items.qty", 0] }, 0] } } },
          {
            $group: {
              _id: "$items.id",
              produto: { $first: "$items.name" },
              sku: { $first: "$items.sku" },
              qty: { $sum: { $ifNull: ["$items.qty", 0] } },
              custo: { $sum: { $multiply: [{ $ifNull: ["$items.costPrice", 0] }, { $ifNull: ["$items.qty", 0] }] } },
            },
          },
          { $sort: { custo: -1, qty: -1 } },
          {
            $facet: {
              totals: [{ $group: { _id: null, custo: { $sum: "$custo" }, qty: { $sum: "$qty" }, count: { $sum: 1 } } }],
              rows: [{ $skip: skip }, { $limit: limitNum }],
            },
          },
        ])
        .toArray();
      const meta = (facets[0].totals[0] || { custo: 0, qty: 0, count: 0 });
      const items = (facets[0].rows || []).map((r) => ({
        id: r._id,
        produto: r.produto || "Produto",
        sku: r.sku || "",
        qty: r.qty,
        custoUnitario: toCount(r.custo / (r.qty || 1)),
        custoTotal: toCount(r.custo),
      }));
      return {
        line,
        items,
        grandTotal: toCount(meta.custo),
        totalCount: meta.count,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total: meta.count,
          totalPages: Math.ceil(meta.count / limitNum),
          hasMore: skip + items.length < meta.count,
        },
      };
    }

    // Vendas: receita (preço cheio), líquida (valor recebido), deduções (só vendas com desconto)
    if (line === "receita" || line === "liquida" || line === "deducoes") {
      const baseQuery = { status: "FINALIZED", createdAt: { $gte: rangeStart, $lt: rangeEnd } };
      if (line === "deducoes") baseQuery.totalDiscount = { $gt: 0 };

      const [totals, rows] = await Promise.all([
        sales
          .aggregate([
            { $match: baseQuery },
            { $group: { _id: null, total: { $sum: { $ifNull: ["$total", 0] } }, desconto: { $sum: { $ifNull: ["$totalDiscount", 0] } }, count: { $sum: 1 } } },
          ])
          .toArray(),
        sales
          .find(baseQuery, {
            projection: {
              saleNumber: 1,
              createdAt: 1,
              total: 1,
              grossSubtotal: 1,
              totalDiscount: 1,
              itemsDiscountTotal: 1,
              globalDiscount: 1,
              globalDiscountType: 1,
              globalDiscountAmount: 1,
              items: 1,
              paymentMethod: 1,
            },
          })
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limitNum)
          .toArray(),
      ]);

      const totalRow = totals[0] || { total: 0, desconto: 0, count: 0 };
      const grandValue =
        line === "deducoes" ? totalRow.desconto : line === "liquida" ? totalRow.total : totalRow.total + totalRow.desconto;

      const items = rows.map((s) => ({
        _id: String(s._id),
        saleNumber: s.saleNumber || String(s._id).slice(-8),
        createdAt: s.createdAt,
        paymentMethod: s.paymentMethod || "Não informado",
        total: toCount(s.total),
        grossSubtotal: s.grossSubtotal != null ? toCount(s.grossSubtotal) : null,
        totalDiscount: toCount(s.totalDiscount),
        itemsDiscountTotal: toCount(s.itemsDiscountTotal),
        globalDiscount: s.globalDiscount || 0,
        globalDiscountType: s.globalDiscountType || "percent",
        globalDiscountAmount: toCount(s.globalDiscountAmount),
        qtdItens: (s.items || []).length,
        items: s.items || [],
      }));

      return {
        line,
        items,
        grandTotal: toCount(grandValue),
        totalCount: totalRow.count,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total: totalRow.count,
          totalPages: Math.ceil(totalRow.count / limitNum),
          hasMore: skip + items.length < totalRow.count,
        },
      };
    }

    // Despesas pagas (contas a pagar) / Outros recebimentos (contas a receber)
    if (line === "despesas" || line === "outros") {
      const isPay = line === "despesas";
      const collection = isPay ? db.collection("accounts_payable") : db.collection("accounts_receivable");
      const dateField = isPay ? "paidDate" : "receivedDate";
      const query = { status: isPay ? "paid" : "received", [dateField]: { $gte: billStart, $lt: billEnd } };

      const [totals, rows] = await Promise.all([
        collection.aggregate([{ $match: query }, { $group: { _id: null, total: { $sum: { $ifNull: ["$amount", 0] } } } }]).toArray(),
        collection
          .find(query, { projection: { description: 1, category: 1, amount: 1, dueDate: 1, [dateField]: 1 } })
          .sort({ [dateField]: -1 })
          .skip(skip)
          .limit(limitNum)
          .toArray(),
      ]);

      const totalCount = await collection.countDocuments(query);
      const grandValue = totals[0]?.total || 0;
      const items = rows.map((b) => ({
        _id: String(b._id),
        description: b.description || "—",
        category: b.category || "outros",
        amount: toCount(b.amount),
        dueDate: b.dueDate || null,
        dateField,
        dateValue: b[dateField] || null,
      }));

      return {
        line,
        items,
        grandTotal: toCount(grandValue),
        totalCount,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total: totalCount,
          totalPages: Math.ceil(totalCount / limitNum),
          hasMore: pageNum * limitNum < totalCount,
        },
      };
    }

    return { line, items: [], grandTotal: 0, totalCount: 0 };
  });
});