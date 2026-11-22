"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, XAxis, YAxis } from "recharts";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Download,
  FileSpreadsheet,
  Percent,
  Printer,
  Receipt,
  Search,
  ShoppingBag,
  TrendingUp,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { StatusBadge, type StatusTone } from "@/components/status-badge";
import { EmptyState, ErrorState } from "@/components/query-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, type ChartConfig } from "@/components/ui/chart";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  CHART_COLORS,
  MoneyTooltipContent,
  ShareBar,
  downloadCsv,
  formatCompactCurrency,
} from "@/components/analytics/chart-helpers";
import { DRE_LINES, DreStatement } from "@/components/analytics/dre-table";
import { addDays, dayKey, getSalesReport, parseDayKey, type SalesReport } from "@/lib/services/analytics";
import { formatCurrency, formatDate, formatDateTime, formatNumber, formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";

type Preset = "7d" | "30d" | "90d" | "month" | "lastMonth" | "year" | "custom";

const PRESET_LABEL: Record<Preset, string> = {
  "7d": "Últimos 7 dias",
  "30d": "Últimos 30 dias",
  "90d": "Últimos 90 dias",
  month: "Este mês",
  lastMonth: "Mês passado",
  year: "Este ano",
  custom: "Personalizado",
};

function presetRange(preset: Exclude<Preset, "custom">) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const y = today.getFullYear();
  const m = today.getMonth();
  switch (preset) {
    case "7d":
      return { from: dayKey(addDays(today, -6)), to: dayKey(today) };
    case "30d":
      return { from: dayKey(addDays(today, -29)), to: dayKey(today) };
    case "90d":
      return { from: dayKey(addDays(today, -89)), to: dayKey(today) };
    case "month":
      return { from: dayKey(new Date(y, m, 1)), to: dayKey(today) };
    case "lastMonth":
      return { from: dayKey(new Date(y, m - 1, 1)), to: dayKey(new Date(y, m, 0)) };
    case "year":
      return { from: dayKey(new Date(y, 0, 1)), to: dayKey(today) };
  }
}

type TabKey = "sales" | "products" | "categories" | "payments";

const EXPORT_LABEL: Record<TabKey | "dre", string> = {
  sales: "Vendas",
  products: "Produtos",
  categories: "Categorias",
  payments: "Pagamentos",
  dre: "DRE",
};

const PAGE_SIZE = 15;

export function ReportsView() {
  const [preset, setPreset] = useState<Preset>("30d");
  const [range, setRange] = useState(() => presetRange("30d"));
  const [tab, setTab] = useState<TabKey>("sales");
  const invalid = range.from > range.to;

  const query = useQuery({
    queryKey: ["reports", "sales", range.from, range.to],
    queryFn: () => getSalesReport(range.from, range.to),
    // dados agregados de vários domínios: sempre revalidar ao abrir a tela
    staleTime: 0,
    enabled: !invalid && !!range.from && !!range.to,
    placeholderData: (prev) => prev,
  });
  const data = query.data;
  const loading = query.isPending;

  const onPreset = (value: string) => {
    const p = value as Preset;
    setPreset(p);
    if (p !== "custom") setRange(presetRange(p));
  };

  const exportCsv = (kind: TabKey | "dre") => {
    if (!data) return;
    const suffix = `${data.from}_a_${data.to}`;
    switch (kind) {
      case "dre":
        downloadCsv(`dre_${suffix}.csv`, ["Linha", "Valor"], DRE_LINES.map((l) => [l.label, data.dre[l.key]]));
        break;
      case "sales":
        downloadCsv(
          `vendas_${suffix}.csv`,
          ["Venda", "Data", "Cliente", "Operador", "Pagamento", "Itens", "Desconto", "Total", "Custo", "Lucro"],
          data.sales.map((s) => [
            s.saleNumber,
            formatDateTime(s.createdAt),
            s.customerName ?? "Consumidor final",
            s.userName,
            s.paymentMethod,
            s.itemsCount,
            s.discount,
            s.total,
            s.cost,
            s.profit,
          ]),
        );
        break;
      case "products":
        downloadCsv(
          `produtos_${suffix}.csv`,
          ["SKU", "Produto", "Categoria", "Unidade", "Quantidade", "Receita", "Custo", "Lucro", "Margem %", "Participação %", "Curva ABC"],
          data.products.map((p) => [
            p.sku,
            p.name,
            p.category,
            p.unit,
            p.qty,
            p.revenue,
            p.cost,
            p.profit,
            Math.round(p.margin * 1000) / 10,
            Math.round(p.share * 1000) / 10,
            p.abc,
          ]),
        );
        break;
      case "categories":
        downloadCsv(
          `categorias_${suffix}.csv`,
          ["Categoria", "Produtos", "Quantidade", "Receita", "Custo", "Lucro", "Margem %", "Participação %"],
          data.categories.map((c) => [
            c.category,
            c.products,
            c.qty,
            c.revenue,
            c.cost,
            c.profit,
            Math.round(c.margin * 1000) / 10,
            Math.round(c.share * 1000) / 10,
          ]),
        );
        break;
      case "payments":
        downloadCsv(
          `pagamentos_${suffix}.csv`,
          ["Forma de pagamento", "Vendas", "Total", "Ticket médio", "Participação %"],
          data.payments.map((p) => [p.method, p.count, p.total, p.avgTicket, Math.round(p.share * 1000) / 10]),
        );
        break;
    }
    toast.success("CSV exportado", { description: `${EXPORT_LABEL[kind]} · ${formatDate(parseDayKey(data.from))} a ${formatDate(parseDayKey(data.to))}` });
  };

  return (
    <>
      <PageHeader
        title="Relatórios"
        description="Desempenho de vendas, produtos e resultado do período"
        actions={
          <div className="flex gap-2 print:hidden">
            <Button variant="outline" onClick={() => window.print()} disabled={!data}>
              <Printer />
              Imprimir
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button disabled={!data}>
                  <Download />
                  Exportar CSV
                  <ChevronDown />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuItem onSelect={() => exportCsv(tab)}>
                  <FileSpreadsheet />
                  Aba atual ({EXPORT_LABEL[tab]})
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {(Object.keys(EXPORT_LABEL) as (TabKey | "dre")[]).map((k) => (
                  <DropdownMenuItem key={k} onSelect={() => exportCsv(k)}>
                    {EXPORT_LABEL[k]}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        }
      />

      <Card className="py-3 print:hidden">
        <CardContent className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
          <div className="grid gap-1.5 sm:w-48">
            <Label htmlFor="report-preset">Período</Label>
            <Select value={preset} onValueChange={onPreset}>
              <SelectTrigger id="report-preset" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(PRESET_LABEL) as Preset[]).map((p) => (
                  <SelectItem key={p} value={p}>
                    {PRESET_LABEL[p]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:flex">
            <div className="grid gap-1.5">
              <Label htmlFor="report-from">De</Label>
              <Input
                id="report-from"
                type="date"
                value={range.from}
                max={range.to}
                aria-invalid={invalid}
                onChange={(e) => {
                  setPreset("custom");
                  setRange((r) => ({ ...r, from: e.target.value }));
                }}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="report-to">Até</Label>
              <Input
                id="report-to"
                type="date"
                value={range.to}
                min={range.from}
                aria-invalid={invalid}
                onChange={(e) => {
                  setPreset("custom");
                  setRange((r) => ({ ...r, to: e.target.value }));
                }}
              />
            </div>
          </div>
          {invalid && <p className="text-sm text-destructive sm:pb-1.5">A data inicial deve ser anterior à final.</p>}
          {data && !invalid && (
            <p className="text-sm text-muted-foreground sm:ml-auto sm:pb-1.5">
              {data.summary.count} vendas finalizadas
              {data.cancelled.count > 0 && (
                <>
                  {" "}
                  · {data.cancelled.count} canceladas ({formatCurrency(data.cancelled.total)}) excluídas
                </>
              )}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Cabeçalho exclusivo da impressão */}
      <p className="hidden text-sm print:block">
        Período: {formatDate(parseDayKey(range.from))} a {formatDate(parseDayKey(range.to))}
      </p>

      {query.isError && !data ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      ) : (
        <div className={cn("flex flex-col gap-6 transition-opacity", query.isPlaceholderData && "opacity-60")}>
          <Kpis data={data} loading={loading} />

          <div className="grid gap-6 xl:grid-cols-5">
            <DailyChart data={data} loading={loading} />
            <Card className="xl:col-span-2">
              <CardHeader>
                <CardTitle>DRE simplificado</CardTitle>
                <CardDescription>Demonstrativo de resultado do período</CardDescription>
              </CardHeader>
              <CardContent>
                {loading || !data ? (
                  <div className="space-y-2">
                    {Array.from({ length: 8 }).map((_, i) => (
                      <Skeleton key={i} className="h-8 w-full" />
                    ))}
                  </div>
                ) : (
                  <DreStatement dre={data.dre} />
                )}
              </CardContent>
            </Card>
          </div>

          <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)} className="gap-4">
            <div className="overflow-x-auto print:hidden">
              <TabsList>
                <TabsTrigger value="sales">Vendas</TabsTrigger>
                <TabsTrigger value="products">Produtos</TabsTrigger>
                <TabsTrigger value="categories">Categorias</TabsTrigger>
                <TabsTrigger value="payments">Pagamentos</TabsTrigger>
              </TabsList>
            </div>
            <TabsContent value="sales">
              <SalesTab data={data} loading={loading} />
            </TabsContent>
            <TabsContent value="products">
              <ProductsTab data={data} loading={loading} />
            </TabsContent>
            <TabsContent value="categories">
              <CategoriesTab data={data} loading={loading} />
            </TabsContent>
            <TabsContent value="payments">
              <PaymentsTab data={data} loading={loading} />
            </TabsContent>
          </Tabs>
        </div>
      )}
    </>
  );
}

interface TabProps {
  data: SalesReport | undefined;
  loading: boolean;
}

function Kpis({ data, loading }: TabProps) {
  const s = data?.summary;
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard
        label="Receita líquida"
        icon={CircleDollarSign}
        loading={loading}
        value={formatCurrency(s?.revenue)}
        hint={s && `${formatCurrency(s.discounts)} em descontos`}
      />
      <StatCard
        label="Lucro bruto"
        icon={TrendingUp}
        tone="success"
        loading={loading}
        value={formatCurrency(s?.profit)}
        hint={s && `CMV de ${formatCurrency(s.cost)}`}
      />
      <StatCard
        label="Margem bruta"
        icon={Percent}
        tone="warning"
        loading={loading}
        value={formatPercent(s?.margin)}
        hint={s && `Ticket médio de ${formatCurrency(s.avgTicket)}`}
      />
      <StatCard
        label="Vendas"
        icon={ShoppingBag}
        loading={loading}
        value={formatNumber(s?.count)}
        hint={s && `${formatNumber(s.itemsSold)} itens vendidos`}
      />
    </div>
  );
}

const dailyConfig = {
  revenue: { label: "Receita", color: "var(--chart-1)" },
  profit: { label: "Lucro bruto", color: "var(--chart-2)" },
} satisfies ChartConfig;

function DailyChart({ data, loading }: TabProps) {
  return (
    <Card className="xl:col-span-3">
      <CardHeader>
        <CardTitle>Evolução diária</CardTitle>
        <CardDescription>Receita e lucro bruto por dia</CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-[300px] w-full" />
        ) : !data?.summary.count ? (
          <div className="flex h-[300px] items-center justify-center text-sm text-muted-foreground">
            Nenhuma venda no período.
          </div>
        ) : (
          <ChartContainer config={dailyConfig} className="aspect-auto h-[300px] w-full">
            <BarChart data={data.daily} margin={{ left: 4, right: 8, top: 8 }}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} minTickGap={20} />
              <YAxis tickLine={false} axisLine={false} width={64} tickFormatter={(v: number) => formatCompactCurrency(v)} />
              <ChartTooltip content={<MoneyTooltipContent config={dailyConfig} />} />
              <ChartLegend content={<ChartLegendContent />} />
              <Bar dataKey="revenue" fill="var(--color-revenue)" radius={[3, 3, 0, 0]} />
              <Bar dataKey="profit" fill="var(--color-profit)" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}

function TableSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-9 w-full" />
      ))}
    </div>
  );
}

function Pager({ page, pages, total, onPage }: { page: number; pages: number; total: number; onPage: (p: number) => void }) {
  if (pages <= 1) return null;
  return (
    <div className="flex items-center justify-between gap-3 pt-4 text-sm text-muted-foreground print:hidden">
      <span>
        {total} registros · página {page + 1} de {pages}
      </span>
      <div className="flex gap-2">
        <Button variant="outline" size="icon-sm" onClick={() => onPage(page - 1)} disabled={page === 0} aria-label="Página anterior">
          <ChevronLeft />
        </Button>
        <Button variant="outline" size="icon-sm" onClick={() => onPage(page + 1)} disabled={page >= pages - 1} aria-label="Próxima página">
          <ChevronRight />
        </Button>
      </div>
    </div>
  );
}

function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="relative w-full sm:w-64 print:hidden">
      <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="pl-8" />
    </div>
  );
}

const normalize = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

function SalesTab({ data, loading }: TabProps) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const filtered = useMemo(() => {
    const term = normalize(search.trim());
    const rows = data?.sales ?? [];
    if (!term) return rows;
    return rows.filter((s) =>
      normalize(`${s.saleNumber} ${s.customerName ?? "consumidor final"} ${s.userName} ${s.paymentMethod}`).includes(term),
    );
  }, [data, search]);
  const pages = Math.ceil(filtered.length / PAGE_SIZE);
  const current = Math.min(page, Math.max(0, pages - 1));
  const rows = filtered.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE);
  const totals = filtered.reduce((acc, s) => ({ total: acc.total + s.total, profit: acc.profit + s.profit, discount: acc.discount + s.discount }), {
    total: 0,
    profit: 0,
    discount: 0,
  });

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <CardTitle>Vendas finalizadas</CardTitle>
          <CardDescription>Vendas canceladas e orçamentos não entram no relatório</CardDescription>
        </div>
        <div className="w-full sm:w-auto">
          <SearchBox
            value={search}
            onChange={(v) => {
              setSearch(v);
              setPage(0);
            }}
            placeholder="Buscar venda, cliente, operador…"
          />
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <TableSkeleton />
        ) : filtered.length === 0 ? (
          <EmptyState title="Nenhuma venda encontrada" description="Ajuste o período ou o termo de busca." icon={Receipt} />
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Venda</TableHead>
                  <TableHead className="hidden sm:table-cell">Data</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead className="hidden lg:table-cell">Operador</TableHead>
                  <TableHead className="hidden md:table-cell">Pagamento</TableHead>
                  <TableHead className="hidden text-right lg:table-cell">Desconto</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="hidden text-right md:table-cell">Lucro</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium tabular-nums">#{s.saleNumber}</TableCell>
                    <TableCell className="hidden text-muted-foreground sm:table-cell">{formatDateTime(s.createdAt)}</TableCell>
                    <TableCell className="max-w-48 truncate">
                      {s.customerName ?? <span className="text-muted-foreground">Consumidor final</span>}
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground lg:table-cell">{s.userName}</TableCell>
                    <TableCell className="hidden md:table-cell">
                      <StatusBadge>{s.paymentMethod}</StatusBadge>
                    </TableCell>
                    <TableCell className="hidden text-right text-muted-foreground tabular-nums lg:table-cell">
                      {s.discount > 0 ? formatCurrency(s.discount) : "—"}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">{formatCurrency(s.total)}</TableCell>
                    <TableCell className={cn("hidden text-right tabular-nums md:table-cell", s.profit < 0 ? "text-destructive" : "text-success")}>
                      {formatCurrency(s.profit)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={2} className="hidden sm:table-cell">
                    Total filtrado
                  </TableCell>
                  <TableCell className="sm:hidden">Total</TableCell>
                  <TableCell className="hidden sm:table-cell" />
                  <TableCell className="hidden lg:table-cell" />
                  <TableCell className="hidden md:table-cell" />
                  <TableCell className="hidden text-right tabular-nums lg:table-cell">{formatCurrency(totals.discount)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatCurrency(totals.total)}</TableCell>
                  <TableCell className="hidden text-right tabular-nums md:table-cell">{formatCurrency(totals.profit)}</TableCell>
                </TableRow>
              </TableFooter>
            </Table>
            <Pager page={current} pages={pages} total={filtered.length} onPage={setPage} />
          </>
        )}
      </CardContent>
    </Card>
  );
}

const ABC_TONE: Record<"A" | "B" | "C", StatusTone> = { A: "success", B: "warning", C: "neutral" };

const productsConfig = { revenue: { label: "Receita", color: "var(--chart-1)" } } satisfies ChartConfig;

function ProductsTab({ data, loading }: TabProps) {
  const [search, setSearch] = useState("");
  const [abc, setAbc] = useState<"all" | "A" | "B" | "C">("all");
  const [page, setPage] = useState(0);
  const all = useMemo(() => data?.products ?? [], [data]);
  const filtered = useMemo(() => {
    const term = normalize(search.trim());
    return all.filter((p) => (abc === "all" || p.abc === abc) && (!term || normalize(`${p.sku} ${p.name} ${p.category}`).includes(term)));
  }, [all, search, abc]);
  const pages = Math.ceil(filtered.length / PAGE_SIZE);
  const current = Math.min(page, Math.max(0, pages - 1));
  const rows = filtered.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE);
  const top = all.slice(0, 8).map((p) => ({ ...p, short: p.name.length > 22 ? `${p.name.slice(0, 21)}…` : p.name }));
  const abcSummary = (["A", "B", "C"] as const).map((k) => {
    const list = all.filter((p) => p.abc === k);
    return { k, count: list.length, share: list.reduce((s, p) => s + p.share, 0) };
  });

  if (loading) return <TableSkeleton rows={10} />;
  if (!all.length) return <EmptyState title="Nenhum produto vendido" description="Não há vendas finalizadas no período." />;

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Top 8 por receita</CardTitle>
          </CardHeader>
          <CardContent>
            <ChartContainer config={productsConfig} className="aspect-auto h-[280px] w-full">
              <BarChart data={top} layout="vertical" margin={{ left: 0, right: 12 }}>
                <CartesianGrid horizontal={false} />
                <XAxis type="number" tickLine={false} axisLine={false} tickFormatter={(v: number) => formatCompactCurrency(v)} />
                <YAxis type="category" dataKey="short" tickLine={false} axisLine={false} width={150} />
                <ChartTooltip content={<MoneyTooltipContent config={productsConfig} />} />
                <Bar dataKey="revenue" fill="var(--color-revenue)" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Curva ABC</CardTitle>
            <CardDescription>A: 80% do faturamento · B: próximos 15% · C: 5% restantes</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {abcSummary.map((c, i) => (
              <button
                key={c.k}
                type="button"
                onClick={() => {
                  setAbc(abc === c.k ? "all" : c.k);
                  setPage(0);
                }}
                className={cn(
                  "w-full space-y-2 rounded-lg border p-3 text-left transition-colors hover:bg-muted/50",
                  abc === c.k && "border-primary bg-primary/5",
                )}
              >
                <div className="flex items-center gap-2 text-sm">
                  <StatusBadge tone={ABC_TONE[c.k]}>Classe {c.k}</StatusBadge>
                  <span className="text-muted-foreground">
                    {c.count} {c.count === 1 ? "produto" : "produtos"}
                  </span>
                  <span className="ml-auto font-medium tabular-nums">{formatPercent(c.share)}</span>
                </div>
                <ShareBar value={c.share} color={CHART_COLORS[i]} />
              </button>
            ))}
            <p className="text-xs text-muted-foreground">Clique em uma classe para filtrar a tabela.</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <CardTitle>Desempenho por produto</CardTitle>
            <CardDescription>
              {abc === "all" ? "Todos os produtos vendidos" : `Somente classe ${abc}`} · receita líquida com descontos rateados
            </CardDescription>
          </div>
          <div className="w-full sm:w-auto">
            <SearchBox
              value={search}
              onChange={(v) => {
                setSearch(v);
                setPage(0);
              }}
              placeholder="Buscar produto, SKU…"
            />
          </div>
        </CardHeader>
        <CardContent>
          {filtered.length === 0 ? (
            <EmptyState title="Nenhum produto encontrado" description="Ajuste a busca ou o filtro ABC." />
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Produto</TableHead>
                    <TableHead className="hidden md:table-cell">Categoria</TableHead>
                    <TableHead className="text-right">Qtd.</TableHead>
                    <TableHead className="text-right">Receita</TableHead>
                    <TableHead className="hidden text-right lg:table-cell">Custo</TableHead>
                    <TableHead className="hidden text-right sm:table-cell">Lucro</TableHead>
                    <TableHead className="hidden text-right sm:table-cell">Margem</TableHead>
                    <TableHead className="text-center">ABC</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="max-w-64">
                        <p className="truncate font-medium">{p.name}</p>
                        <p className="text-xs text-muted-foreground">{p.sku}</p>
                      </TableCell>
                      <TableCell className="hidden text-muted-foreground md:table-cell">{p.category}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatNumber(p.qty)} <span className="text-xs text-muted-foreground">{p.unit}</span>
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">{formatCurrency(p.revenue)}</TableCell>
                      <TableCell className="hidden text-right text-muted-foreground tabular-nums lg:table-cell">{formatCurrency(p.cost)}</TableCell>
                      <TableCell className={cn("hidden text-right tabular-nums sm:table-cell", p.profit < 0 ? "text-destructive" : "text-success")}>
                        {formatCurrency(p.profit)}
                      </TableCell>
                      <TableCell className="hidden text-right tabular-nums sm:table-cell">{formatPercent(p.margin)}</TableCell>
                      <TableCell className="text-center">
                        <StatusBadge tone={ABC_TONE[p.abc]}>{p.abc}</StatusBadge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <Pager page={current} pages={pages} total={filtered.length} onPage={setPage} />
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

const categoriesConfig = {
  revenue: { label: "Receita", color: "var(--chart-1)" },
  profit: { label: "Lucro bruto", color: "var(--chart-2)" },
} satisfies ChartConfig;

function CategoriesTab({ data, loading }: TabProps) {
  const rows = data?.categories ?? [];
  if (loading) return <TableSkeleton />;
  if (!rows.length) return <EmptyState title="Sem dados de categorias" description="Não há vendas finalizadas no período." />;
  const total = rows.reduce((acc, c) => ({ revenue: acc.revenue + c.revenue, profit: acc.profit + c.profit, cost: acc.cost + c.cost }), {
    revenue: 0,
    profit: 0,
    cost: 0,
  });
  return (
    <div className="grid gap-6 lg:grid-cols-5">
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Receita x lucro por categoria</CardTitle>
        </CardHeader>
        <CardContent>
          <ChartContainer config={categoriesConfig} className="aspect-auto h-[320px] w-full">
            <BarChart data={rows} margin={{ left: 4, right: 8, top: 8 }}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="category" tickLine={false} axisLine={false} tickMargin={8} interval={0} angle={-30} textAnchor="end" height={64} />
              <YAxis tickLine={false} axisLine={false} width={64} tickFormatter={(v: number) => formatCompactCurrency(v)} />
              <ChartTooltip content={<MoneyTooltipContent config={categoriesConfig} />} />
              <ChartLegend content={<ChartLegendContent />} />
              <Bar dataKey="revenue" fill="var(--color-revenue)" radius={[3, 3, 0, 0]} />
              <Bar dataKey="profit" fill="var(--color-profit)" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ChartContainer>
        </CardContent>
      </Card>
      <Card className="lg:col-span-3">
        <CardHeader>
          <CardTitle>Desempenho por categoria</CardTitle>
          <CardDescription>Participação na receita e margem bruta</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Categoria</TableHead>
                <TableHead className="hidden text-right sm:table-cell">Produtos</TableHead>
                <TableHead className="text-right">Receita</TableHead>
                <TableHead className="hidden text-right md:table-cell">Lucro</TableHead>
                <TableHead className="text-right">Margem</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((c, i) => (
                <TableRow key={c.category}>
                  <TableCell className="min-w-40">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{c.category}</span>
                      <span className="ml-auto text-xs text-muted-foreground tabular-nums">{formatPercent(c.share)}</span>
                    </div>
                    <ShareBar value={c.share} className="mt-1.5" color={CHART_COLORS[i % CHART_COLORS.length]} />
                  </TableCell>
                  <TableCell className="hidden text-right tabular-nums sm:table-cell">{c.products}</TableCell>
                  <TableCell className="text-right font-medium tabular-nums">{formatCurrency(c.revenue)}</TableCell>
                  <TableCell className="hidden text-right text-success tabular-nums md:table-cell">{formatCurrency(c.profit)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatPercent(c.margin)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell>Total</TableCell>
                <TableCell className="hidden sm:table-cell" />
                <TableCell className="text-right tabular-nums">{formatCurrency(total.revenue)}</TableCell>
                <TableCell className="hidden text-right tabular-nums md:table-cell">{formatCurrency(total.profit)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatPercent(total.revenue ? total.profit / total.revenue : 0)}</TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function PaymentsTab({ data, loading }: TabProps) {
  const rows = data?.payments ?? [];
  if (loading) return <TableSkeleton />;
  if (!rows.length) return <EmptyState title="Sem pagamentos" description="Não há vendas finalizadas no período." />;
  const config: ChartConfig = Object.fromEntries(rows.map((r, i) => [r.method, { label: r.method, color: CHART_COLORS[i % CHART_COLORS.length] }]));
  const total = rows.reduce((s, r) => s + r.total, 0);
  const count = rows.reduce((s, r) => s + r.count, 0);
  return (
    <div className="grid gap-6 lg:grid-cols-5">
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Distribuição</CardTitle>
          <CardDescription>Participação de cada forma no faturamento</CardDescription>
        </CardHeader>
        <CardContent>
          <ChartContainer config={config} className="mx-auto aspect-square h-[260px]">
            <PieChart>
              <ChartTooltip content={<MoneyTooltipContent config={config} hideLabel nameKey="method" />} />
              <Pie data={rows} dataKey="total" nameKey="method" innerRadius={70} outerRadius={110} strokeWidth={2} stroke="var(--card)">
                {rows.map((r, i) => (
                  <Cell key={r.method} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                ))}
              </Pie>
            </PieChart>
          </ChartContainer>
        </CardContent>
      </Card>
      <Card className="lg:col-span-3">
        <CardHeader>
          <CardTitle>Formas de pagamento</CardTitle>
          <CardDescription>Volume e ticket médio por forma</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Forma</TableHead>
                <TableHead className="text-right">Vendas</TableHead>
                <TableHead className="hidden text-right sm:table-cell">Ticket médio</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r, i) => (
                <TableRow key={r.method}>
                  <TableCell className="min-w-40">
                    <div className="flex items-center gap-2">
                      <span className="size-2.5 rounded-[3px]" style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
                      <span className="font-medium">{r.method}</span>
                      <span className="ml-auto text-xs text-muted-foreground tabular-nums">{formatPercent(r.share)}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatNumber(r.count)}</TableCell>
                  <TableCell className="hidden text-right tabular-nums sm:table-cell">{formatCurrency(r.avgTicket)}</TableCell>
                  <TableCell className="text-right font-medium tabular-nums">{formatCurrency(r.total)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell>Total</TableCell>
                <TableCell className="text-right tabular-nums">{formatNumber(count)}</TableCell>
                <TableCell className="hidden text-right tabular-nums sm:table-cell">{formatCurrency(count ? total / count : 0)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatCurrency(total)}</TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
