"use client";

import type { Dre } from "@/lib/services/analytics";
import { formatCurrency, formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";

export const DRE_LINES: { key: keyof Dre; label: string; sign?: "-" | "+"; strong?: boolean; hint?: string }[] = [
  { key: "receitaBruta", label: "Receita bruta", hint: "Vendas finalizadas antes dos descontos" },
  { key: "descontos", label: "Descontos concedidos", sign: "-" },
  { key: "receitaLiquida", label: "Receita líquida", strong: true },
  { key: "cmv", label: "CMV (custo das mercadorias)", sign: "-", hint: "Preço de custo × quantidade vendida" },
  { key: "lucroBruto", label: "Lucro bruto", strong: true },
  { key: "despesasPagas", label: "Despesas pagas", sign: "-", hint: "Contas a pagar quitadas no período" },
  { key: "outrosRecebimentos", label: "Recebimentos de contas", sign: "+", hint: "Contas a receber quitadas no período" },
  { key: "resultado", label: "Resultado do período", strong: true },
];

/** DRE simplificado em formato de demonstrativo vertical, com % sobre a receita líquida. */
export function DreStatement({ dre, className }: { dre: Dre; className?: string }) {
  const base = dre.receitaLiquida || 0;
  return (
    <div className={cn("divide-y rounded-lg border", className)}>
      {DRE_LINES.map((line) => {
        const value = dre[line.key];
        const isResult = line.key === "resultado";
        return (
          <div
            key={line.key}
            className={cn(
              "flex items-center gap-3 px-4 py-2.5 text-sm",
              line.strong && "bg-muted/40 font-medium",
              isResult && "bg-muted/70",
            )}
          >
            <div className="min-w-0 flex-1">
              <p className={cn(!line.strong && "text-muted-foreground")}>
                {line.sign && <span className="mr-1.5 inline-block w-2 font-mono">{line.sign === "-" ? "−" : "+"}</span>}
                {line.label}
              </p>
              {line.hint && <p className="text-xs text-muted-foreground/80">{line.hint}</p>}
            </div>
            <span className="hidden w-16 text-right text-xs text-muted-foreground tabular-nums sm:block">
              {base ? formatPercent(value / base) : "—"}
            </span>
            <span
              className={cn(
                "w-32 text-right tabular-nums",
                line.sign === "-" && value > 0 && "text-muted-foreground",
                isResult && "text-base font-semibold",
                isResult && (value >= 0 ? "text-success" : "text-destructive"),
              )}
            >
              {line.sign === "-" && value > 0 ? `(${formatCurrency(value)})` : formatCurrency(value)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
