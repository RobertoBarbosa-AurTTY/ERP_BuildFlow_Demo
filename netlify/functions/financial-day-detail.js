// Composição por dia do Detalhamento Diário do fluxo de caixa.
// Dado um dia local (date=YYYY-MM-DD), retorna as 4 linhas com os
// registros que formam cada valor: entradas/saídas realizadas e previstas.
const { getDb } = require("../../src/lib/mongodb");
const { withAuth, badRequest } = require("../../src/lib/helpers");
const { cached } = require("../../src/lib/cache");
const { getPeriodRange } = require("../../src/lib/financial-period");

function toCount(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function billWindow(rangeStart, rangeEnd) {
  return {
    billStart: new Date(`${rangeStart.toISOString().slice(0, 10)}T00:00:00.000Z`),
    billEnd: new Date(`${rangeEnd.toISOString().slice(0, 10)}T00:00:00.000Z`),
  };
}

exports.handler = withAuth(async (event) => {
  const db = await getDb();
  const params = event.queryStringParameters || {};
  const date = params.date;
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return badRequest("Informe a data no formato YYYY-MM-DD.");
  }

  const tzOffset = parseInt(params.tzOffset, 10) || 0;
  const { rangeStart, rangeEnd } = getPeriodRange({ period: "day", tzOffset, selectedDate: date });
  const { billStart, billEnd } = billWindow(rangeStart, rangeEnd);
  const nextDay = new Date(billStart.getTime() + 24 * 60 * 60 * 1000);

  const cacheKey = `fdd:${date}:${tzOffset}`;

  return cached(cacheKey, 60 * 1000, async () => {
    const sales = db.collection("sales");
    const payables = db.collection("accounts_payable");
    const receivables = db.collection("accounts_receivable");

    const [salesDay, paidDay, receivedDay, openPayablesDay, openReceivablesDay] = await Promise.all([
      // Vendas finalizadas no dia (entrada realizada)
      sales
        .find(
          { status: "FINALIZED", createdAt: { $gte: rangeStart, $lt: rangeEnd } },
          {
            projection: {
              saleNumber: 1,
              createdAt: 1,
              total: 1,
              paymentMethod: 1,
              items: 1,
            },
          },
        )
        .sort({ createdAt: -1 })
        .toArray(),

      // Contas pagas no dia (saída realizada)
      payables
        .find(
          { status: "paid", paidDate: { $gte: billStart, $lt: billEnd } },
          { projection: { description: 1, category: 1, amount: 1, paidDate: 1, dueDate: 1 } },
        )
        .sort({ paidDate: -1 })
        .toArray(),

      // Contas recebidas no dia (entrada realizada)
      receivables
        .find(
          { status: "received", receivedDate: { $gte: billStart, $lt: billEnd } },
          { projection: { description: 1, customerName: 1, amount: 1, receivedDate: 1 } },
        )
        .sort({ receivedDate: -1 })
        .toArray(),

      // Boletos a pagar com vencimento no dia (saída prevista)
      payables
        .find(
          {
            status: { $nin: ["paid", "cancelled"] },
            paidDate: { $in: [null, undefined] },
            dueDate: { $gte: billStart, $lt: nextDay },
          },
          { projection: { description: 1, category: 1, amount: 1, dueDate: 1 } },
        )
        .sort({ amount: -1 })
        .toArray(),

      // Contas a receber com vencimento no dia (entrada prevista)
      receivables
        .find(
          {
            status: { $nin: ["received", "cancelled"] },
            receivedDate: { $in: [null, undefined] },
            dueDate: { $gte: billStart, $lt: nextDay },
          },
          { projection: { description: 1, customerName: 1, amount: 1, dueDate: 1 } },
        )
        .sort({ amount: -1 })
        .toArray(),
    ]);

    const entradaRealizada = [
      ...salesDay.map((s) => ({
        tipo: "venda",
        _id: String(s._id),
        descricao: `Venda nº ${s.saleNumber || String(s._id).slice(-8)}`,
        referencia: s.paymentMethod || "Não informado",
        data: s.createdAt,
        amount: toCount(s.total),
        qtdItens: (s.items || []).length,
      })),
      ...receivedDay.map((r) => ({
        tipo: "recebimento",
        _id: String(r._id),
        descricao: r.description || "—",
        referencia: r.customerName || "—",
        data: r.receivedDate,
        amount: toCount(r.amount),
      })),
    ].sort((a, b) => new Date(b.data) - new Date(a.data));

    const saidaRealizada = paidDay.map((b) => ({
      tipo: "pagamento",
      _id: String(b._id),
      descricao: b.description || "—",
      referencia: b.category || "—",
      data: b.paidDate,
      vencimento: b.dueDate || null,
      emAtraso: Boolean(b.dueDate && new Date(b.dueDate) < billStart),
      amount: toCount(b.amount),
    }));

    const saidaPrevista = openPayablesDay.map((b) => ({
      tipo: "boleto",
      _id: String(b._id),
      descricao: b.description || "—",
      referencia: b.category || "—",
      data: b.dueDate,
      amount: toCount(b.amount),
    }));

    const entradaPrevista = openReceivablesDay.map((r) => ({
      tipo: "a_receber",
      _id: String(r._id),
      descricao: r.description || "—",
      referencia: r.customerName || "—",
      data: r.dueDate,
      amount: toCount(r.amount),
    }));

    const sum = (items) => toCount(items.reduce((s, i) => s + i.amount, 0));

    return {
      date,
      entradaRealizada: { items: entradaRealizada, total: sum(entradaRealizada) },
      saidaRealizada: { items: saidaRealizada, total: sum(saidaRealizada) },
      entradaPrevista: { items: entradaPrevista, total: sum(entradaPrevista) },
      saidaPrevista: { items: saidaPrevista, total: sum(saidaPrevista) },
    };
  });
});