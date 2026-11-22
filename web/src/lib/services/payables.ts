// Contas a pagar. Regras espelhadas de netlify/functions/accounts-payable.js:
// parcelamento gera N contas com o mesmo installmentGroupId (vencimentos mensais)
// e pagar uma conta recorrente gera a próxima ocorrência.
import { addMonths } from "date-fns";
import {
  installmentDescription,
  installmentDueDates,
  splitInstallments,
} from "@/components/finance/bill-utils";
import { round2 } from "@/lib/domain/calc";
import type { AccountPayable, PaymentMethod } from "@/lib/domain/types";
import { payables } from "@/lib/mock/collections";
import { delay, MockError, newId } from "@/lib/mock/db";

export const PAYABLE_CATEGORIES = [
  "Fornecedores",
  "Aluguel",
  "Utilidades",
  "Impostos",
  "Pessoal",
  "Serviços",
  "Manutenção",
  "Seguros",
  "Outros",
];

export interface PayableInput {
  description: string;
  supplier: string;
  category: string;
  amount: number; // total (dividido quando installments > 1)
  dueDate: string; // ISO
  documentNumber?: string;
  barcode?: string;
  notes?: string;
  recurring?: boolean;
  installments?: number;
}

function validate(input: PayableInput) {
  if (!input.description.trim()) throw new MockError("Descrição é obrigatória");
  if (!(input.amount > 0)) throw new MockError("Valor inválido");
  if (!input.dueDate) throw new MockError("Data de vencimento é obrigatória");
}

function byDueDate(a: AccountPayable, b: AccountPayable) {
  return a.dueDate.localeCompare(b.dueDate) || (a.installmentNumber ?? 0) - (b.installmentNumber ?? 0);
}

export async function listPayables() {
  return delay([...payables.all()].sort(byDueDate));
}

export async function createPayable(input: PayableInput) {
  validate(input);
  const now = new Date().toISOString();
  const base = {
    description: input.description.trim(),
    supplier: input.supplier.trim(),
    category: input.category || "Outros",
    documentNumber: input.documentNumber?.trim() || undefined,
    barcode: input.barcode?.trim() || undefined,
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
      payables.insert({
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

  const bill = payables.insert({ ...base, amount: round2(input.amount), dueDate: input.dueDate, recurring: Boolean(input.recurring) });
  return delay([bill]);
}

export async function updatePayable(id: string, input: Omit<PayableInput, "installments">) {
  validate(input);
  const existing = payables.get(id);
  if (!existing) throw new MockError("Conta não encontrada", 404);
  if (existing.status === "paid" || existing.status === "cancelled")
    throw new MockError("Contas pagas ou canceladas não podem ser editadas");
  const updated = payables.update(id, {
    description: input.description.trim(),
    supplier: input.supplier.trim(),
    category: input.category || "Outros",
    amount: round2(input.amount),
    dueDate: input.dueDate,
    documentNumber: input.documentNumber?.trim() || undefined,
    barcode: input.barcode?.trim() || undefined,
    notes: input.notes?.trim() || undefined,
    recurring: existing.installmentGroupId ? false : Boolean(input.recurring),
  });
  return delay(updated);
}

export interface SettleInput {
  date: string; // ISO
  paymentMethod: PaymentMethod;
}

/** Marca como paga. Se for recorrente, devolve também a próxima ocorrência gerada. */
export async function payPayable(id: string, input: SettleInput) {
  const existing = payables.get(id);
  if (!existing) throw new MockError("Conta não encontrada", 404);
  if (existing.status === "paid") throw new MockError("Esta conta já está paga");
  if (existing.status === "cancelled") throw new MockError("Conta cancelada não pode ser paga");
  const paid = payables.update(id, { status: "paid", paidDate: input.date, paymentMethod: input.paymentMethod });
  let next: AccountPayable | null = null;
  if (existing.recurring) {
    const { _id, paidDate, paymentMethod, ...template } = existing;
    void _id;
    void paidDate;
    void paymentMethod;
    next = payables.insert({
      ...template,
      dueDate: addMonths(new Date(existing.dueDate), 1).toISOString(),
      status: "pending",
      createdAt: new Date().toISOString(),
    });
  }
  return delay({ paid, next });
}

export async function cancelPayable(id: string) {
  const existing = payables.get(id);
  if (!existing) throw new MockError("Conta não encontrada", 404);
  if (existing.status === "paid") throw new MockError("Contas pagas não podem ser canceladas");
  return delay(payables.update(id, { status: "cancelled" }));
}

export async function deletePayable(id: string) {
  payables.remove(id);
  return delay(true);
}

/** Exclui todas as parcelas em aberto/canceladas do grupo (as pagas ficam no histórico). */
export async function deletePayableGroup(groupId: string) {
  const items = payables.find((b) => b.installmentGroupId === groupId && b.status !== "paid");
  items.forEach((b) => payables.remove(b._id));
  return delay(items.length);
}
