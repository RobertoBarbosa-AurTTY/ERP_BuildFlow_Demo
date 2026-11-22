// Fluxo de caixa realizado + projetado (legado: financial-report.js, financial-day-detail.js, js/fluxo-caixa.js).
//
// Entradas realizadas: vendas finalizadas (exceto crediário, que entra quando a parcela é recebida)
//                      + contas a receber recebidas.
// Saídas realizadas:   contas a pagar pagas.
// Previstas:           contas a receber/pagar em aberto; vencidas são alocadas em "hoje".
import { billStatus, round2 } from "@/lib/domain/calc";
import type { PaymentMethod } from "@/lib/domain/types";
import { payables, products, receivables, sales } from "@/lib/mock/collections";
import { delay } from "@/lib/mock/db";
import { addDays, computeDre, dayKey, startOfDay, type Dre } from "./analytics";

export const CASH_FLOW_DAYS = 30;

export interface CashFlowDay {
  key: string;
  label: string;
  isToday: boolean;
  isFuture: boolean;
  entradaRealizada: number;
  saidaRealizada: number;
  entradaPrevista: number;
  saidaPrevista: number;
  saldoDia: number;
  saldoAcumulado: number;
}

export interface MonthlyDre extends Dre {
  key: string;
  label: string;
  partial: boolean;
}

export interface CashFlowData {
  todayKey: string;
  days: CashFlowDay[];
  totals: {
    entradasRealizadas: number;
    saidasRealizadas: number;
    saldoRealizado: number;
    entradasPrevistas: number;
    saidasPrevistas: number;
    saldoProjetado: number;
    overdueReceivable: number;
    overduePayable: number;
    menorSaldo: { key: string; value: number } | null;
  };
  months: MonthlyDre[];
}

const isCashSale = (method: PaymentMethod) => method !== "Crediário";

interface Bucket {
  entradaRealizada: number;
  saidaRealizada: number;
  entradaPrevista: number;
  saidaPrevista: number;
}

function buckets(todayKey: string) {
  const map = new Map<string, Bucket>();
  const get = (k: string) => {
    let row = map.get(k);
    if (!row) {
      row = { entradaRealizada: 0, saidaRealizada: 0, entradaPrevista: 0, saidaPrevista: 0 };
      map.set(k, row);
    }
    return row;
  };
  for (const s of sales.all()) {
    if (s.status !== "FINALIZED" || !isCashSale(s.paymentMethod)) continue;
    get(dayKey(s.createdAt)).entradaRealizada += s.total;
  }
  for (const b of receivables.all()) {
    if (b.status === "paid" && b.receivedDate) get(dayKey(b.receivedDate)).entradaRealizada += b.amount;
    const st = billStatus(b);
    if (st === "pending" || st === "overdue") {
      const k = dayKey(b.dueDate);
      get(k < todayKey ? todayKey : k).entradaPrevista += b.amount;
    }
  }
  for (const b of payables.all()) {
    if (b.status === "paid" && b.paidDate) get(dayKey(b.paidDate)).saidaRealizada += b.amount;
    const st = billStatus(b);
    if (st === "pending" || st === "overdue") {
      const k = dayKey(b.dueDate);
      get(k < todayKey ? todayKey : k).saidaPrevista += b.amount;
    }
  }
  return map;
}

export async function getCashFlow(): Promise<CashFlowData> {
  const today = startOfDay();
  const todayKey = dayKey(today);
  const map = buckets(todayKey);
  const days: CashFlowDay[] = [];
  let acc = 0;
  for (let i = -(CASH_FLOW_DAYS - 1); i <= CASH_FLOW_DAYS; i++) {
    const date = addDays(today, i);
    const k = dayKey(date);
    const row = map.get(k) ?? { entradaRealizada: 0, saidaRealizada: 0, entradaPrevista: 0, saidaPrevista: 0 };
    const saldoDia = row.entradaRealizada + row.entradaPrevista - row.saidaRealizada - row.saidaPrevista;
    acc += saldoDia;
    days.push({
      key: k,
      label: date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
      isToday: k === todayKey,
      isFuture: k > todayKey,
      entradaRealizada: round2(row.entradaRealizada),
      saidaRealizada: round2(row.saidaRealizada),
      entradaPrevista: round2(row.entradaPrevista),
      saidaPrevista: round2(row.saidaPrevista),
      saldoDia: round2(saldoDia),
      saldoAcumulado: round2(acc),
    });
  }

  const sum = (fn: (d: CashFlowDay) => number) => round2(days.reduce((s, d) => s + fn(d), 0));
  const entradasRealizadas = sum((d) => d.entradaRealizada);
  const saidasRealizadas = sum((d) => d.saidaRealizada);
  const entradasPrevistas = sum((d) => d.entradaPrevista);
  const saidasPrevistas = sum((d) => d.saidaPrevista);
  const future = days.filter((d) => d.key >= todayKey);
  const menor = future.reduce<CashFlowDay | null>((min, d) => (!min || d.saldoAcumulado < min.saldoAcumulado ? d : min), null);

  const overdue = <T extends { status: "pending" | "paid" | "overdue" | "cancelled"; dueDate: string; amount: number }>(list: T[]) =>
    round2(list.filter((b) => billStatus(b) === "overdue").reduce((s, b) => s + b.amount, 0));

  // DRE mensal: mês atual (parcial) + 5 anteriores
  const costs = new Map(products.all().map((p) => [p._id, p.costPrice]));
  const months: MonthlyDre[] = [];
  for (let m = 5; m >= 0; m--) {
    const start = new Date(today.getFullYear(), today.getMonth() - m, 1);
    const end = m === 0 ? today : new Date(today.getFullYear(), today.getMonth() - m + 1, 0);
    const month = start.toLocaleDateString("pt-BR", { month: "short" }).replace(".", "");
    const label = `${month}/${String(start.getFullYear()).slice(2)}`;
    months.push({ key: dayKey(start).slice(0, 7), label, partial: m === 0, ...computeDre(dayKey(start), dayKey(end), costs) });
  }
  // descarta meses iniciais sem nenhum movimento
  while (months.length > 1 && months[0].receitaBruta === 0 && months[0].despesasPagas === 0 && months[0].outrosRecebimentos === 0) {
    months.shift();
  }

  return delay({
    todayKey,
    days,
    totals: {
      entradasRealizadas,
      saidasRealizadas,
      saldoRealizado: round2(entradasRealizadas - saidasRealizadas),
      entradasPrevistas,
      saidasPrevistas,
      saldoProjetado: days[days.length - 1]?.saldoAcumulado ?? 0,
      overdueReceivable: overdue(receivables.all()),
      overduePayable: overdue(payables.all()),
      menorSaldo: menor ? { key: menor.key, value: menor.saldoAcumulado } : null,
    },
    months,
  });
}

// ---------------------------------------------------------------------------
// Detalhe do dia
// ---------------------------------------------------------------------------

export interface DayEntry {
  id: string;
  kind: "sale" | "receivable" | "payable";
  realized: boolean;
  overdue: boolean;
  description: string;
  party: string;
  method?: string;
  date: string;
  amount: number;
}

export interface CashFlowDayDetail {
  key: string;
  isToday: boolean;
  entradas: DayEntry[];
  saidas: DayEntry[];
  totals: { entradaRealizada: number; entradaPrevista: number; saidaRealizada: number; saidaPrevista: number; saldo: number };
}

export async function getCashFlowDay(key: string): Promise<CashFlowDayDetail> {
  const todayKey = dayKey(new Date());
  const isToday = key === todayKey;
  const entradas: DayEntry[] = [];
  const saidas: DayEntry[] = [];
  // projeções vencidas caem em "hoje"
  const matchesProjection = (due: string) => {
    const k = dayKey(due);
    return k === key || (isToday && k < todayKey);
  };

  for (const s of sales.all()) {
    if (s.status !== "FINALIZED" || !isCashSale(s.paymentMethod) || dayKey(s.createdAt) !== key) continue;
    entradas.push({
      id: s._id,
      kind: "sale",
      realized: true,
      overdue: false,
      description: `Venda #${s.saleNumber}`,
      party: s.customerName || "Consumidor final",
      method: s.paymentMethod,
      date: s.createdAt,
      amount: s.total,
    });
  }
  for (const b of receivables.all()) {
    const st = billStatus(b);
    if (b.status === "paid" && b.receivedDate && dayKey(b.receivedDate) === key) {
      entradas.push({ id: b._id, kind: "receivable", realized: true, overdue: false, description: b.description, party: b.customerName, method: b.paymentMethod, date: b.receivedDate, amount: b.amount });
    } else if ((st === "pending" || st === "overdue") && matchesProjection(b.dueDate)) {
      entradas.push({ id: b._id, kind: "receivable", realized: false, overdue: st === "overdue", description: b.description, party: b.customerName, date: b.dueDate, amount: b.amount });
    }
  }
  for (const b of payables.all()) {
    const st = billStatus(b);
    if (b.status === "paid" && b.paidDate && dayKey(b.paidDate) === key) {
      saidas.push({ id: b._id, kind: "payable", realized: true, overdue: false, description: b.description, party: b.supplier, method: b.paymentMethod, date: b.paidDate, amount: b.amount });
    } else if ((st === "pending" || st === "overdue") && matchesProjection(b.dueDate)) {
      saidas.push({ id: b._id, kind: "payable", realized: false, overdue: st === "overdue", description: b.description, party: b.supplier, date: b.dueDate, amount: b.amount });
    }
  }
  const sortFn = (a: DayEntry, b: DayEntry) => Number(b.realized) - Number(a.realized) || b.amount - a.amount;
  entradas.sort(sortFn);
  saidas.sort(sortFn);
  const total = (list: DayEntry[], realized: boolean) => round2(list.filter((e) => e.realized === realized).reduce((s, e) => s + e.amount, 0));
  const totals = {
    entradaRealizada: total(entradas, true),
    entradaPrevista: total(entradas, false),
    saidaRealizada: total(saidas, true),
    saidaPrevista: total(saidas, false),
    saldo: 0,
  };
  totals.saldo = round2(totals.entradaRealizada + totals.entradaPrevista - totals.saidaRealizada - totals.saidaPrevista);
  return delay({ key, isToday, entradas, saidas, totals });
}
