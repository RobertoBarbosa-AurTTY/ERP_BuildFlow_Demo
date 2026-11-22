import type { ProductUnit } from "@/lib/domain/types";

export const UNITS: { value: ProductUnit; label: string }[] = [
  { value: "UN", label: "UN — Unidade" },
  { value: "PC", label: "PC — Peça" },
  { value: "CX", label: "CX — Caixa" },
  { value: "SC", label: "SC — Saco" },
  { value: "KG", label: "KG — Quilograma" },
  { value: "M", label: "M — Metro" },
  { value: "M2", label: "M² — Metro quadrado" },
  { value: "M3", label: "M³ — Metro cúbico" },
  { value: "L", label: "L — Litro" },
];

export function toUnit(value: string | undefined | null): ProductUnit {
  const clean = String(value ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  const aliases: Record<string, ProductUnit> = { UND: "UN", UNID: "UN", PCA: "PC", PECA: "PC", SACO: "SC", MT: "M", MTS: "M", LT: "L", CAIXA: "CX" };
  const unit = aliases[clean] ?? clean;
  return (UNITS.some((u) => u.value === unit) ? unit : "UN") as ProductUnit;
}

/** Converte "1.234,56" ou "1234.56" em número. Retorna NaN se vazio/inválido. */
export function parseDecimal(value: string | number | null | undefined): number {
  if (typeof value === "number") return value;
  let s = String(value ?? "").trim().replace(/R\$\s*/i, "");
  if (!s) return NaN;
  if (s.includes(",") && s.includes(".")) s = s.replace(/\./g, "").replace(",", ".");
  else if (s.includes(",")) s = s.replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

/** Número para campo de texto editável (vírgula decimal). */
export function decimalInput(value: number | undefined | null) {
  if (value === undefined || value === null || Number.isNaN(value)) return "";
  return String(value).replace(".", ",");
}
