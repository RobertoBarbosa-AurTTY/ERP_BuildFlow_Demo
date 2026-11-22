// Contas a receber. Regras espelhadas de netlify/functions/accounts-receivable.js.
import { addMonths } from "date-fns";
import {
  installmentDescription,
  installmentDueDates,
  splitInstallments,
} from "@/components/finance/bill-utils";
import { daysUntil, round2 } from "@/lib/domain/calc";
import type { AccountReceivable, PaymentMethod } from "@/lib/domain/types";
import { customers, receivables } from "@/lib/mock/collections";
import { delay, MockError, newId } from "@/lib/mock/db";

export const RECEIVABLE_CATEGORIES = ["Vendas a prazo", "Crediário", "Serviços", "Outros"];

export interface ReceivableInput {
  description: string;
  customerId?: string;
  customerName: string;
  category: string;
  amount: number;
  dueDate: string; // ISO
  documentNumber?: string;
  notes?: string;
  recurring?: boolean;
  installments?: number;
}

function resolveCustomer(input: ReceivableInput) {
  if (input.customerId) {
    const customer = customers.get(input.customerId);
    if (!customer) throw new MockError("Cliente não encontrado", 404);
    return { customerId: customer._id, customerName: customer.name };
  }
  const name = input.customerName.trim();
  if (!name) throw new MockError("Informe o cliente");
  return { customerId: undefined, customerName: name };
}

function validate(input: ReceivableInput) {
  if (!input.description.trim()) throw new MockError("Descrição é obrigatória");
  if (!(input.amount > 0)) throw new MockError("Valor inválido");
  if (!input.dueDate) throw new MockError("Data de vencimento é obrigatória");
}

function byDueDate(a: AccountReceivable, b: AccountReceivable) {
  return a.dueDate.localeCompare(b.dueDate) || (a.installmentNumber ?? 0) - (b.installmentNumber ?? 0);
}

export async function listReceivables() {
  return delay([...receivables.all()].sort(byDueDate));
}

export async function createReceivable(input: ReceivableInput) {
  validate(input);
  const party = resolveCustomer(input);
  const now = new Date().toISOString();
  const base = {
    ...party,
    description: input.description.trim(),
    category: input.category || "Outros",
    documentNumber: input.documentNumber?.trim() || undefined,
    notes: input.notes?.trim() || undefined,
    status: "pending" as const,
    createdAt: now,
  };
  const count = Math.max(1, Math.min(48, Math.floor(input.installments ?? 1)));

  if (count > 1) {
    const groupId = newId();
    const amounts = splitInstallments(input.amount, count);
    const dues = installmentDueDates(input.dueDate, count);
    const created = amounts.map((amount, i) =>
      receivables.insert({
        ...base,
        description: installmentDescription(base.description, i + 1, count),
        amount,
        dueDate: dues[i],
        recurring: false,
        installmentGroupId: groupId,
        installmentNumber: i + 1,
        totalInstallments: count,
      }),
    );
    return delay(created);
  }

  const bill = receivables.insert({
    ...base,
    amount: round2(input.amount),
    dueDate: input.dueDate,
    recurring: Boolean(input.recurring),
  });
  return delay([bill]);
}

export async function updateReceivable(id: string, input: Omit<ReceivableInput, "installments">) {
  validate(input);
  const existing = receivables.get(id);
  if (!existing) throw new MockError("Conta não encontrada", 404);
  if (existing.status === "paid" || existing.status === "cancelled")
    throw new MockError("Contas recebidas ou canceladas não podem ser editadas");
  const updated = receivables.update(id, {
    ...resolveCustomer(input),
    description: input.description.trim(),
    category: input.category || "Outros",
    amount: round2(input.amount),
    dueDate: input.dueDate,
    documentNumber: input.documentNumber?.trim() || undefined,
    notes: input.notes?.trim() || undefined,
    recurring: existing.installmentGroupId ? false : Boolean(input.recurring),
  });
  return delay(updated);
}

export async function receiveReceivable(id: string, input: { date: string; paymentMethod: PaymentMethod }) {
  const existing = receivables.get(id);
  if (!existing) throw new MockError("Conta não encontrada", 404);
  if (existing.status === "paid") throw new MockError("Esta conta já foi recebida");
  if (existing.status === "cancelled") throw new MockError("Conta cancelada não pode ser recebida");
  const received = receivables.update(id, {
    status: "paid",
    receivedDate: input.date,
    paymentMethod: input.paymentMethod,
  });
  let next: AccountReceivable | null = null;
  if (existing.recurring) {
    const { _id, receivedDate, paymentMethod, ...template } = existing;
    void _id;
    void receivedDate;
    void paymentMethod;
    next = receivables.insert({
      ...template,
      dueDate: addMonths(new Date(existing.dueDate), 1).toISOString(),
      status: "pending",
      createdAt: new Date().toISOString(),
    });
  }
  return delay({ received, next });
}

export async function cancelReceivable(id: string) {
  const existing = receivables.get(id);
  if (!existing) throw new MockError("Conta não encontrada", 404);
  if (existing.status === "paid") throw new MockError("Contas recebidas não podem ser canceladas");
  return delay(receivables.update(id, { status: "cancelled" }));
}

export async function deleteReceivable(id: string) {
  receivables.remove(id);
  return delay(true);
}

export async function deleteReceivableGroup(groupId: string) {
  const items = receivables.find((b) => b.installmentGroupId === groupId && b.status !== "paid");
  items.forEach((b) => receivables.remove(b._id));
  return delay(items.length);
}

export interface ProjectionPoint {
  date: string; // YYYY-MM-DD
  label: string; // dd/mm
  amount: number;
}

/** Entradas previstas (pendentes) para os próximos `days` dias, agrupadas por dia. */
export function projectInflow(list: AccountReceivable[], days = 30): ProjectionPoint[] {
  const start = new Date();
  start.setHours(12, 0, 0, 0);
  const points: ProjectionPoint[] = Array.from({ length: days }, (_, i) => {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    return {
      date: d.toLocaleDateString("sv-SE"),
      label: d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
      amount: 0,
    };
  });
  for (const bill of list) {
    if (bill.status !== "pending") continue;
    const offset = daysUntil(bill.dueDate);
    if (offset >= 0 && offset < days) points[offset].amount = round2(points[offset].amount + bill.amount);
  }
  return points;
}
