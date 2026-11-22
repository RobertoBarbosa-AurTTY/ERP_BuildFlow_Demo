"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Area, AreaChart, CartesianGrid, Cell, Pie, PieChart, XAxis, YAxis } from "recharts";
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  CircleDollarSign,
  PackageX,
  Receipt,
  RotateCw,
  ShoppingBag,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { StatusBadge } from "@/components/status-badge";
import { EmptyState, ErrorState } from "@/components/query-state";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, type ChartConfig } from "@/components/ui/chart";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  CHART_COLORS,
  DeltaBadge,
  MoneyTooltipContent,
  ShareBar,
  formatCompactCurrency,
} from "@/components/analytics/chart-helpers";
import { DASHBOARD_PERIOD_LABEL, getDashboard, type DashboardData, type DashboardPeriod } from "@/lib/services/analytics";
import { formatCurrency, formatDate, formatDateTime, formatNumber, formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";

const PERIODS = Object.keys(DASHBOARD_PERIOD_LABEL) as DashboardPeriod[];

const revenueConfig = {
  revenue: { label: "Faturamento", color: "var(--chart-1)" },
  profit: { label: "Lucro estimado", color: "var(--chart-2)" },
} satisfies ChartConfig;

export function DashboardView() {
  const [period, setPeriod] = useState<DashboardPeriod>("30d");
  const query = useQuery({
    queryKey: ["dashboard", period],
    queryFn: () => getDashboard(period),
    // dados agregados de vários domínios: sempre revalidar ao abrir a tela
    staleTime: 0,
    placeholderData: (prev) => prev,
  });
  const data = query.data;
  const loading = query.isPending;

  return (
    <>
      <PageHeader
        title="Dashboard"
        description={`Visão geral da loja · ${DASHBOARD_PERIOD_LABEL[period].toLowerCase()}`}
        actions={
          <>
            <ToggleGroup
              type="single"
              variant="outline"
              size="sm"
              spacing={0}
              value={period}
              onValueChange={(v) => v && setPeriod(v as DashboardPeriod)}
              aria-label="Período"
            >
              {PERIODS.map((p) => (
                <ToggleGroupItem key={p} value={p} className="px-3">
                  {DASHBOARD_PERIOD_LABEL[p]}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
            <Button
              variant="outline"
              size="icon-sm"
              onClick={() => query.refetch()}
              disabled={query.isFetching}
              aria-label="Atualizar"
            >
              <RotateCw className={cn(query.isFetching && "animate-spin")} />
            </Button>
          </>
        }
      />

      {query.isError && !data ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      ) : (
        <div className={cn("flex flex-col gap-6 transition-opacity", query.isPlaceholderData && "opacity-60")}>
          <Kpis data={data} loading={loading} />

          <div className="grid gap-6 lg:grid-cols-3">
            <RevenueChart data={data} loading={loading} />
            <PaymentMethods data={data} loading={loading} />
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <TopProducts data={data} loading={loading} />
            <Alerts data={data} loading={loading} />
            <UpcomingBills data={data} loading={loading} />
          </div>

          <RecentSales data={data} loading={loading} />
        </div>
      )}
    </>
  );
}

interface SectionProps {
  data: DashboardData | undefined;
  loading: boolean;
}

function Kpis({ data, loading }: SectionProps) {
  const s = data?.summary;
  const p = data?.previous;
  const compare = data?.period === "today" ? "ontem" : "período anterior";
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard
        label="Faturamento"
        icon={CircleDollarSign}
        loading={loading}
        value={formatCurrency(s?.revenue)}
        hint={s && p && (<><DeltaBadge current={s.revenue} previous={p.revenue} /> vs {compare}</>)}
      />
      <StatCard
        label="Lucro estimado"
        icon={TrendingUp}
        tone="success"
        loading={loading}
        value={formatCurrency(s?.profit)}
        hint={s && <>Margem bruta de {formatPercent(s.margin)}</>}
      />
      <StatCard
        label="Ticket médio"
        icon={Receipt}
        tone="warning"
        loading={loading}
        value={formatCurrency(s?.avgTicket)}
        hint={s && p && (<><DeltaBadge current={s.avgTicket} previous={p.avgTicket} /> vs {compare}</>)}
      />
      <StatCard
        label="Vendas"
        icon={ShoppingBag}
        loading={loading}
        value={formatNumber(s?.count)}
        hint={s && p && (<><DeltaBadge current={s.count} previous={p.count} /> · {formatNumber(s.itemsSold)} itens vendidos</>)}
      />
    </div>
  );
}

function RevenueChart({ data, loading }: SectionProps) {
  const hasData = data?.series.some((d) => d.revenue > 0);
  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <CardTitle>Faturamento</CardTitle>
        <CardDescription>
          {data?.seriesBucket === "hour" ? "Vendas de hoje por hora" : "Faturamento e lucro estimado por dia"}
        </CardDescription>
        <CardAction className="hidden gap-6 text-right sm:flex">
          <MiniStat label="Hoje" value={data?.today.revenue} loading={loading} />
          <MiniStat label="Mês" value={data?.month.revenue} loading={loading} />
        </CardAction>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-[260px] w-full" />
        ) : !hasData ? (
          <div className="flex h-[260px] items-center justify-center text-sm text-muted-foreground">
            Nenhuma venda no período.
          </div>
        ) : (
          <ChartContainer config={revenueConfig} className="aspect-auto h-[260px] w-full">
            <AreaChart data={data?.series} margin={{ left: 4, right: 8, top: 8 }}>
              <defs>
                <linearGradient id="fillRevenue" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--color-revenue)" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="var(--color-revenue)" stopOpacity={0.02} />
                </linearGradient>
                <linearGradient id="fillProfit" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--color-profit)" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="var(--color-profit)" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} minTickGap={24} />
              <YAxis
                tickLine={false}
                axisLine={false}
                width={64}
                tickFormatter={(v: number) => formatCompactCurrency(v)}
              />
              <ChartTooltip cursor={false} content={<MoneyTooltipContent config={revenueConfig} indicator="dot" />} />
              <Area dataKey="revenue" type="monotone" stroke="var(--color-revenue)" strokeWidth={2} fill="url(#fillRevenue)" />
              <Area dataKey="profit" type="monotone" stroke="var(--color-profit)" strokeWidth={2} fill="url(#fillProfit)" />
            </AreaChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}

function MiniStat({ label, value, loading }: { label: string; value: number | undefined; loading: boolean }) {
  return (
    <div className="space-y-0.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      {loading ? <Skeleton className="ml-auto h-5 w-20" /> : <p className="font-semibold tabular-nums">{formatCurrency(value)}</p>}
    </div>
  );
}

function PaymentMethods({ data, loading }: SectionProps) {
  const rows = data?.payments ?? [];
  const config: ChartConfig = Object.fromEntries(
    rows.map((r, i) => [r.method, { label: r.method, color: CHART_COLORS[i % CHART_COLORS.length] }]),
  );
  return (
    <Card>
      <CardHeader>
        <CardTitle>Formas de pagamento</CardTitle>
        <CardDescription>Participação no faturamento</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {loading ? (
          <>
            <Skeleton className="mx-auto size-40 rounded-full" />
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-5 w-full" />
              ))}
            </div>
          </>
        ) : rows.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">Nenhuma venda no período.</p>
        ) : (
          <>
            <ChartContainer config={config} className="mx-auto aspect-square h-[170px]">
              <PieChart>
                <ChartTooltip content={<MoneyTooltipContent config={config} hideLabel nameKey="method" />} />
                <Pie data={rows} dataKey="total" nameKey="method" innerRadius={52} outerRadius={78} strokeWidth={2} stroke="var(--card)">
                  {rows.map((r, i) => (
                    <Cell key={r.method} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Pie>
              </PieChart>
            </ChartContainer>
            <ul className="space-y-2.5">
              {rows.map((r, i) => (
                <li key={r.method} className="flex items-center gap-2 text-sm">
                  <span className="size-2.5 shrink-0 rounded-[3px]" style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
                  <span className="flex-1 truncate">{r.method}</span>
                  <span className="text-xs text-muted-foreground tabular-nums">{formatPercent(r.share)}</span>
                  <span className="w-24 text-right font-medium tabular-nums">{formatCurrency(r.total)}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function ListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-4">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="space-y-2">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      ))}
    </div>
  );
}

function TopProducts({ data, loading }: SectionProps) {
  const rows = data?.topProducts ?? [];
  const max = Math.max(1, ...rows.map((r) => r.revenue));
  return (
    <Card>
      <CardHeader>
        <CardTitle>Produtos mais vendidos</CardTitle>
        <CardDescription>Por faturamento no período</CardDescription>
        <CardAction>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/reports">
              Relatório <ArrowRight />
            </Link>
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        {loading ? (
          <ListSkeleton />
        ) : rows.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">Nenhum produto vendido no período.</p>
        ) : (
          <ol className="space-y-4">
            {rows.map((p, i) => (
              <li key={p.id} className="space-y-1.5">
                <div className="flex items-baseline gap-2 text-sm">
                  <span className="w-4 shrink-0 text-xs text-muted-foreground tabular-nums">{i + 1}</span>
                  <span className="min-w-0 flex-1 truncate font-medium" title={p.name}>
                    {p.name}
                  </span>
                  <span className="font-medium tabular-nums">{formatCurrency(p.revenue)}</span>
                </div>
                <div className="flex items-center gap-2 pl-6">
                  <ShareBar value={p.revenue / max} />
                  <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                    {formatNumber(p.qty)} {p.unit}
                  </span>
                </div>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}

function Alerts({ data, loading }: SectionProps) {
  const stock = data?.stockAlerts ?? [];
  const expiry = data?.expiryAlerts ?? [];
  return (
    <Card>
      <CardHeader>
        <CardTitle>Alertas de estoque</CardTitle>
        <CardDescription>Reposição e validade</CardDescription>
        <CardAction>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/stock">
              Estoque <ArrowRight />
            </Link>
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        {loading ? (
          <ListSkeleton />
        ) : (
          <Tabs defaultValue="stock">
            <TabsList className="w-full">
              <TabsTrigger value="stock">
                Estoque baixo
                {data && data.stockAlertsTotal > 0 && (
                  <span className="rounded-full bg-destructive/12 px-1.5 text-xs text-destructive tabular-nums">
                    {data.stockAlertsTotal}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="expiry">
                Validade
                {expiry.length > 0 && (
                  <span className="rounded-full bg-warning/15 px-1.5 text-xs text-warning tabular-nums">{expiry.length}</span>
                )}
              </TabsTrigger>
            </TabsList>
            <TabsContent value="stock" className="pt-2">
              {stock.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">Todos os produtos acima do mínimo.</p>
              ) : (
                <ul className="divide-y">
                  {stock.map((p) => (
                    <li key={p.id} className="flex items-center gap-3 py-2.5">
                      <PackageX className={cn("size-4 shrink-0", p.status === "out" ? "text-destructive" : "text-warning")} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{p.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {p.sku} · mín. {formatNumber(p.minStock)} {p.unit}
                        </p>
                      </div>
                      <StatusBadge tone={p.status === "out" ? "destructive" : "warning"} className="tabular-nums">
                        {formatNumber(p.quantity)} {p.unit}
                      </StatusBadge>
                    </li>
                  ))}
                  {data && data.stockAlertsTotal > stock.length && (
                    <li className="pt-2.5 text-xs text-muted-foreground">
                      + {data.stockAlertsTotal - stock.length} outros produtos
                    </li>
                  )}
                </ul>
              )}
            </TabsContent>
            <TabsContent value="expiry" className="pt-2">
              {expiry.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">Nenhum produto próximo do vencimento.</p>
              ) : (
                <ul className="divide-y">
                  {expiry.map((p) => (
                    <li key={p.id} className="flex items-center gap-3 py-2.5">
                      <CalendarClock className={cn("size-4 shrink-0", p.days < 0 ? "text-destructive" : "text-warning")} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{p.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {p.sku} · {formatNumber(p.quantity)} em estoque · {formatDate(p.expiryDate)}
                        </p>
                      </div>
                      <StatusBadge tone={p.days < 0 ? "destructive" : "warning"}>
                        {p.days < 0 ? "Vencido" : p.days === 0 ? "Hoje" : `${p.days} dias`}
                      </StatusBadge>
                    </li>
                  ))}
                </ul>
              )}
            </TabsContent>
          </Tabs>
        )}
      </CardContent>
    </Card>
  );
}

function dueLabel(days: number) {
  if (days < 0) return `Vencida há ${Math.abs(days)} ${Math.abs(days) === 1 ? "dia" : "dias"}`;
  if (days === 0) return "Vence hoje";
  if (days === 1) return "Vence amanhã";
  return `Vence em ${days} dias`;
}

function UpcomingBills({ data, loading }: SectionProps) {
  const bills = data?.bills ?? [];
  const totals = data?.billsTotals;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Contas · próximos 7 dias</CardTitle>
        <CardDescription>Inclui contas vencidas em aberto</CardDescription>
        <CardAction>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/cash-flow">
              Fluxo <ArrowRight />
            </Link>
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <ListSkeleton />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-success/10 p-3">
                <p className="text-xs text-muted-foreground">A receber</p>
                <p className="font-semibold text-success tabular-nums">
                  {formatCurrency((totals?.receivable ?? 0) + (totals?.overdueReceivable ?? 0))}
                </p>
              </div>
              <div className="rounded-lg bg-destructive/10 p-3">
                <p className="text-xs text-muted-foreground">A pagar</p>
                <p className="font-semibold text-destructive tabular-nums">
                  {formatCurrency((totals?.payable ?? 0) + (totals?.overduePayable ?? 0))}
                </p>
              </div>
            </div>
            {bills.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Nenhuma conta para os próximos dias.</p>
            ) : (
              <ul className="max-h-72 divide-y overflow-y-auto">
                {bills.map((b) => (
                  <li key={`${b.kind}-${b.id}`}>
                    <Link
                      href={b.kind === "payable" ? "/bills" : "/receivables"}
                      className="-mx-2 flex items-center gap-3 rounded-md px-2 py-2.5 hover:bg-muted/50"
                    >
                      <Wallet className={cn("size-4 shrink-0", b.kind === "payable" ? "text-destructive" : "text-success")} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{b.description}</p>
                        <p className={cn("text-xs", b.overdue ? "text-destructive" : "text-muted-foreground")}>
                          {b.overdue && <AlertTriangle className="mr-1 inline size-3" />}
                          {dueLabel(b.days)} · {b.party}
                        </p>
                      </div>
                      <span
                        className={cn(
                          "text-sm font-medium tabular-nums",
                          b.kind === "payable" ? "text-destructive" : "text-success",
                        )}
                      >
                        {b.kind === "payable" ? "−" : "+"}
                        {formatCurrency(b.amount)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function RecentSales({ data, loading }: SectionProps) {
  const rows = data?.recentSales ?? [];
  return (
    <Card>
      <CardHeader>
        <CardTitle>Vendas recentes</CardTitle>
        <CardDescription>Últimas vendas finalizadas no período</CardDescription>
        <CardAction>
          <Button variant="outline" size="sm" asChild>
            <Link href="/sales-history">
              Ver histórico <ArrowRight />
            </Link>
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-9 w-full" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <EmptyState title="Nenhuma venda no período" description="As vendas finalizadas no PDV aparecem aqui." icon={ShoppingBag} />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Venda</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead className="hidden md:table-cell">Pagamento</TableHead>
                <TableHead className="hidden sm:table-cell">Data</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium tabular-nums">#{s.saleNumber}</TableCell>
                  <TableCell className="max-w-48 truncate">
                    {s.customerName ?? <span className="text-muted-foreground">Consumidor final</span>}
                    <span className="block text-xs text-muted-foreground">
                      {s.itemsCount} {s.itemsCount === 1 ? "item" : "itens"}
                    </span>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <StatusBadge>{s.paymentMethod}</StatusBadge>
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground sm:table-cell">{formatDateTime(s.createdAt)}</TableCell>
                  <TableCell className="text-right font-medium tabular-nums">{formatCurrency(s.total)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
