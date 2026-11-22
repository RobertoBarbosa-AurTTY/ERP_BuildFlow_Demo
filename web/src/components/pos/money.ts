/** Converte texto digitado ("1.234,56", "10,5", "10.5") em número. NaN se inválido. */
export function parseMoney(value: string): number {
  const raw = value.trim().replace(/[R$\s]/g, "");
  if (!raw) return NaN;
  const normalized = raw.includes(",") ? raw.replace(/\./g, "").replace(",", ".") : raw;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : NaN;
}

/** Número → texto editável no padrão brasileiro ("12,50"). */
export function moneyInput(value: number) {
  return value.toFixed(2).replace(".", ",");
}
