// Serviço de vendas (PDV, histórico, orçamentos).
// Espelha as regras de netlify/functions/sales.js sobre o banco simulado.

import type {
  AccountReceivable,
  CompanySettings,
  Customer,
  DiscountType,
  PaymentMethod,
  Product,
  Sale,
  SaleItem,
  SaleStatus,
  SplitPayment,
  StockMovement,
} from "@/lib/domain/types";
import { round2, saleTotals } from "@/lib/domain/calc";
import {
  cashSessions,
  customers,
  DEFAULT_SETTINGS,
  products,
  receivables,
  sales,
  settings,
  stockMovements,
} from "@/lib/mock/collections";
import { delay, MockError } from "@/lib/mock/db";
import type { SessionUser } from "@/lib/auth";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export const isCustomItem = (item: Pick<SaleItem, "id">) => item.id.startsWith("custom-");

export const SALE_STATUS_LABEL: Record<SaleStatus, string> = {
  FINALIZED: "Finalizada",
  QUOTE: "Orçamento",
  CANCELLED: "Cancelada",
};

/** Rótulo do meio de pagamento, considerando pagamento dividido. */
export function paymentLabel(sale: Pick<Sale, "paymentMethod" | "splitPayment" | "status">) {
  if (sale.status === "QUOTE") return "—";
  if (sale.splitPayment) return `Dinheiro + ${sale.splitPayment.method}`;
  return sale.paymentMethod;
}

/** Quanto cada meio de pagamento recebeu numa venda (pagamento dividido entra nos dois). */
export function saleAmountsByMethod(sale: Pick<Sale, "paymentMethod" | "splitPayment" | "total">) {
  const out: Partial<Record<PaymentMethod, number>> = {};
  if (sale.splitPayment) {
    out.Dinheiro = round2(sale.splitPayment.cash);
    out[sale.splitPayment.method] = round2((out[sale.splitPayment.method] ?? 0) + sale.splitPayment.rest);
  } else {
    out[sale.paymentMethod] = round2(sale.total);
  }
  return out;
}

function startOfDay(date: string) {
  const d = new Date(`${date}T00:00:00`);
  return d.getTime();
}

function endOfDay(date: string) {
  const d = new Date(`${date}T23:59:59.999`);
  return d.getTime();
}

// ---------------------------------------------------------------------------
// Leituras
// ---------------------------------------------------------------------------

export interface SaleFilters {
  start?: string; // YYYY-MM-DD
  end?: string;
  status?: SaleStatus | "all";
  paymentMethod?: PaymentMethod | "all";
  search?: string;
}

export async function listSales(filters: SaleFilters = {}) {
  const term = filters.search?.trim().toLowerCase() ?? "";
  const start = filters.start ? startOfDay(filters.start) : null;
  const end = filters.end ? endOfDay(filters.end) : null;
  const rows = sales
    .find((sale) => {
      const time = new Date(sale.createdAt).getTime();
      if (start !== null && time < start) return false;
      if (end !== null && time > end) return false;
      if (filters.status && filters.status !== "all" && sale.status !== filters.status) return false;
      if (filters.paymentMethod && filters.paymentMethod !== "all") {
        if (sale.status === "QUOTE") return false;
        const methods = Object.keys(saleAmountsByMethod(sale));
        if (!methods.includes(filters.paymentMethod)) return false;
      }
      if (term) {
        const haystack = [String(sale.saleNumber), sale.customerName ?? "", sale.userName].join(" ").toLowerCase();
        if (!haystack.includes(term.replace(/^#/, ""))) return false;
      }
      return true;
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return delay(rows);
}

export async function getSale(id: string) {
  const sale = sales.get(id);
  if (!sale) throw new MockError("Venda não encontrada", 404);
  return delay(sale);
}

/** Produtos ativos para o PDV (filtrados no cliente para a busca ser instantânea). */
export async function listPosProducts() {
  const rows = products.find((p) => p.active).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  return delay(rows, 150);
}

export async function listSaleCustomers() {
  const rows = customers.find((c) => c.active).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  return delay(rows, 150);
}

export async function getReceiptSettings(): Promise<CompanySettings> {
  const doc = settings.get("company");
  return delay({ ...DEFAULT_SETTINGS, ...(doc ?? {}) }, 50);
}

// ---------------------------------------------------------------------------
// Escritas
// ---------------------------------------------------------------------------

export interface PaymentInput {
  method: PaymentMethod;
  /** Dinheiro: valor entregue pelo cliente. */
  amountPaid?: number | null;
  /** Pagamento dividido: parte em dinheiro + restante em outro meio. */
  split?: { cash: number; method: PaymentMethod } | null;
}

export interface CreateSaleInput {
  items: SaleItem[];
  globalDiscount: number;
  globalDiscountType: DiscountType;
  status: Extract<SaleStatus, "FINALIZED" | "QUOTE">;
  payment?: PaymentInput;
  customerId?: string | null;
  userName: string;
}

function resolveCustomer(customerId?: string | null): Customer | null {
  if (!customerId) return null;
  const customer = customers.get(customerId);
  if (!customer) throw new MockError("Cliente não encontrado", 404);
  return customer;
}

function validateItems(items: SaleItem[]) {
  if (!items.length) throw new MockError("A venda precisa ter ao menos um item.");
  for (const item of items) {
    if (!(item.qty > 0)) throw new MockError(`Quantidade inválida para "${item.name}".`);
    if (!(item.price >= 0)) throw new MockError(`Preço inválido para "${item.name}".`);
  }
}

/** Verifica saldo de estoque somando a demanda por produto. */
function checkStock(items: SaleItem[]) {
  const demand = new Map<string, number>();
  for (const item of items) {
    if (isCustomItem(item)) continue;
    demand.set(item.id, (demand.get(item.id) ?? 0) + item.qty);
  }
  const found: { product: Product; qty: number }[] = [];
  for (const [id, qty] of demand) {
    const product = products.get(id);
    if (!product) throw new MockError("Produto não encontrado no estoque.", 404);
    if (product.quantity < qty) {
      throw new MockError(
        `Estoque insuficiente para "${product.name}": disponível ${product.quantity}, solicitado ${qty}.`,
        409,
      );
    }
    found.push({ product, qty });
  }
  return found;
}

function applyStock(entries: { product: Product; qty: number }[], saleNumber: number, userName: string) {
  const now = new Date().toISOString();
  for (const { product, qty } of entries) {
    const newQuantity = product.quantity - qty;
    products.update(product._id, { quantity: newQuantity, updatedAt: now });
    stockMovements.insert({
      productId: product._id,
      sku: product.sku,
      productName: product.name,
      type: "VENDA",
      quantity: -qty,
      previousQuantity: product.quantity,
      newQuantity,
      reference: `Venda #${saleNumber}`,
      userName,
      timestamp: now,
    } satisfies Omit<StockMovement, "_id">);
  }
}

function resolvePayment(total: number, payment: PaymentInput | undefined, customer: Customer | null) {
  if (!payment) throw new MockError("Informe a forma de pagamento.");
  if (payment.split) {
    const cash = round2(payment.split.cash);
    if (payment.split.method === "Dinheiro" || payment.split.method === "Crediário") {
      throw new MockError("No pagamento dividido, o restante deve ser PIX, cartão ou boleto.");
    }
    if (cash <= 0 || cash >= total) throw new MockError("A parte em dinheiro deve ser maior que zero e menor que o total.");
    const splitPayment: SplitPayment = { cash, method: payment.split.method, rest: round2(total - cash) };
    return { paymentMethod: payment.split.method, splitPayment, amountPaid: null, change: null };
  }
  if (payment.method === "Crediário" && !customer) {
    throw new MockError("Selecione um cliente para vender no crediário.");
  }
  if (payment.method === "Dinheiro") {
    const paid = round2(payment.amountPaid ?? total);
    if (paid < total) throw new MockError("Valor recebido menor que o total da venda.");
    return { paymentMethod: payment.method, splitPayment: null, amountPaid: paid, change: round2(paid - total) };
  }
  return { paymentMethod: payment.method, splitPayment: null, amountPaid: null, change: null };
}

function requireOpenCashSession() {
  const open = cashSessions.find((c) => c.status === "aberto")[0];
  if (!open) throw new MockError("Nenhum caixa aberto. Abra o caixa para finalizar vendas.", 409);
  return open;
}

function nextSaleNumber() {
  return sales.all().reduce((max, s) => Math.max(max, s.saleNumber), 0) + 1;
}

function createReceivable(sale: Sale, customer: Customer) {
  const due = new Date();
  due.setDate(due.getDate() + 30);
  receivables.insert({
    description: `Crediário - venda ${sale.saleNumber}`,
    customerId: customer._id,
    customerName: customer.name,
    category: "Crediário",
    amount: sale.total,
    dueDate: due.toISOString(),
    documentNumber: `VND-${sale.saleNumber}`,
    saleId: sale._id,
    status: "pending",
    createdAt: new Date().toISOString(),
  } satisfies Omit<AccountReceivable, "_id">);
}

export async function createSale(input: CreateSaleInput) {
  validateItems(input.items);
  const customer = resolveCustomer(input.customerId);
  const totals = saleTotals(input.items, input.globalDiscount, input.globalDiscountType);

  const base = {
    items: input.items,
    grossSubtotal: totals.grossSubtotal,
    itemsDiscountTotal: totals.itemsDiscountTotal,
    globalDiscount: input.globalDiscount,
    globalDiscountType: input.globalDiscountType,
    globalDiscountAmount: totals.globalDiscountAmount,
    totalDiscount: totals.totalDiscount,
    total: totals.total,
    customerId: customer?._id ?? null,
    customerName: customer?.name ?? null,
    userName: input.userName,
    createdAt: new Date().toISOString(),
  };

  if (input.status === "QUOTE") {
    const sale = sales.insert({
      ...base,
      saleNumber: nextSaleNumber(),
      status: "QUOTE",
      paymentMethod: input.payment?.method ?? "Dinheiro",
      splitPayment: null,
      amountPaid: null,
      change: null,
      caixaId: null,
    });
    return delay(sale, 400);
  }

  const session = requireOpenCashSession();
  const stock = checkStock(input.items);
  const payment = resolvePayment(totals.total, input.payment, customer);
  const saleNumber = nextSaleNumber();
  const sale = sales.insert({ ...base, ...payment, saleNumber, status: "FINALIZED", caixaId: session._id });
  applyStock(stock, saleNumber, input.userName);
  if (payment.paymentMethod === "Crediário" && customer) createReceivable(sale, customer);
  return delay(sale, 500);
}

/** Converte um orçamento em venda finalizada (valida estoque e caixa no momento da conversão). */
export async function convertQuote(id: string, payment: PaymentInput, userName: string) {
  const quote = sales.get(id);
  if (!quote) throw new MockError("Orçamento não encontrado", 404);
  if (quote.status !== "QUOTE") throw new MockError("Somente orçamentos podem ser convertidos.");
  const session = requireOpenCashSession();
  const customer = resolveCustomer(quote.customerId);
  const stock = checkStock(quote.items);
  const resolved = resolvePayment(quote.total, payment, customer);
  const sale = sales.update(id, {
    ...resolved,
    status: "FINALIZED",
    caixaId: session._id,
    userName,
    createdAt: new Date().toISOString(),
  });
  applyStock(stock, sale.saleNumber, userName);
  if (resolved.paymentMethod === "Crediário" && customer) createReceivable(sale, customer);
  return delay(sale, 500);
}

/** Cancela venda (Gerente/Admin): estorna estoque e cancela o crediário vinculado. */
export async function cancelSale(id: string, reason: string, user: Pick<SessionUser, "name" | "role">) {
  if (user.role !== "Admin" && user.role !== "Gerente") {
    throw new MockError("Somente Gerente ou Admin podem cancelar vendas.", 403);
  }
  const sale = sales.get(id);
  if (!sale) throw new MockError("Venda não encontrada", 404);
  if (sale.status === "CANCELLED") throw new MockError("Esta venda já está cancelada.");
  const trimmed = reason.trim();
  if (trimmed.length < 3) throw new MockError("Informe o motivo do cancelamento.");

  if (sale.status === "FINALIZED") {
    const now = new Date().toISOString();
    for (const item of sale.items) {
      if (isCustomItem(item)) continue;
      const product = products.get(item.id);
      if (!product) continue;
      const newQuantity = product.quantity + item.qty;
      products.update(product._id, { quantity: newQuantity, updatedAt: now });
      stockMovements.insert({
        productId: product._id,
        sku: product.sku,
        productName: product.name,
        type: "ESTORNO",
        quantity: item.qty,
        previousQuantity: product.quantity,
        newQuantity,
        reason: `Cancelamento: ${trimmed}`,
        reference: `Venda #${sale.saleNumber}`,
        userName: user.name,
        timestamp: now,
      });
    }
    for (const receivable of receivables.find((r) => r.saleId === sale._id && r.status === "pending")) {
      receivables.update(receivable._id, { status: "cancelled", notes: `Venda #${sale.saleNumber} cancelada` });
    }
  }

  const updated = sales.update(id, {
    status: "CANCELLED",
    cancelledAt: new Date().toISOString(),
    cancelReason: trimmed,
  });
  return delay(updated, 400);
}
