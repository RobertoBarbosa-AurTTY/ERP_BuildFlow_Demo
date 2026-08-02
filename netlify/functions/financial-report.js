// Fluxo de caixa projetado + DRE do período.
// Entradas/saídas realizadas (vendas, contas pagas/recebidas) e previstas
// (contas a pagar/receber em aberto), com DRE calculado por agregação.
const { getDb } = require("../../src/lib/mongodb");
const { withAuth, badRequest } = require("../../src/lib/helpers");
const { cached } = require("../../src/lib/cache");

const PROJECTION_DAYS = 30;

function tzOffsetToTimezone(tzOffset) {
  const total = parseInt(tzOffset, 10) || 0;
  const sign = total >= 0 ? "+" : "-";
  const abs = Math.abs(total);
  const hh = String(Math.floor(abs / 60)).padStart(2, "0");
  const mm = String(abs % 60).padStart(2, "0");
  return `${sign}${hh}:${mm}`;
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function dayKey(date, tzOffset) {
  const local = new Date(date.getTime() + (parseInt(tzOffset, 10) || 0) * 60000);
  return local.toISOString().slice(0, 10);
}

exports.handler = withAuth(async (event) => {
  const db = await getDb();
  const params = event.queryStringParameters || {};
  const period = params.period || "month";
  const tzOffset = parseInt(params.tzOffset, 10) || 0;
  const tz = tzOffsetToTimezone(tzOffset);
  const selectedDate = params.date;

  // Mesma lógica de fuso do dashboard.js
  const now = new Date();
  const localEpoch = now.getTime() - tzOffset * 60000;
  const localDate = new Date(localEpoch);
  const localMidnightEpoch = Date.UTC(localDate.getUTCFullYear(), localDate.getUTCMonth(), localDate.getUTCDate());
  const todayStart = new Date(localMidnightEpoch + tzOffset * 60000);

  let rangeStart, rangeEnd;
  if (period === "day") {
    let dayStart;
    if (selectedDate) {
      const [y, m, d] = selectedDate.split("-").map(Number);
      dayStart = new Date(Date.UTC(y, m - 1, d) + tzOffset * 60000);
    } else {
      dayStart = new Date(todayStart);
    }
    rangeStart = dayStart;
    rangeEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
  } else if (period === "week") {
    rangeStart = new Date(todayStart.getTime() - 6 * 24 * 60 * 60 * 1000);
    rangeEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
  } else {
    const monthStart = (y, m) => Date.UTC(y, m, 1) + tzOffset * 60000;
    rangeStart = new Date(monthStart(todayStart.getFullYear(), todayStart.getMonth()));
    rangeEnd = new Date(monthStart(todayStart.getFullYear(), todayStart.getMonth() + 1));
  }

  const projStart = new Date(todayStart);
  const projEnd = addDays(projStart, PROJECTION_DAYS);
  const todayKey = dayKey(todayStart, tzOffset);

  const cacheKey = `fr:${period}:${selectedDate || ""}:${tzOffset}`;

  const report = await cached(cacheKey, 60 * 1000, async () => {
    const sales = db.collection("sales");
    const payables = db.collection("accounts_payable");
    const receivables = db.collection("accounts_receivable");

    const [salesData, paidData, receivedData, openPayables, openReceivables] = await Promise.all([
      // Vendas finalizadas no período (para DRE + realizado por dia)
      sales.aggregate([
        { $match: { status: "FINALIZED", createdAt: { $gte: rangeStart, $lt: rangeEnd } } },
        {
          $project: {
            total: 1,
            totalDiscount: 1,
            day: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt", timezone: tz } },
            cost: {
              $sum: {
                $map: {
                  input: { $ifNull: ["$items", []] },
                  as: "i",
                  in: { $multiply: [{ $ifNull: ["$$i.costPrice", 0] }, { $ifNull: ["$$i.qty", 0] }] },
                },
              },
            },
          },
        },
        {
          $group: {
            _id: "$day",
            receita: { $sum: { $ifNull: ["$total", 0] } },
            descontos: { $sum: { $ifNull: ["$totalDiscount", 0] } },
            cmv: { $sum: { $ifNull: ["$cost", 0] } },
          },
        },
      ]).toArray(),

      // Contas pagas no período (saída realizada)
      db.collection("accounts_payable")
        .aggregate([
          { $match: { status: "paid", paidDate: { $gte: rangeStart, $lt: rangeEnd } } },
          {
            $group: {
              _id: { $dateToString: { format: "%Y-%m-%d", date: "$paidDate", timezone: tz } },
              total: { $sum: { $ifNull: ["$amount", 0] } },
            },
          },
        ])
        .toArray(),

      // Recebimentos recebidos no período (entrada realizada)
      db.collection("accounts_receivable")
        .aggregate([
          { $match: { status: "received", receivedDate: { $gte: rangeStart, $lt: rangeEnd } } },
          {
            $group: {
              _id: { $dateToString: { format: "%Y-%m-%d", date: "$receivedDate", timezone: tz } },
              total: { $sum: { $ifNull: ["$amount", 0] } },
            },
          },
        ])
        .toArray(),

      // Contas a pagar em aberto nos próximos 30 dias (saída prevista)
      db.collection("accounts_payable")
        .find(
          {
            status: { $nin: ["paid", "cancelled"] },
            paidDate: { $in: [null, undefined] },
            dueDate: { $gte: projStart, $lt: projEnd },
          },
          { projection: { amount: 1, dueDate: 1 } },
        )
        .toArray(),

      // Contas a receber em aberto nos próximos 30 dias (entrada prevista)
      db.collection("accounts_receivable")
        .find(
          {
            status: { $nin: ["received", "cancelled"] },
            receivedDate: { $in: [null, undefined] },
            dueDate: { $gte: projStart, $lt: projEnd },
          },
          { projection: { amount: 1, dueDate: 1 } },
        )
        .toArray(),
    ]);

    // Realizado por dia
    const byDay = {};
    for (const row of salesData) {
      byDay[row._id] = byDay[row._id] || { entradaRealizada: 0, saidaRealizada: 0 };
      byDay[row._id].entradaRealizada += row.receita;
    }
    for (const row of paidData) {
      byDay[row._id] = byDay[row._id] || { entradaRealizada: 0, saidaRealizada: 0 };
      byDay[row._id].saidaRealizada += row.total;
    }
    for (const row of receivedData) {
      byDay[row._id] = byDay[row._id] || { entradaRealizada: 0, saidaRealizada: 0 };
      byDay[row._id].entradaRealizada += row.total;
    }

    // Projeção por dia
    for (const bill of openPayables) {
      const k = dayKey(new Date(bill.dueDate), tzOffset);
      byDay[k] = byDay[k] || { entradaRealizada: 0, saidaRealizada: 0 };
      byDay[k].saidaPrevista = (byDay[k].saidaPrevista || 0) + (Number(bill.amount) || 0);
    }
    for (const bill of openReceivables) {
      const k = dayKey(new Date(bill.dueDate), tzOffset);
      byDay[k] = byDay[k] || { entradaRealizada: 0, saidaRealizada: 0 };
      byDay[k].entradaPrevista = (byDay[k].entradaPrevista || 0) + (Number(bill.amount) || 0);
    }

    // Série de 30 dias com saldo acumulado
    let saldoAcumulado = 0;
    const cashFlow = [];
    for (let i = 0; i < PROJECTION_DAYS; i++) {
      const day = addDays(projStart, i);
      const k = dayKey(day, tzOffset);
      const row = byDay[k] || {};
      const entradaRealizada = Math.round((row.entradaRealizada || 0) * 100) / 100;
      const saidaRealizada = Math.round((row.saidaRealizada || 0) * 100) / 100;
      const entradaPrevista = Math.round((row.entradaPrevista || 0) * 100) / 100;
      const saidaPrevista = Math.round((row.saidaPrevista || 0) * 100) / 100;
      const saldoDia = Math.round((entradaRealizada + entradaPrevista - saidaRealizada - saidaPrevista) * 100) / 100;
      saldoAcumulado = Math.round((saldoAcumulado + saldoDia) * 100) / 100;
      cashFlow.push({
        date: day.toISOString(),
        dia: k,
        entradaRealizada,
        saidaRealizada,
        entradaPrevista,
        saidaPrevista,
        saldoDia,
        saldoAcumulado,
        isToday: k === todayKey,
      });
    }

    // DRE do período
    const receitaBruta = salesData.reduce((s, r) => s + r.receita, 0);
    const deducoes = salesData.reduce((s, r) => s + r.descontos, 0);
    const cmv = salesData.reduce((s, r) => s + r.cmv, 0);
    const despesasPagas = paidData.reduce((s, r) => s + r.total, 0);
    const outrosRecebimentos = receivedData.reduce((s, r) => s + r.total, 0);

    const dre = {
      receitaBruta: Math.round(receitaBruta * 100) / 100,
      deducoes: Math.round(deducoes * 100) / 100,
      receitaLiquida: Math.round((receitaBruta - deducoes) * 100) / 100,
      cmv: Math.round(cmv * 100) / 100,
      lucroBruto: Math.round((receitaBruta - deducoes - cmv) * 100) / 100,
      despesasPagas: Math.round(despesasPagas * 100) / 100,
      outrosRecebimentos: Math.round(outrosRecebimentos * 100) / 100,
      resultadoOperacional: Math.round((receitaBruta - deducoes - cmv - despesasPagas + outrosRecebimentos) * 100) / 100,
    };

    return {
      period,
      startDate: rangeStart.toISOString(),
      endDate: rangeEnd.toISOString(),
      cashFlow,
      dre,
    };
  });

  return report;
});
