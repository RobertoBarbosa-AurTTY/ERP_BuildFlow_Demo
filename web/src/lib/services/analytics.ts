// Indicadores de vendas, produtos e DRE (dashboard e relatórios).
// Espelha netlify/functions/dashboard.js e financial-report.js do legado.
// Regra geral: só vendas FINALIZED entram nos números (canceladas e orçamentos ficam de fora).
import { billStatus, daysUntil, round2, stockStatus } from "@/lib/domain/calc";
import type {
  AccountPayable,
  AccountReceivable,
  PaymentMethod,
  Product,
  Sale,
  StockStatus,
} from "@/lib/domain/types";
import { payables, products, receivables, sales, settings } from "@/lib/mock/collections";
import { delay } from "@/lib/mock/db";

// ---------------------------------------------------------------------------
// Datas
// ---------------------------------------------------------------------------

/** YYYY-MM-DD no fuso local. */
export function dayKey(value: string | Date) {
  const d = new Date(value);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/** Converte YYYY-MM-DD em Date local à meia-noite. */
export function parseDayKey(key: string) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function startOfDay(date: Date = new Date()) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function addDays(date: Date, days: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

/** Lista de chaves de dia entre from e to (inclusive). */
export function dayRange(fromKey: string, toKey: string) {
  const keys: string[] = [];
  let cursor = parseDayKey(fromKey);
  const end = parseDayKey(toKey);
  while (cursor <= end && keys.length < 1000) {
    keys.push(dayKey(cursor));
    cursor = addDays(cursor, 1);
  }
  return keys;
}

function inRange(value: string | undefined, fromKey: string, toKey: string) {
  if (!value) return false;
  const key = dayKey(value);
  return key >= fromKey && key <= toKey;
}

// ---------------------------------------------------------------------------
// Cálculos de venda
// ---------------------------------------------------------------------------

export const isRevenueSale = (sale: Sale) => sale.status === "FINALIZED";

type CostIndex = Map<string, number>;

function costIndex(list: Product[] = products.all()): CostIndex {
  return new Map(list.map((p) => [p._id, p.costPrice]));
}

/** Custo da mercadoria vendida (CMV) da venda; sem custo cadastrado usa 70% do preço, como no legado. */
export function saleCost(sale: Sale, costs: CostIndex) {
  return sale.items.reduce((sum, item) => {
    const unitCost = costs.get(item.id) ?? item.price * 0.7;
    return sum + unitCost * item.qty;
  }, 0);
}

/** Receita líquida por item, rateando o desconto global proporcionalmente. */
function itemNetRevenue(sale: Sale) {
  const lines = sale.items.map((item) => {
    const gross = item.qty * item.price;
    const discount =
      item.discount > 0
        ? item.discountType === "value"
          ? Math.min(item.discount, gross)
          : gross * (Math.min(item.discount, 100) / 100)
        : 0;
    return { item, net: Math.max(0, gross - discount) };
  });
  const subtotal = lines.reduce((s, l) => s + l.net, 0);
  const factor = subtotal > 0 ? sale.total / subtotal : 0;
  return lines.map((l) => ({ item: l.item, revenue: l.net * factor }));
}

function finalizedSales(fromKey: string, toKey: string) {
  return sales.find((s) => isRevenueSale(s) && inRange(s.createdAt, fromKey, toKey));
}

function summarize(list: Sale[], costs: CostIndex) {
  const revenue = list.reduce((s, x) => s + x.total, 0);
  const cost = list.reduce((s, x) => s + saleCost(x, costs), 0);
  const discounts = list.reduce((s, x) => s + (x.totalDiscount || 0), 0);
  const items = list.reduce((s, x) => s + x.items.reduce((q, i) => q + i.qty, 0), 0);
  return {
    revenue: round2(revenue),
    gross: round2(revenue + discounts),
    discounts: round2(discounts),
    cost: round2(cost),
    profit: round2(revenue - cost),
    margin: revenue > 0 ? (revenue - cost) / revenue : 0,
    count: list.length,
    avgTicket: list.length ? round2(revenue / list.length) : 0,
    itemsSold: round2(items),
  };
}

export type SalesSummary = ReturnType<typeof summarize>;

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

export type DashboardPeriod = "today" | "7d" | "30d" | "month";

export const DASHBOARD_PERIOD_LABEL: Record<DashboardPeriod, string> = {
  today: "Hoje",
  "7d": "7 dias",
  "30d": "30 dias",
  month: "Este mês",
};

function periodRange(period: DashboardPeriod) {
  const today = startOfDay();
  let from: Date;
  let prevFrom: Date;
  let prevTo: Date;
  switch (period) {
    case "today":
      from = today;
      prevFrom = addDays(today, -1);
      prevTo = addDays(today, -1);
      break;
    case "7d":
      from = addDays(today, -6);
      prevFrom = addDays(from, -7);
      prevTo = addDays(from, -1);
      break;
    case "30d":
      from = addDays(today, -29);
      prevFrom = addDays(from, -30);
      prevTo = addDays(from, -1);
      break;
    case "month": {
      from = new Date(today.getFullYear(), today.getMonth(), 1);
      prevFrom = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      // mesmo número de dias do mês anterior, para comparar períodos equivalentes
      const elapsed = today.getDate() - 1;
      const lastPrev = new Date(today.getFullYear(), today.getMonth(), 0);
      prevTo = addDays(prevFrom, Math.min(elapsed, lastPrev.getDate() - 1));
      break;
    }
  }
  return { from: dayKey(from), to: dayKey(today), prevFrom: dayKey(prevFrom), prevTo: dayKey(prevTo) };
}

export interface SeriesPoint {
  key: string;
  label: string;
  revenue: number;
  profit: number;
  count: number;
}

export interface PaymentBreakdown {
  method: PaymentMethod;
  total: number;
  count: number;
  share: number;
}

export interface TopProduct {
  id: string;
  sku: string;
  name: string;
  qty: number;
  unit: string;
  revenue: number;
}

export interface StockAlert {
  id: string;
  name: string;
  sku: string;
  quantity: number;
  minStock: number;
  unit: string;
  status: StockStatus;
}

export interface ExpiryAlert {
  id: string;
  name: string;
  sku: string;
  quantity: number;
  expiryDate: string;
  days: number;
}

export interface UpcomingBill {
  id: string;
  kind: "payable" | "receivable";
  description: string;
  party: string;
  amount: number;
  dueDate: string;
  days: number;
  overdue: boolean;
}

export interface RecentSale {
  id: string;
  saleNumber: number;
  customerName: string | null;
  paymentMethod: PaymentMethod;
  total: number;
  itemsCount: number;
  createdAt: string;
}

export interface DashboardData {
  period: DashboardPeriod;
  from: string;
  to: string;
  summary: SalesSummary;
  previous: SalesSummary;
  today: { revenue: number; count: number };
  month: { revenue: number; count: number };
  series: SeriesPoint[];
  seriesBucket: "hour" | "day";
  payments: PaymentBreakdown[];
  topProducts: TopProduct[];
  stockAlerts: StockAlert[];
  stockAlertsTotal: number;
  expiryAlerts: ExpiryAlert[];
  bills: UpcomingBill[];
  billsTotals: { payable: number; receivable: number; overduePayable: number; overdueReceivable: number };
  recentSales: RecentSale[];
}

function paymentBreakdown(list: Sale[]): PaymentBreakdown[] {
  const map = new Map<PaymentMethod, { total: number; count: number }>();
  for (const s of list) {
    const row = map.get(s.paymentMethod) ?? { total: 0, count: 0 };
    row.total += s.total;
    row.count += 1;
    map.set(s.paymentMethod, row);
  }
  const grand = list.reduce((s, x) => s + x.total, 0);
  return [...map.entries()]
    .map(([method, v]) => ({ method, total: round2(v.total), count: v.count, share: grand ? v.total / grand : 0 }))
    .sort((a, b) => b.total - a.total);
}

function upcomingBills(windowDays: number): DashboardData["bills"] {
  const rows: UpcomingBill[] = [];
  const push = (bill: AccountPayable | AccountReceivable, kind: UpcomingBill["kind"]) => {
    const status = billStatus(bill);
    if (status !== "pending" && status !== "overdue") return;
    const days = daysUntil(bill.dueDate);
    if (days > windowDays) return;
    rows.push({
      id: bill._id,
      kind,
      description: bill.description,
      party: "supplier" in bill ? bill.supplier : bill.customerName,
      amount: bill.amount,
      dueDate: bill.dueDate,
      days,
      overdue: status === "overdue",
    });
  };
  payables.all().forEach((b) => push(b, "payable"));
  receivables.all().forEach((b) => push(b, "receivable"));
  return rows.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

export async function getDashboard(period: DashboardPeriod): Promise<DashboardData> {
  const range = periodRange(period);
  const productList = products.all();
  const costs = costIndex(productList);
  const current = finalizedSales(range.from, range.to);
  const previous = finalizedSales(range.prevFrom, range.prevTo);
  const todayKey = dayKey(new Date());
  const monthStart = dayKey(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const todaySales = finalizedSales(todayKey, todayKey);
  const monthSales = finalizedSales(monthStart, todayKey);

  // Série: por hora no dia atual, por dia nos demais períodos
  const seriesBucket: DashboardData["seriesBucket"] = period === "today" ? "hour" : "day";
  const series: SeriesPoint[] = [];
  if (seriesBucket === "hour") {
    for (let h = 7; h <= 20; h++) {
      const list = current.filter((s) => new Date(s.createdAt).getHours() === h);
      const sum = summarize(list, costs);
      series.push({ key: String(h), label: `${String(h).padStart(2, "0")}h`, revenue: sum.revenue, profit: sum.profit, count: sum.count });
    }
  } else {
    const byDay = new Map<string, Sale[]>();
    for (const s of current) {
      const k = dayKey(s.createdAt);
      byDay.set(k, [...(byDay.get(k) ?? []), s]);
    }
    for (const k of dayRange(range.from, range.to)) {
      const sum = summarize(byDay.get(k) ?? [], costs);
      const d = parseDayKey(k);
      series.push({
        key: k,
        label: d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
        revenue: sum.revenue,
        profit: sum.profit,
        count: sum.count,
      });
    }
  }

  // Top produtos
  const productMap = new Map<string, TopProduct>();
  for (const s of current) {
    for (const { item, revenue } of itemNetRevenue(s)) {
      const row = productMap.get(item.id) ?? { id: item.id, sku: item.sku, name: item.name, qty: 0, unit: item.unit, revenue: 0 };
      row.qty += item.qty;
      row.revenue += revenue;
      productMap.set(item.id, row);
    }
  }
  const topProducts = [...productMap.values()]
    .map((p) => ({ ...p, revenue: round2(p.revenue), qty: round2(p.qty) }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 6);

  // Alertas de estoque e validade
  const cfg = settings.get("company");
  const expiryDays = cfg?.expiryAlertDays ?? 30;
  const active = productList.filter((p) => p.active);
  const lowStock = active
    .map((p) => ({ p, status: stockStatus(p) }))
    .filter((x) => x.status === "low" || x.status === "out")
    .sort((a, b) => a.p.quantity / Math.max(1, a.p.minStock) - b.p.quantity / Math.max(1, b.p.minStock));
  const stockAlerts = lowStock.slice(0, 6).map(({ p, status }) => ({
    id: p._id,
    name: p.name,
    sku: p.sku,
    quantity: p.quantity,
    minStock: p.minStock,
    unit: p.unit,
    status,
  }));
  const expiryAlerts = active
    .filter((p) => p.expiryDate && daysUntil(p.expiryDate) <= expiryDays)
    .map((p) => ({
      id: p._id,
      name: p.name,
      sku: p.sku,
      quantity: p.quantity,
      expiryDate: p.expiryDate as string,
      days: daysUntil(p.expiryDate),
    }))
    .sort((a, b) => a.days - b.days);

  const bills = upcomingBills(7);
  const sumBills = (kind: UpcomingBill["kind"], overdue: boolean) =>
    round2(bills.filter((b) => b.kind === kind && b.overdue === overdue).reduce((s, b) => s + b.amount, 0));

  const recentSales = [...current]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 8)
    .map((s) => ({
      id: s._id,
      saleNumber: s.saleNumber,
      customerName: s.customerName ?? null,
      paymentMethod: s.paymentMethod,
      total: s.total,
      itemsCount: s.items.length,
      createdAt: s.createdAt,
    }));

  const todaySum = summarize(todaySales, costs);
  const monthSum = summarize(monthSales, costs);

  return delay({
    period,
    from: range.from,
    to: range.to,
    summary: summarize(current, costs),
    previous: summarize(previous, costs),
    today: { revenue: todaySum.revenue, count: todaySum.count },
    month: { revenue: monthSum.revenue, count: monthSum.count },
    series,
    seriesBucket,
    payments: paymentBreakdown(current),
    topProducts,
    stockAlerts,
    stockAlertsTotal: lowStock.length,
    expiryAlerts,
    bills,
    billsTotals: {
      payable: sumBills("payable", false),
      receivable: sumBills("receivable", false),
      overduePayable: sumBills("payable", true),
      overdueReceivable: sumBills("receivable", true),
    },
    recentSales,
  });
}

// ---------------------------------------------------------------------------
// DRE
// ---------------------------------------------------------------------------

export interface Dre {
  receitaBruta: number;
  descontos: number;
  receitaLiquida: number;
  cmv: number;
  lucroBruto: number;
  despesasPagas: number;
  outrosRecebimentos: number;
  resultado: number;
}

/** DRE simplificado do período (mesma fórmula de financial-report.js). */
export function computeDre(fromKey: string, toKey: string, costs: CostIndex = costIndex()): Dre {
  const list = finalizedSales(fromKey, toKey);
  const sum = summarize(list, costs);
  const despesasPagas = payables
    .find((b) => b.status === "paid" && inRange(b.paidDate, fromKey, toKey))
    .reduce((s, b) => s + b.amount, 0);
  const outrosRecebimentos = receivables
    .find((b) => b.status === "paid" && inRange(b.receivedDate, fromKey, toKey))
    .reduce((s, b) => s + b.amount, 0);
  const receitaLiquida = sum.gross - sum.discounts;
  const lucroBruto = receitaLiquida - sum.cost;
  return {
    receitaBruta: round2(sum.gross),
    descontos: round2(sum.discounts),
    receitaLiquida: round2(receitaLiquida),
    cmv: round2(sum.cost),
    lucroBruto: round2(lucroBruto),
    despesasPagas: round2(despesasPagas),
    outrosRecebimentos: round2(outrosRecebimentos),
    resultado: round2(lucroBruto - despesasPagas + outrosRecebimentos),
  };
}

// ---------------------------------------------------------------------------
// Relatórios
// ---------------------------------------------------------------------------

export interface ReportSaleRow {
  id: string;
  saleNumber: number;
  createdAt: string;
  customerName: string | null;
  userName: string;
  paymentMethod: PaymentMethod;
  itemsCount: number;
  discount: number;
  total: number;
  cost: number;
  profit: number;
}

export interface ReportProductRow {
  id: string;
  sku: string;
  name: string;
  category: string;
  unit: string;
  qty: number;
  revenue: number;
  cost: number;
  profit: number;
  margin: number;
  share: number;
  abc: "A" | "B" | "C";
}

export interface ReportCategoryRow {
  category: string;
  qty: number;
  products: number;
  revenue: number;
  cost: number;
  profit: number;
  margin: number;
  share: number;
}

export interface ReportDailyRow {
  key: string;
  label: string;
  revenue: number;
  cost: number;
  profit: number;
  count: number;
}

export interface SalesReport {
  from: string;
  to: string;
  summary: SalesSummary;
  cancelled: { count: number; total: number };
  daily: ReportDailyRow[];
  sales: ReportSaleRow[];
  products: ReportProductRow[];
  categories: ReportCategoryRow[];
  payments: (PaymentBreakdown & { avgTicket: number })[];
  dre: Dre;
}

export async function getSalesReport(fromKey: string, toKey: string): Promise<SalesReport> {
  const productList = products.all();
  const costs = costIndex(productList);
  const byId = new Map(productList.map((p) => [p._id, p]));
  const list = finalizedSales(fromKey, toKey).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const cancelledList = sales.find((s) => s.status === "CANCELLED" && inRange(s.createdAt, fromKey, toKey));
  const summary = summarize(list, costs);

  // Diário
  const byDay = new Map<string, Sale[]>();
  for (const s of list) {
    const k = dayKey(s.createdAt);
    byDay.set(k, [...(byDay.get(k) ?? []), s]);
  }
  const daily = dayRange(fromKey, toKey).map((k) => {
    const sum = summarize(byDay.get(k) ?? [], costs);
    return {
      key: k,
      label: parseDayKey(k).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
      revenue: sum.revenue,
      cost: sum.cost,
      profit: sum.profit,
      count: sum.count,
    };
  });

  // Produtos
  const pmap = new Map<string, Omit<ReportProductRow, "margin" | "share" | "abc">>();
  for (const s of list) {
    for (const { item, revenue } of itemNetRevenue(s)) {
      const product = byId.get(item.id);
      const unitCost = costs.get(item.id) ?? item.price * 0.7;
      const row = pmap.get(item.id) ?? {
        id: item.id,
        sku: item.sku,
        name: item.name,
        category: product?.category ?? "Sem categoria",
        unit: item.unit,
        qty: 0,
        revenue: 0,
        cost: 0,
        profit: 0,
      };
      row.qty += item.qty;
      row.revenue += revenue;
      row.cost += unitCost * item.qty;
      row.profit = row.revenue - row.cost;
      pmap.set(item.id, row);
    }
  }
  const totalRevenue = [...pmap.values()].reduce((s, p) => s + p.revenue, 0);
  let cumulative = 0;
  const productRows: ReportProductRow[] = [...pmap.values()]
    .sort((a, b) => b.revenue - a.revenue)
    .map((p) => {
      const share = totalRevenue ? p.revenue / totalRevenue : 0;
      const before = cumulative;
      cumulative += share;
      // Curva ABC: A até 80% do faturamento acumulado, B até 95%, C o restante
      const abc: ReportProductRow["abc"] = before < 0.8 ? "A" : before < 0.95 ? "B" : "C";
      return {
        ...p,
        qty: round2(p.qty),
        revenue: round2(p.revenue),
        cost: round2(p.cost),
        profit: round2(p.profit),
        margin: p.revenue ? p.profit / p.revenue : 0,
        share,
        abc,
      };
    });

  // Categorias
  const cmap = new Map<string, ReportCategoryRow>();
  for (const p of productRows) {
    const row = cmap.get(p.category) ?? { category: p.category, qty: 0, products: 0, revenue: 0, cost: 0, profit: 0, margin: 0, share: 0 };
    row.qty += p.qty;
    row.products += 1;
    row.revenue += p.revenue;
    row.cost += p.cost;
    row.profit += p.profit;
    cmap.set(p.category, row);
  }
  const categoryRows = [...cmap.values()]
    .map((c) => ({
      ...c,
      qty: round2(c.qty),
      revenue: round2(c.revenue),
      cost: round2(c.cost),
      profit: round2(c.profit),
      margin: c.revenue ? c.profit / c.revenue : 0,
      share: totalRevenue ? c.revenue / totalRevenue : 0,
    }))
    .sort((a, b) => b.revenue - a.revenue);

  const saleRows: ReportSaleRow[] = list.map((s) => {
    const cost = saleCost(s, costs);
    return {
      id: s._id,
      saleNumber: s.saleNumber,
      createdAt: s.createdAt,
      customerName: s.customerName ?? null,
      userName: s.userName,
      paymentMethod: s.paymentMethod,
      itemsCount: s.items.length,
      discount: s.totalDiscount || 0,
      total: s.total,
      cost: round2(cost),
      profit: round2(s.total - cost),
    };
  });

  return delay({
    from: fromKey,
    to: toKey,
    summary,
    cancelled: { count: cancelledList.length, total: round2(cancelledList.reduce((s, x) => s + x.total, 0)) },
    daily,
    sales: saleRows,
    products: productRows,
    categories: categoryRows,
    payments: paymentBreakdown(list).map((p) => ({ ...p, avgTicket: p.count ? round2(p.total / p.count) : 0 })),
    dre: computeDre(fromKey, toKey, costs),
  });
}
