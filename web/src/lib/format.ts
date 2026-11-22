const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const num = new Intl.NumberFormat("pt-BR");
const pct = new Intl.NumberFormat("pt-BR", { style: "percent", maximumFractionDigits: 1 });

export const formatCurrency = (value: number | null | undefined) => brl.format(Number(value) || 0);
export const formatNumber = (value: number | null | undefined) => num.format(Number(value) || 0);
/** Recebe fração (0.153 → 15,3%). */
export const formatPercent = (value: number | null | undefined) => pct.format(Number(value) || 0);

export function formatDate(value: string | number | Date | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("pt-BR", { timeZone: "America/Maceio" });
}

export function formatDateTime(value: string | number | Date | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("pt-BR", {
    timeZone: "America/Maceio",
    dateStyle: "short",
    timeStyle: "short",
  });
}

/** YYYY-MM-DD no fuso local, para <input type="date">. */
export function toDateInput(value: Date = new Date()) {
  const offset = value.getTimezoneOffset();
  return new Date(value.getTime() - offset * 60_000).toISOString().slice(0, 10);
}

export function onlyDigits(value: string) {
  return value.replace(/\D/g, "");
}

export function formatDocument(value: string | null | undefined) {
  const digits = onlyDigits(value ?? "");
  if (digits.length === 11) return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  if (digits.length === 14)
    return digits.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  return value ?? "";
}

export function formatPhone(value: string | null | undefined) {
  const digits = onlyDigits(value ?? "");
  if (digits.length === 11) return digits.replace(/(\d{2})(\d{5})(\d{4})/, "($1) $2-$3");
  if (digits.length === 10) return digits.replace(/(\d{2})(\d{4})(\d{4})/, "($1) $2-$3");
  return value ?? "";
}

export function initials(name: string | null | undefined) {
  return (
    String(name ?? "")
      .trim()
      .split(/\s+/)
      .map((part) => part[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() || "U"
  );
}
