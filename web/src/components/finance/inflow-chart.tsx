"use client";

import { Bar, BarChart, CartesianGrid, XAxis } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { formatCurrency } from "@/lib/format";
import type { ProjectionPoint } from "@/lib/services/receivables";

const config = {
  amount: { label: "Previsto", color: "var(--chart-2)" },
} satisfies ChartConfig;

/** Barras diárias de entradas previstas (uma série, sem legenda). */
export function InflowChart({ data }: { data: ProjectionPoint[] }) {
  return (
    <ChartContainer config={config} className="aspect-auto h-40 w-full">
      <BarChart data={data} margin={{ top: 4, left: 0, right: 0, bottom: 0 }} barCategoryGap={2}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={6} interval={6} fontSize={11} />
        <ChartTooltip
          cursor={{ fillOpacity: 0.4 }}
          content={
            <ChartTooltipContent
              labelFormatter={(_, payload) => {
                const point = payload?.[0]?.payload as ProjectionPoint | undefined;
                return point ? new Date(`${point.date}T12:00:00`).toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "short" }) : "";
              }}
              formatter={(value) => (
                <div className="flex w-full items-center justify-between gap-3">
                  <span className="text-muted-foreground">Previsto</span>
                  <span className="tabular font-medium text-foreground">{formatCurrency(Number(value))}</span>
                </div>
              )}
            />
          }
        />
        <Bar dataKey="amount" fill="var(--color-amount)" radius={[4, 4, 0, 0]} maxBarSize={18} />
      </BarChart>
    </ChartContainer>
  );
}
