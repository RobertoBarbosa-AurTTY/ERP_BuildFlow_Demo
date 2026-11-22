// Configurações da empresa e utilidades de dados da demonstração.
import type { CompanySettings } from "@/lib/domain/types";
import * as mockCollections from "@/lib/mock/collections";
import { DEFAULT_SETTINGS, settings } from "@/lib/mock/collections";
import { Collection, delay, MockError, resetMockData } from "@/lib/mock/db";
import { onlyDigits } from "@/lib/format";
import { isValidCnpj } from "./customers";

const SETTINGS_ID = "company";

export async function getSettings(): Promise<CompanySettings> {
  const doc = settings.get(SETTINGS_ID);
  if (!doc) return delay({ ...DEFAULT_SETTINGS });
  const { _id, ...rest } = doc;
  void _id;
  return delay({ ...DEFAULT_SETTINGS, ...rest });
}

export async function updateSettings(patch: Partial<CompanySettings>) {
  const current = { ...DEFAULT_SETTINGS, ...(settings.get(SETTINGS_ID) ?? {}) };
  const next: CompanySettings = { ...current, ...patch };
  if (!next.companyName.trim()) throw new MockError("Razão social é obrigatória");
  if (!next.tradeName.trim()) throw new MockError("Nome fantasia é obrigatório");
  next.cnpj = onlyDigits(next.cnpj);
  if (!isValidCnpj(next.cnpj)) throw new MockError("CNPJ inválido");
  if (next.phone) next.phone = onlyDigits(next.phone);
  if (next.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(next.email)) throw new MockError("E-mail inválido");
  next.expiryAlertDays = Math.max(0, Math.min(365, Math.round(Number(next.expiryAlertDays) || 0)));

  if (settings.get(SETTINGS_ID)) settings.update(SETTINGS_ID, next);
  else settings.insert({ _id: SETTINGS_ID, ...next });
  const { _id, ...saved } = settings.get(SETTINGS_ID)!;
  void _id;
  return delay(saved as CompanySettings);
}

/** Snapshot de todas as coleções simuladas, pronto para virar um JSON. */
export async function exportMockData() {
  const data: Record<string, unknown[]> = {};
  for (const value of Object.values(mockCollections)) {
    if (value instanceof Collection) data[value.name] = value.all();
  }
  return delay({ app: "BuildFlow ERP", version: 1, exportedAt: new Date().toISOString(), data });
}

export async function restoreDemoData() {
  resetMockData();
  return delay(true, 400);
}
