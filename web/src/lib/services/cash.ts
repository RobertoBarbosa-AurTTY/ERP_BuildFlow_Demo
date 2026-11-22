// Serviço de caixa: abertura, suprimento/sangria, fechamento e auditoria.
// Regras de netlify/functions/caixa.js, caixas.js e retiradas-caixa.js.

import type {
  CashMovement,
  CashMovementType,
  CashSession,
  CashSessionStatus,
  PaymentMethod,
  Sale,
} from "@/lib/domain/types";
import { PAYMENT_METHODS } from "@/lib/domain/types";
import { round2 } from "@/lib/domain/calc";
import { cashMovements, cashSessions, sales } from "@/lib/mock/collections";
import { delay, MockError } from "@/lib/mock/db";
import { saleAmountsByMethod } from "./sales";

/** Contagem informada no fechamento, por meio de pagamento. */
export type CountedByMethod = Partial<Record<PaymentMethod, number>>;

/** Sessão com a contagem por meio (campo extra gravado no fechamento). */
export type CashSessionRecord = CashSession & { countedByMethod?: CountedByMethod };

/** Meios conferidos no fechamento (crediário não entra no caixa). */
export const RECONCILED_METHODS: PaymentMethod[] = PAYMENT_METHODS.filter((m) => m !== "Crediário");

/** Caixa aberto há mais de 24h gera alerta na auditoria (como no legado). */
export const LONG_OPEN_MS = 24 * 60 * 60 * 1000;

export interface CashSummary {
  session: CashSessionRecord;
  salesCount: number;
  cancelledCount: number;
  totalSales: number;
  totalDiscounts: number;
  byMethod: Record<PaymentMethod, number>;
  suprimentos: number;
  retiradas: number;
  /** Dinheiro esperado na gaveta: inicial + vendas em dinheiro + suprimentos − sangrias. */
  expectedCash: number;
  /** Esperado por meio conferido (Dinheiro já com inicial/suprimentos/sangrias). */
  expectedByMethod: Record<PaymentMethod, number>;
  /** Total contado (quando o caixa está fechado). */
  counted: number | null;
  /** Diferença contado − esperado (positivo = sobra). */
  difference: number | null;
  durationMs: number;
  longOpen: boolean;
}

export interface CashSessionDetail extends CashSummary {
  sales: Sale[];
  movements: CashMovement[];
}

function emptyByMethod(): Record<PaymentMethod, number> {
  return Object.fromEntries(PAYMENT_METHODS.map((m) => [m, 0])) as Record<PaymentMethod, number>;
}

function summarize(session: CashSessionRecord, sessionSales: Sale[], movements: CashMovement[]): CashSummary {
  const byMethod = emptyByMethod();
  let totalSales = 0;
  let totalDiscounts = 0;
  let salesCount = 0;
  let cancelledCount = 0;
  for (const sale of sessionSales) {
    if (sale.status === "CANCELLED") {
      cancelledCount++;
      continue;
    }
    if (sale.status !== "FINALIZED") continue;
    salesCount++;
    totalSales += sale.total;
    totalDiscounts += sale.totalDiscount;
    for (const [method, amount] of Object.entries(saleAmountsByMethod(sale))) {
      byMethod[method as PaymentMethod] += amount ?? 0;
    }
  }
  for (const m of PAYMENT_METHODS) byMethod[m] = round2(byMethod[m]);

  const suprimentos = round2(movements.filter((m) => m.type === "suprimento").reduce((s, m) => s + m.amount, 0));
  const retiradas = round2(movements.filter((m) => m.type === "retirada").reduce((s, m) => s + m.amount, 0));
  const expectedCash = round2(session.openingAmount + byMethod.Dinheiro + suprimentos - retiradas);
  const expectedByMethod = { ...byMethod, Dinheiro: expectedCash };

  let counted: number | null = null;
  let difference: number | null = null;
  if (session.status === "fechado") {
    if (session.countedByMethod) {
      counted = round2(RECONCILED_METHODS.reduce((s, m) => s + (session.countedByMethod?.[m] ?? 0), 0));
      const expected = round2(RECONCILED_METHODS.reduce((s, m) => s + expectedByMethod[m], 0));
      difference = round2(counted - expected);
    } else if (session.closingAmount != null) {
      // Registros antigos guardam só o dinheiro contado na gaveta.
      counted = round2(session.closingAmount);
      difference = round2(counted - expectedCash);
    }
  }

  const end = session.closedAt ? new Date(session.closedAt).getTime() : Date.now();
  const durationMs = Math.max(0, end - new Date(session.openedAt).getTime());

  return {
    session,
    salesCount,
    cancelledCount,
    totalSales: round2(totalSales),
    totalDiscounts: round2(totalDiscounts),
    byMethod,
    suprimentos,
    retiradas,
    expectedCash,
    expectedByMethod,
    counted,
    difference,
    durationMs,
    longOpen: session.status === "aberto" && durationMs > LONG_OPEN_MS,
  };
}

function sessionData(session: CashSessionRecord) {
  const sessionSales = sales.find((s) => s.caixaId === session._id);
  const movements = cashMovements
    .find((m) => m.caixaId === session._id)
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  return { sessionSales, movements };
}

function findOpen(): CashSessionRecord | undefined {
  return cashSessions.find((c) => c.status === "aberto")[0];
}

// ---------------------------------------------------------------------------
// Leituras
// ---------------------------------------------------------------------------

/** Caixa aberto com resumo, ou null. */
export async function getOpenSession(): Promise<CashSummary | null> {
  const open = findOpen();
  if (!open) return delay(null, 150);
  const { sessionSales, movements } = sessionData(open);
  return delay(summarize(open, sessionSales, movements), 150);
}

export async function getSessionDetail(id: string): Promise<CashSessionDetail> {
  const session = cashSessions.get(id) as CashSessionRecord | undefined;
  if (!session) throw new MockError("Caixa não encontrado", 404);
  const { sessionSales, movements } = sessionData(session);
  return delay({
    ...summarize(session, sessionSales, movements),
    sales: sessionSales.sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    movements,
  });
}

export interface CashSessionFilters {
  start?: string; // YYYY-MM-DD (abertura)
  end?: string;
  status?: CashSessionStatus | "all";
}

export async function listSessionSummaries(filters: CashSessionFilters = {}): Promise<CashSummary[]> {
  const start = filters.start ? new Date(`${filters.start}T00:00:00`).getTime() : null;
  const end = filters.end ? new Date(`${filters.end}T23:59:59.999`).getTime() : null;

  const salesByCaixa = new Map<string, Sale[]>();
  for (const sale of sales.all()) {
    if (!sale.caixaId) continue;
    const list = salesByCaixa.get(sale.caixaId) ?? [];
    list.push(sale);
    salesByCaixa.set(sale.caixaId, list);
  }
  const movesByCaixa = new Map<string, CashMovement[]>();
  for (const move of cashMovements.all()) {
    const list = movesByCaixa.get(move.caixaId) ?? [];
    list.push(move);
    movesByCaixa.set(move.caixaId, list);
  }

  const rows = (cashSessions.all() as CashSessionRecord[])
    .filter((s) => {
      const opened = new Date(s.openedAt).getTime();
      if (start !== null && opened < start) return false;
      if (end !== null && opened > end) return false;
      if (filters.status && filters.status !== "all" && s.status !== filters.status) return false;
      return true;
    })
    .sort((a, b) => b.openedAt.localeCompare(a.openedAt))
    .map((s) => summarize(s, salesByCaixa.get(s._id) ?? [], movesByCaixa.get(s._id) ?? []));
  return delay(rows);
}

// ---------------------------------------------------------------------------
// Escritas
// ---------------------------------------------------------------------------

export async function openCashSession(input: { openingAmount: number; notes?: string; operatorName: string }) {
  if (findOpen()) throw new MockError("Já existe um caixa aberto. Feche-o antes de abrir um novo.");
  const openingAmount = round2(Math.max(0, Number(input.openingAmount) || 0));
  const number = cashSessions.all().reduce((max, c) => Math.max(max, c.number), 0) + 1;
  const session = cashSessions.insert({
    number,
    status: "aberto",
    operatorName: input.operatorName,
    openedAt: new Date().toISOString(),
    openingAmount,
    notes: input.notes?.trim() || undefined,
  });
  return delay(session, 400);
}

export async function addCashMovement(input: {
  caixaId: string;
  type: CashMovementType;
  amount: number;
  reason: string;
  userName: string;
}) {
  const session = cashSessions.get(input.caixaId);
  if (!session || session.status !== "aberto") throw new MockError("O caixa precisa estar aberto.");
  const amount = round2(Number(input.amount) || 0);
  if (amount <= 0) throw new MockError("Informe um valor maior que zero.");
  if (!input.reason.trim()) throw new MockError("Informe o motivo.");
  if (input.type === "retirada") {
    const { sessionSales, movements } = sessionData(session);
    const { expectedCash } = summarize(session, sessionSales, movements);
    if (amount > expectedCash) {
      throw new MockError(`Sangria maior que o dinheiro disponível em caixa (R$ ${expectedCash.toFixed(2).replace(".", ",")}).`);
    }
  }
  const movement = cashMovements.insert({
    caixaId: session._id,
    type: input.type,
    amount,
    reason: input.reason.trim(),
    userName: input.userName,
    timestamp: new Date().toISOString(),
  });
  return delay(movement, 300);
}

export async function closeCashSession(input: { id: string; counted: CountedByMethod; notes?: string }) {
  const session = cashSessions.get(input.id);
  if (!session || session.status !== "aberto") throw new MockError("Nenhum caixa aberto para fechar.");
  const counted: CountedByMethod = {};
  for (const m of RECONCILED_METHODS) counted[m] = round2(Math.max(0, Number(input.counted[m]) || 0));
  const patch: Partial<CashSessionRecord> = {
    status: "fechado",
    closedAt: new Date().toISOString(),
    closingAmount: counted.Dinheiro ?? 0,
    countedByMethod: counted,
    notes: input.notes?.trim() || session.notes,
  };
  const updated = cashSessions.update(session._id, patch as Partial<CashSession>) as CashSessionRecord;
  const { sessionSales, movements } = sessionData(updated);
  return delay(summarize(updated, sessionSales, movements), 400);
}
