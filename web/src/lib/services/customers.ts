// Clientes. Regras de netlify/functions/customers.js: nome obrigatório,
// e-mail único; aqui também validamos os dígitos verificadores de CPF/CNPJ.
import { billStatus } from "@/lib/domain/calc";
import type { AccountReceivable, Customer, Sale } from "@/lib/domain/types";
import { onlyDigits } from "@/lib/format";
import { customers, receivables, sales } from "@/lib/mock/collections";
import { delay, MockError } from "@/lib/mock/db";

// ---------------------------------------------------------------------------
// Validação de documentos

export function isValidCpf(value: string) {
  const cpf = onlyDigits(value);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  const digit = (len: number) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(cpf[i]) * (len + 1 - i);
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };
  return digit(9) === Number(cpf[9]) && digit(10) === Number(cpf[10]);
}

export function isValidCnpj(value: string) {
  const cnpj = onlyDigits(value);
  if (cnpj.length !== 14 || /^(\d)\1{13}$/.test(cnpj)) return false;
  const digit = (len: number) => {
    const weights = len === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const sum = weights.reduce((acc, w, i) => acc + Number(cnpj[i]) * w, 0);
    const rest = sum % 11;
    return rest < 2 ? 0 : 11 - rest;
  };
  return digit(12) === Number(cnpj[12]) && digit(13) === Number(cnpj[13]);
}

/** Vazio é válido (documento opcional). */
export function documentError(value: string | undefined | null): string | null {
  const digits = onlyDigits(value ?? "");
  if (!digits) return null;
  if (digits.length === 11) return isValidCpf(digits) ? null : "CPF inválido";
  if (digits.length === 14) return isValidCnpj(digits) ? null : "CNPJ inválido";
  return "Informe um CPF (11 dígitos) ou CNPJ (14 dígitos)";
}

export function documentKind(value: string | undefined | null): "PF" | "PJ" | null {
  const len = onlyDigits(value ?? "").length;
  if (len === 11) return "PF";
  if (len === 14) return "PJ";
  return null;
}

// ---------------------------------------------------------------------------
// Consultas

function normalize(value: string | undefined | null) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

export async function listCustomers(search?: string) {
  const term = normalize(search);
  const digits = onlyDigits(search ?? "");
  const list = customers
    .all()
    .filter((c) => {
      if (!term) return true;
      if (normalize(c.name).includes(term) || normalize(c.email).includes(term)) return true;
      return digits.length >= 3 && (onlyDigits(c.cpfCnpj ?? "").includes(digits) || onlyDigits(c.phone ?? "").includes(digits));
    })
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  return delay(list);
}

export interface CustomerStats {
  totalSpent: number;
  purchaseCount: number;
  lastPurchase: string | null;
  openReceivables: number;
  overdueReceivables: number;
}

function emptyStats(): CustomerStats {
  return { totalSpent: 0, purchaseCount: 0, lastPurchase: null, openReceivables: 0, overdueReceivables: 0 };
}

function computeStats(): Record<string, CustomerStats> {
  const stats: Record<string, CustomerStats> = {};
  for (const sale of sales.all()) {
    if (!sale.customerId || sale.status !== "FINALIZED") continue;
    const s = (stats[sale.customerId] ??= emptyStats());
    s.totalSpent += sale.total;
    s.purchaseCount += 1;
    if (!s.lastPurchase || sale.createdAt > s.lastPurchase) s.lastPurchase = sale.createdAt;
  }
  for (const bill of receivables.all()) {
    if (!bill.customerId) continue;
    const status = billStatus(bill);
    if (status !== "pending" && status !== "overdue") continue;
    const s = (stats[bill.customerId] ??= emptyStats());
    s.openReceivables += bill.amount;
    if (status === "overdue") s.overdueReceivables += bill.amount;
  }
  return stats;
}

/** Totais por cliente (compras finalizadas e contas a receber em aberto). */
export async function getCustomerStats() {
  return delay(computeStats());
}

export interface CustomerDetail {
  customer: Customer;
  stats: CustomerStats;
  sales: Sale[];
  receivables: AccountReceivable[];
}

export async function getCustomerDetail(id: string) {
  const customer = customers.get(id);
  if (!customer) throw new MockError("Cliente não encontrado", 404);
  const history = sales
    .find((s) => s.customerId === id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const open = receivables
    .find((r) => r.customerId === id && r.status === "pending")
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const detail: CustomerDetail = {
    customer,
    stats: computeStats()[id] ?? emptyStats(),
    sales: history,
    receivables: open,
  };
  return delay(detail);
}

// ---------------------------------------------------------------------------
// Escrita

export interface CustomerInput {
  name: string;
  cpfCnpj?: string;
  email?: string;
  phone?: string;
  address?: string;
  notes?: string;
  active?: boolean;
}

function normalizeInput(input: CustomerInput, existing?: Customer) {
  const name = input.name.trim();
  if (!name) throw new MockError("Nome é obrigatório");
  const cpfCnpj = onlyDigits(input.cpfCnpj ?? "");
  // Documento antigo inválido não bloqueia a edição de outros campos.
  if (cpfCnpj !== onlyDigits(existing?.cpfCnpj ?? "")) {
    const error = documentError(cpfCnpj);
    if (error) throw new MockError(error);
  }
  const email = input.email?.trim().toLowerCase() || undefined;
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new MockError("E-mail inválido");
  if (email && customers.find((c) => c.email === email && c._id !== existing?._id).length)
    throw new MockError("Já existe um cliente com esse e-mail", 409);
  if (cpfCnpj && customers.find((c) => onlyDigits(c.cpfCnpj ?? "") === cpfCnpj && c._id !== existing?._id).length)
    throw new MockError("Já existe um cliente com esse CPF/CNPJ", 409);
  return {
    name,
    cpfCnpj: cpfCnpj || undefined,
    email,
    phone: onlyDigits(input.phone ?? "") || undefined,
    address: input.address?.trim() || undefined,
    notes: input.notes?.trim() || undefined,
    active: input.active ?? existing?.active ?? true,
  };
}

export async function createCustomer(input: CustomerInput) {
  const data = normalizeInput(input);
  return delay(customers.insert({ ...data, createdAt: new Date().toISOString() }));
}

export async function updateCustomer(id: string, input: CustomerInput) {
  const existing = customers.get(id);
  if (!existing) throw new MockError("Cliente não encontrado", 404);
  return delay(customers.update(id, normalizeInput(input, existing)));
}

export async function deleteCustomer(id: string) {
  const open = receivables.find((r) => r.customerId === id && r.status === "pending");
  if (open.length) throw new MockError("Cliente possui contas a receber em aberto e não pode ser excluído", 409);
  customers.remove(id);
  return delay(true);
}
