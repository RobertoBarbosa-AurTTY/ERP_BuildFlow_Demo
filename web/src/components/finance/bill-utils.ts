// Utilitários compartilhados entre contas a pagar e a receber.
import { addMonths } from "date-fns";
import { billStatus, daysUntil } from "@/lib/domain/calc";
import type { BillStatus, InstallmentInfo } from "@/lib/domain/types";

export interface BillBase extends InstallmentInfo {
  _id: string;
  description: string;
  category: string;
  amount: number;
  dueDate: string;
  status: BillStatus;
  documentNumber?: string;
  recurring?: boolean;
  notes?: string;
}

/** Filtro de status da tela: "open" = pendentes + vencidas. */
export type StatusFilter = "all" | "open" | BillStatus;

export interface BillFilters {
  search: string;
  status: StatusFilter;
  category: string; // "all" ou nome
  party: string; // "all" ou nome do fornecedor/cliente
  from: string; // YYYY-MM-DD
  to: string; // YYYY-MM-DD
}

export const EMPTY_FILTERS: BillFilters = {
  search: "",
  status: "open",
  category: "all",
  party: "all",
  from: "",
  to: "",
};

export function normalizeText(value: string | undefined | null) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

/** "YYYY-MM-DD" → ISO ao meio-dia local (evita pular de dia por fuso). */
export function dateInputToISO(value: string) {
  return new Date(`${value}T12:00:00`).toISOString();
}

export function inputDateOf(iso: string | undefined) {
  if (!iso) return "";
  const d = new Date(iso);
  const offset = d.getTimezoneOffset();
  return new Date(d.getTime() - offset * 60_000).toISOString().slice(0, 10);
}

export function filterBills<T extends BillBase>(
  bills: T[],
  filters: BillFilters,
  getParty: (bill: T) => string,
): T[] {
  const term = normalizeText(filters.search);
  return bills.filter((bill) => {
    const status = billStatus(bill);
    if (filters.status === "open" && status !== "pending" && status !== "overdue") return false;
    if (filters.status !== "all" && filters.status !== "open" && status !== filters.status) return false;
    if (filters.category !== "all" && bill.category !== filters.category) return false;
    if (filters.party !== "all" && getParty(bill) !== filters.party) return false;
    const due = inputDateOf(bill.dueDate);
    if (filters.from && due < filters.from) return false;
    if (filters.to && due > filters.to) return false;
    if (term) {
      const haystack = normalizeText(
        [bill.description, getParty(bill), bill.category, bill.documentNumber, bill.notes].join(" "),
      );
      if (!haystack.includes(term)) return false;
    }
    return true;
  });
}

export interface BillSummary {
  pending: { total: number; count: number };
  overdue: { total: number; count: number };
  dueSoon: { total: number; count: number };
  settledThisMonth: { total: number; count: number };
}

export function summarizeBills<T extends BillBase>(bills: T[], getSettledDate: (bill: T) => string | undefined): BillSummary {
  const now = new Date();
  const acc: BillSummary = {
    pending: { total: 0, count: 0 },
    overdue: { total: 0, count: 0 },
    dueSoon: { total: 0, count: 0 },
    settledThisMonth: { total: 0, count: 0 },
  };
  const add = (slot: { total: number; count: number }, amount: number) => {
    slot.total += amount;
    slot.count += 1;
  };
  for (const bill of bills) {
    const status = billStatus(bill);
    if (status === "pending") {
      add(acc.pending, bill.amount);
      const days = daysUntil(bill.dueDate);
      if (days >= 0 && days <= 7) add(acc.dueSoon, bill.amount);
    } else if (status === "overdue") {
      add(acc.overdue, bill.amount);
    } else if (status === "paid") {
      const settled = getSettledDate(bill);
      if (settled) {
        const d = new Date(settled);
        if (d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()) add(acc.settledThisMonth, bill.amount);
      }
    }
  }
  return acc;
}

/** Divide o total em N parcelas de centavos inteiros; a última absorve o resto. */
export function splitInstallments(total: number, count: number) {
  const cents = Math.round(total * 100);
  const base = Math.floor(cents / count);
  return Array.from({ length: count }, (_, i) => (i === count - 1 ? cents - base * (count - 1) : base) / 100);
}

export function installmentDueDates(firstDueISO: string, count: number) {
  const first = new Date(firstDueISO);
  return Array.from({ length: count }, (_, i) => addMonths(first, i).toISOString());
}

const INSTALLMENT_SUFFIX = /\s*-\s*parcela\s+\d+\/\d+\s*$/i;

export function baseDescription(description: string) {
  return description.replace(INSTALLMENT_SUFFIX, "");
}

export function installmentDescription(description: string, n: number, total: number) {
  return `${baseDescription(description)} - parcela ${n}/${total}`;
}

/** Texto curto "vence em 3 dias", "venceu há 2 dias"… com o tom adequado. */
export function dueInLabel(bill: BillBase): { text: string; tone: "muted" | "warning" | "destructive" } {
  const status = billStatus(bill);
  if (status === "paid" || status === "cancelled") return { text: "—", tone: "muted" };
  const days = daysUntil(bill.dueDate);
  if (days < 0) return { text: days === -1 ? "Venceu ontem" : `Venceu há ${-days} dias`, tone: "destructive" };
  if (days === 0) return { text: "Vence hoje", tone: "warning" };
  if (days === 1) return { text: "Vence amanhã", tone: "warning" };
  return { text: `Em ${days} dias`, tone: days <= 7 ? "warning" : "muted" };
}

export function distinctSorted(values: (string | undefined)[]) {
  return [...new Set(values.filter((v): v is string => Boolean(v && v.trim())))].sort((a, b) => a.localeCompare(b, "pt-BR"));
}
