"use client";

import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { formatCurrency, formatNumber, formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";

const compact = new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 });

/** Rótulo curto para eixos: R$ 12,5 mil. */
export function formatCompactCurrency(value: number) {
  return `R$ ${compact.format(value)}`;
}

type TooltipProps = React.ComponentProps<typeof ChartTooltipContent>;

/**
 * Conteúdo de tooltip com valores em reais (ou números puros nas séries listadas em `countKeys`).
 * `absKeys`: séries plotadas como negativas (saídas) mas exibidas em módulo.
 */
export function MoneyTooltipContent({
  config,
  countKeys = [],
  absKeys = [],
  hideZero = false,
  ...props
}: TooltipProps & { config: ChartConfig; countKeys?: string[]; absKeys?: string[]; hideZero?: boolean }) {
  return (
    <ChartTooltipContent
      {...props}
      formatter={(value, name, item) => {
        const key = String(item.dataKey ?? name);
        const label = config[key]?.label ?? config[String(name)]?.label ?? name;
        const color = item.color ?? item.payload?.fill;
        const raw = Number(value) || 0;
        if (hideZero && raw === 0) return null;
        const numeric = absKeys.includes(key) ? Math.abs(raw) : raw;
        return (
          <div className="flex w-full items-center gap-2">
            <span className="size-2.5 shrink-0 rounded-[2px]" style={{ backgroundColor: color }} />
            <span className="text-muted-foreground">{label}</span>
            <span className="ml-auto pl-3 font-mono font-medium text-foreground tabular-nums">
              {countKeys.includes(key) ? formatNumber(numeric) : formatCurrency(numeric)}
            </span>
          </div>
        );
      }}
    />
  );
}

/** Variação percentual (fração) com seta e cor semântica. */
export function DeltaBadge({
  current,
  previous,
  invert = false,
  className,
}: {
  current: number;
  previous: number;
  invert?: boolean;
  className?: string;
}) {
  if (!previous) {
    return <span className={cn("text-muted-foreground", className)}>sem base de comparação</span>;
  }
  const change = (current - previous) / Math.abs(previous);
  const flat = Math.abs(change) < 0.005;
  const good = invert ? change < 0 : change > 0;
  const Icon = flat ? Minus : change > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 font-medium",
        flat ? "text-muted-foreground" : good ? "text-success" : "text-destructive",
        className,
      )}
    >
      <Icon className="size-3.5" />
      {formatPercent(Math.abs(change))}
    </span>
  );
}

/** Barra horizontal de participação, útil em listas de ranking. */
export function ShareBar({ value, className, color = "var(--chart-1)" }: { value: number; className?: string; color?: string }) {
  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-muted", className)}>
      <div className="h-full rounded-full" style={{ width: `${Math.max(2, Math.min(100, value * 100))}%`, backgroundColor: color }} />
    </div>
  );
}

export const CHART_COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)", "var(--muted-foreground)"];

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

type Cell = string | number | null | undefined;

function csvCell(value: Cell) {
  if (value === null || value === undefined) return "";
  const text = typeof value === "number" ? String(value).replace(".", ",") : value;
  return /[";\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Gera e baixa um CSV (separador ";" e BOM, para abrir direto no Excel em pt-BR). */
export function downloadCsv(filename: string, headers: string[], rows: Cell[][]) {
  const content = [headers, ...rows].map((r) => r.map(csvCell).join(";")).join("\r\n");
  const blob = new Blob(["﻿" + content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
