"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Bar, CartesianGrid, ComposedChart, Line, ReferenceLine, XAxis, YAxis } from "recharts";
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  ChevronRight,
  Landmark,
  RotateCw,
  Scale,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { StatusBadge } from "@/components/status-badge";
import { EmptyState, ErrorState } from "@/components/query-state";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, type ChartConfig } from "@/components/ui/chart";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { MoneyTooltipContent, formatCompactCurrency } from "@/components/analytics/chart-helpers";
import { DRE_LINES } from "@/components/analytics/dre-table";
import { parseDayKey } from "@/lib/services/analytics";
import {
  CASH_FLOW_DAYS,
  getCashFlow,
  getCashFlowDay,
  type CashFlowData,
  type CashFlowDay,
  type DayEntry,
} from "@/lib/services/cash-flow";
import { formatCurrency, formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

type View = "past" | "future" | "all";

const VIEW_LABEL: Record<View, string> = {
  past: "Realizado",
  future: "Projeção",
  all: "60 dias",
};

const chartConfig = {
  entradaRealizada: { label: "Entradas realizadas", color: "var(--chart-2)" },
  entradaPrevista: { label: "Entradas previstas", color: "color-mix(in oklch, var(--chart-2) 45%, transparent)" },
  saidaRealizada: { label: "Saídas realizadas", color: "var(--chart-4)" },
  saidaPrevista: { label: "Saídas previstas", color: "color-mix(in oklch, var(--chart-4) 45%, transparent)" },
  saldoAcumulado: { label: "Saldo acumulado", color: "var(--chart-1)" },
} satisfies ChartConfig;

function weekdayLabel(key: string) {
  return parseDayKey(key).toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" });
}

function longDayLabel(key: string) {
  return parseDayKey(key).toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });
}

function signedClass(value: number) {
  if (value > 0) return "text-success";
  if (value < 0) return "text-destructive";
  return "text-muted-foreground";
}

export function CashFlowView() {
  const [view, setView] = useState<View>("future");
  const [hideEmpty, setHideEmpty] = useState(true);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  // dados agregados de vários domínios: sempre revalidar ao abrir a tela
  const query = useQuery({ queryKey: ["cash-flow"], queryFn: getCashFlow, staleTime: 0 });
  const data = query.data;
  const loading = query.isPending;

  const days = useMemo(() => {
    const list = data?.days ?? [];
    if (view === "past") return list.filter((d) => !d.isFuture);
    if (view === "future") return list.filter((d) => d.isToday || d.isFuture);
    return list;
  }, [data, view]);

  return (
    <>
      <PageHeader
        title="Fluxo de caixa"
        description={`Realizado nos últimos ${CASH_FLOW_DAYS} dias e projeção para os próximos ${CASH_FLOW_DAYS}`}
        actions={
          <Button variant="outline" onClick={() => query.refetch()} disabled={query.isFetching}>
            <RotateCw className={cn(query.isFetching && "animate-spin")} />
            Atualizar
          </Button>
        }
      />

      {query.isError && !data ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      ) : (
        <>
          <Kpis data={data} loading={loading} />

          {data && (data.totals.overduePayable > 0 || data.totals.overdueReceivable > 0) && (
            <Alert>
              <AlertTriangle className="text-warning" />
              <AlertTitle>Contas vencidas em aberto</AlertTitle>
              <AlertDescription>
                <p>
                  {data.totals.overdueReceivable > 0 && (
                    <>
                      <Link href="/receivables" className="font-medium text-success underline-offset-4 hover:underline">
                        {formatCurrency(data.totals.overdueReceivable)} a receber
                      </Link>
                      {data.totals.overduePayable > 0 && " e "}
                    </>
                  )}
                  {data.totals.overduePayable > 0 && (
                    <Link href="/bills" className="font-medium text-destructive underline-offset-4 hover:underline">
                      {formatCurrency(data.totals.overduePayable)} a pagar
                    </Link>
                  )}{" "}
                  estão vencidos. Na projeção eles são considerados no dia de hoje.
                </p>
              </AlertDescription>
            </Alert>
          )}

          <Card>
            <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="space-y-1">
                <CardTitle>Movimento diário</CardTitle>
                <CardDescription>Entradas e saídas por dia com saldo acumulado do período</CardDescription>
              </div>
              <ToggleGroup
                type="single"
                variant="outline"
                size="sm"
                spacing={0}
                value={view}
                onValueChange={(v) => v && setView(v as View)}
                aria-label="Período do gráfico"
              >
                {(Object.keys(VIEW_LABEL) as View[]).map((v) => (
                  <ToggleGroupItem key={v} value={v} className="px-3">
                    {VIEW_LABEL[v]}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </CardHeader>
            <CardContent>
              {loading ? (
                <Skeleton className="h-[320px] w-full" />
              ) : (
                <FlowChart days={days} todayLabel={data?.days.find((d) => d.isToday)?.label} />
              )}
            </CardContent>
          </Card>

          <div className="grid gap-6 xl:grid-cols-5">
            <Card className="xl:col-span-3">
              <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-1">
                  <CardTitle>Dia a dia</CardTitle>
                  <CardDescription>Clique em um dia para ver os lançamentos</CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Switch id="hide-empty" size="sm" checked={hideEmpty} onCheckedChange={setHideEmpty} />
                  <Label htmlFor="hide-empty" className="text-sm font-normal text-muted-foreground">
                    Ocultar dias sem movimento
                  </Label>
                </div>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="space-y-2">
                    {Array.from({ length: 8 }).map((_, i) => (
                      <Skeleton key={i} className="h-9 w-full" />
                    ))}
                  </div>
                ) : (
                  <DaysTable days={days} hideEmpty={hideEmpty} onSelect={setSelectedDay} />
                )}
              </CardContent>
            </Card>
            <MonthlyDre data={data} loading={loading} />
          </div>
        </>
      )}

      <DayDetailSheet dayKey={selectedDay} onClose={() => setSelectedDay(null)} />
    </>
  );
}

function Kpis({ data, loading }: { data: CashFlowData | undefined; loading: boolean }) {
  const t = data?.totals;
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard
        label={`Saldo realizado · ${CASH_FLOW_DAYS} dias`}
        icon={Landmark}
        loading={loading}
        value={<span className={t ? signedClass(t.saldoRealizado) : undefined}>{formatCurrency(t?.saldoRealizado)}</span>}
        hint={t && `${formatCurrency(t.entradasRealizadas)} entradas · ${formatCurrency(t.saidasRealizadas)} saídas`}
      />
      <StatCard
        label="Entradas previstas"
        icon={TrendingUp}
        tone="success"
        loading={loading}
        value={formatCurrency(t?.entradasPrevistas)}
        hint="Contas a receber em aberto"
      />
      <StatCard
        label="Saídas previstas"
        icon={TrendingDown}
        tone="destructive"
        loading={loading}
        value={formatCurrency(t?.saidasPrevistas)}
        hint="Contas a pagar em aberto"
      />
      <StatCard
        label="Saldo projetado"
        icon={Scale}
        tone={t && t.saldoProjetado < 0 ? "destructive" : "default"}
        loading={loading}
        value={<span className={t ? signedClass(t.saldoProjetado) : undefined}>{formatCurrency(t?.saldoProjetado)}</span>}
        hint={
          t?.menorSaldo &&
          `Menor saldo: ${formatCurrency(t.menorSaldo.value)} em ${parseDayKey(t.menorSaldo.key).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}`
        }
      />
    </div>
  );
}

function FlowChart({ days, todayLabel }: { days: CashFlowDay[]; todayLabel?: string }) {
  const chartData = days.map((d) => ({
    ...d,
    saidaRealizada: -d.saidaRealizada,
    saidaPrevista: -d.saidaPrevista,
  }));
  if (!days.some((d) => d.entradaRealizada || d.entradaPrevista || d.saidaRealizada || d.saidaPrevista)) {
    return <div className="flex h-[320px] items-center justify-center text-sm text-muted-foreground">Sem movimentação no período.</div>;
  }
  return (
    <ChartContainer config={chartConfig} className="aspect-auto h-[320px] w-full">
      <ComposedChart data={chartData} stackOffset="sign" margin={{ left: 4, right: 8, top: 8 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} minTickGap={20} />
        <YAxis tickLine={false} axisLine={false} width={68} tickFormatter={(v: number) => formatCompactCurrency(v)} />
        <ReferenceLine y={0} stroke="var(--border)" />
        {todayLabel && days.some((d) => d.label === todayLabel) && (
          <ReferenceLine
            x={todayLabel}
            stroke="var(--muted-foreground)"
            strokeDasharray="4 4"
            label={{ value: "Hoje", position: "insideTopLeft", fill: "var(--muted-foreground)", fontSize: 11 }}
          />
        )}
        <ChartTooltip
          content={
            <MoneyTooltipContent
              config={chartConfig}
              absKeys={["saidaRealizada", "saidaPrevista"]}
              hideZero
              indicator="dot"
            />
          }
        />
        <ChartLegend content={<ChartLegendContent className="flex-wrap" />} />
        <Bar dataKey="entradaRealizada" stackId="flow" fill="var(--color-entradaRealizada)" />
        <Bar dataKey="entradaPrevista" stackId="flow" fill="var(--color-entradaPrevista)" stroke="var(--chart-2)" strokeDasharray="3 2" />
        <Bar dataKey="saidaRealizada" stackId="flow" fill="var(--color-saidaRealizada)" />
        <Bar dataKey="saidaPrevista" stackId="flow" fill="var(--color-saidaPrevista)" stroke="var(--chart-4)" strokeDasharray="3 2" />
        <Line dataKey="saldoAcumulado" type="monotone" stroke="var(--color-saldoAcumulado)" strokeWidth={2} dot={false} />
      </ComposedChart>
    </ChartContainer>
  );
}

function Money({ value, muted, className }: { value: number; muted?: boolean; className?: string }) {
  if (!value) return <span className="text-muted-foreground/50">—</span>;
  return <span className={cn("tabular-nums", muted && "text-muted-foreground italic", className)}>{formatCurrency(value)}</span>;
}

function DaysTable({ days, hideEmpty, onSelect }: { days: CashFlowDay[]; hideEmpty: boolean; onSelect: (key: string) => void }) {
  const rows = [...days]
    .filter((d) => !hideEmpty || d.isToday || d.entradaRealizada || d.entradaPrevista || d.saidaRealizada || d.saidaPrevista)
    .reverse();
  if (!rows.length) return <EmptyState title="Sem movimentação" description="Nenhum dia com lançamentos neste período." />;
  return (
    <div className="max-h-[560px] overflow-y-auto">
      <Table>
        <TableHeader className="sticky top-0 z-10 bg-card">
          <TableRow>
            <TableHead>Dia</TableHead>
            <TableHead className="text-right">Entradas</TableHead>
            <TableHead className="text-right">Saídas</TableHead>
            <TableHead className="hidden text-right sm:table-cell">Saldo do dia</TableHead>
            <TableHead className="text-right">Acumulado</TableHead>
            <TableHead className="w-6" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((d) => {
            const entradas = d.entradaRealizada + d.entradaPrevista;
            const saidas = d.saidaRealizada + d.saidaPrevista;
            const projected = d.entradaPrevista + d.saidaPrevista > 0;
            return (
              <TableRow
                key={d.key}
                className={cn("cursor-pointer", d.isToday && "bg-primary/5")}
                onClick={() => onSelect(d.key)}
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelect(d.key);
                  }
                }}
              >
                <TableCell>
                  <div className="flex items-center gap-2">
                    <span className="font-medium capitalize">{weekdayLabel(d.key)}</span>
                    {d.isToday && <StatusBadge tone="info">Hoje</StatusBadge>}
                    {!d.isToday && d.isFuture && projected && <StatusBadge>Previsto</StatusBadge>}
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  <Money value={entradas} className="text-success" muted={d.isFuture} />
                </TableCell>
                <TableCell className="text-right">
                  <Money value={saidas} className="text-destructive" muted={d.isFuture} />
                </TableCell>
                <TableCell className={cn("hidden text-right tabular-nums sm:table-cell", signedClass(d.saldoDia))}>
                  {formatCurrency(d.saldoDia)}
                </TableCell>
                <TableCell className={cn("text-right font-medium tabular-nums", d.saldoAcumulado < 0 && "text-destructive")}>
                  {formatCurrency(d.saldoAcumulado)}
                </TableCell>
                <TableCell>
                  <ChevronRight className="size-4 text-muted-foreground" />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

function MonthlyDre({ data, loading }: { data: CashFlowData | undefined; loading: boolean }) {
  const months = data?.months ?? [];
  return (
    <Card className="xl:col-span-2">
      <CardHeader>
        <CardTitle>Resultado mensal</CardTitle>
        <CardDescription>DRE simplificado por mês (até 6 meses)</CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="sticky left-0 z-10 bg-card">Linha</TableHead>
                  {months.map((m) => (
                    <TableHead key={m.key} className="text-right capitalize">
                      {m.label}
                      {m.partial && <span className="block text-[10px] font-normal text-muted-foreground normal-case">parcial</span>}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {DRE_LINES.map((line) => (
                  <TableRow key={line.key} className={cn(line.strong && "bg-muted/40 font-medium")}>
                    <TableCell className={cn("sticky left-0 z-10 bg-card whitespace-nowrap", !line.strong && "text-muted-foreground")}>
                      {line.sign && <span className="mr-1 font-mono">{line.sign === "-" ? "−" : "+"}</span>}
                      {line.label}
                    </TableCell>
                    {months.map((m) => {
                      const value = m[line.key];
                      const isResult = line.key === "resultado";
                      return (
                        <TableCell
                          key={m.key}
                          className={cn(
                            "text-right whitespace-nowrap tabular-nums",
                            line.sign === "-" && "text-muted-foreground",
                            isResult && signedClass(value),
                          )}
                        >
                          {formatCurrency(value)}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

const KIND_LABEL: Record<DayEntry["kind"], string> = {
  sale: "Venda",
  receivable: "Conta a receber",
  payable: "Conta a pagar",
};

function DayDetailSheet({ dayKey, onClose }: { dayKey: string | null; onClose: () => void }) {
  const query = useQuery({
    queryKey: ["cash-flow", "day", dayKey],
    queryFn: () => getCashFlowDay(dayKey as string),
    enabled: !!dayKey,
  });
  const d = query.data;

  return (
    <Dialog open={!!dayKey} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex max-h-[90vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="gap-1 p-4 border-b">
          <DialogTitle className="capitalize">{dayKey ? longDayLabel(dayKey) : ""}</DialogTitle>
          <DialogDescription>Lançamentos realizados e previstos do dia</DialogDescription>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto p-4">
          {query.isPending ? (
            <div className="space-y-3">
              <Skeleton className="h-20 w-full" />
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : query.isError ? (
            <ErrorState error={query.error} onRetry={() => query.refetch()} />
          ) : d ? (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-success/10 p-3">
                  <p className="text-xs text-muted-foreground">Entradas</p>
                  <p className="font-semibold text-success tabular-nums">
                    {formatCurrency(d.totals.entradaRealizada + d.totals.entradaPrevista)}
                  </p>
                  {d.totals.entradaPrevista > 0 && (
                    <p className="text-xs text-muted-foreground">{formatCurrency(d.totals.entradaPrevista)} previsto</p>
                  )}
                </div>
                <div className="rounded-lg bg-destructive/10 p-3">
                  <p className="text-xs text-muted-foreground">Saídas</p>
                  <p className="font-semibold text-destructive tabular-nums">
                    {formatCurrency(d.totals.saidaRealizada + d.totals.saidaPrevista)}
                  </p>
                  {d.totals.saidaPrevista > 0 && (
                    <p className="text-xs text-muted-foreground">{formatCurrency(d.totals.saidaPrevista)} previsto</p>
                  )}
                </div>
                <div className="col-span-2 flex items-center justify-between rounded-lg border px-3 py-2.5">
                  <span className="text-sm text-muted-foreground">Saldo do dia</span>
                  <span className={cn("font-semibold tabular-nums", signedClass(d.totals.saldo))}>{formatCurrency(d.totals.saldo)}</span>
                </div>
              </div>
              <EntryList title="Entradas" icon={ArrowDownLeft} tone="success" entries={d.entradas} />
              <Separator />
              <EntryList title="Saídas" icon={ArrowUpRight} tone="destructive" entries={d.saidas} />
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function EntryList({
  title,
  icon: Icon,
  tone,
  entries,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  tone: "success" | "destructive";
  entries: DayEntry[];
}) {
  return (
    <section className="space-y-2">
      <h3 className="flex items-center gap-2 text-sm font-medium">
        <Icon className={cn("size-4", tone === "success" ? "text-success" : "text-destructive")} />
        {title}
        <span className="text-muted-foreground">({entries.length})</span>
      </h3>
      {entries.length === 0 ? (
        <p className="py-3 text-sm text-muted-foreground">Nenhum lançamento.</p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {entries.map((e) => (
            <li key={`${e.kind}-${e.id}`} className="flex items-start gap-3 px-3 py-2.5">
              <div className="min-w-0 flex-1 space-y-0.5">
                <p className="truncate text-sm font-medium">{e.description}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {KIND_LABEL[e.kind]} · {e.party}
                  {e.method && ` · ${e.method}`}
                  {e.kind === "sale" && ` · ${formatDateTime(e.date).split(" ").pop()}`}
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <span className={cn("text-sm font-medium tabular-nums", tone === "success" ? "text-success" : "text-destructive")}>
                  {formatCurrency(e.amount)}
                </span>
                {!e.realized && <StatusBadge tone={e.overdue ? "destructive" : "warning"}>{e.overdue ? "Vencida" : "Prevista"}</StatusBadge>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
