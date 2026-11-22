"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowUpFromLine,
  ChevronLeft,
  ChevronRight,
  Clock,
  Landmark,
  Scale,
  ShieldX,
  Store,
  TrendingUp,
} from "lucide-react";
import type { CashSessionStatus, Sale } from "@/lib/domain/types";
import { round2 } from "@/lib/domain/calc";
import { hasRole, useSession } from "@/lib/auth";
import { formatCurrency, formatDateTime, toDateInput } from "@/lib/format";
import {
  getSessionDetail,
  listSessionSummaries,
  RECONCILED_METHODS,
  type CashSessionFilters,
  type CashSummary,
} from "@/lib/services/cash";
import { paymentLabel } from "@/lib/services/sales";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/page-header";
import { EmptyState, ErrorState } from "@/components/query-state";
import { StatCard } from "@/components/stat-card";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DifferenceValue } from "@/components/pos/cash-dialogs";
import { PAYMENT_ICON } from "@/components/pos/payment-methods";
import { SaleDetailSheet } from "@/components/pos/sale-detail-sheet";
import { SaleStatusBadge } from "@/components/pos/sale-status";

const PAGE_SIZE = 20;

function daysAgoInput(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return toDateInput(d);
}

function formatDuration(ms: number) {
  const totalMinutes = Math.floor(ms / 60_000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  if (days) return `${days}d ${hours}h`;
  if (hours) return `${hours}h ${String(minutes).padStart(2, "0")}min`;
  return `${minutes}min`;
}

const hasDifference = (s: CashSummary) => s.difference !== null && Math.abs(s.difference) >= 0.01;

export function CashAuditClient() {
  const user = useSession();
  if (!hasRole(user, ["Gerente"])) {
    return (
      <>
        <PageHeader title="Auditoria de caixa" />
        <EmptyState
          icon={ShieldX}
          title="Acesso restrito"
          description="A auditoria de caixa está disponível apenas para Gerentes e Administradores."
        />
      </>
    );
  }
  return <CashAudit />;
}

function CashAudit() {
  const [filters, setFilters] = useState<Required<CashSessionFilters>>({
    start: daysAgoInput(29),
    end: toDateInput(),
    status: "all",
  });
  const [onlyIssues, setOnlyIssues] = useState(false);
  const [page, setPage] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const query = useQuery({
    queryKey: ["cash", "sessions", filters],
    queryFn: () => listSessionSummaries(filters),
  });

  const all = useMemo(() => query.data ?? [], [query.data]);
  const rows = useMemo(
    () => (onlyIssues ? all.filter((s) => hasDifference(s) || s.longOpen) : all),
    [all, onlyIssues],
  );

  const kpis = useMemo(() => {
    const closed = all.filter((s) => s.difference !== null);
    return {
      count: all.length,
      open: all.filter((s) => s.session.status === "aberto").length,
      alerts: all.filter((s) => s.longOpen || hasDifference(s)).length,
      totalSales: round2(all.reduce((sum, s) => sum + s.totalSales, 0)),
      salesCount: all.reduce((sum, s) => sum + s.salesCount, 0),
      netDifference: round2(closed.reduce((sum, s) => sum + (s.difference ?? 0), 0)),
    };
  }, [all]);

  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const pageRows = rows.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);

  const update = <K extends keyof typeof filters>(key: K, value: (typeof filters)[K]) => {
    setFilters((f) => ({ ...f, [key]: value }));
    setPage(0);
  };

  return (
    <>
      <PageHeader
        title="Auditoria de caixa"
        description="Confira sessões de caixa, totais por meio de pagamento, suprimentos, sangrias e diferenças de fechamento."
      />

      <Card className="p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="grid gap-1.5">
            <Label className="text-xs text-muted-foreground">Abertura de</Label>
            <Input type="date" className="w-38" value={filters.start} max={filters.end} onChange={(e) => update("start", e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs text-muted-foreground">até</Label>
            <Input type="date" className="w-38" value={filters.end} min={filters.start} onChange={(e) => update("end", e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs text-muted-foreground">Status</Label>
            <Select value={filters.status} onValueChange={(v) => update("status", v as CashSessionStatus | "all")}>
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="aberto">Abertos</SelectItem>
                <SelectItem value="fechado">Fechados</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <label className="flex h-8 items-center gap-2 text-sm">
            <Switch
              checked={onlyIssues}
              onCheckedChange={(v) => {
                setOnlyIssues(v);
                setPage(0);
              }}
            />
            Somente com alerta/diferença
          </label>
        </div>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Caixas no filtro"
          value={kpis.count}
          hint={`${kpis.open} aberto(s)`}
          icon={Store}
          loading={query.isPending}
        />
        <StatCard
          label="Vendas no período"
          value={formatCurrency(kpis.totalSales)}
          hint={`${kpis.salesCount} venda(s) finalizada(s)`}
          icon={TrendingUp}
          tone="success"
          loading={query.isPending}
        />
        <StatCard
          label="Diferença acumulada"
          value={<DifferenceValue value={kpis.netDifference} className="font-semibold" />}
          hint="contado − esperado nos fechamentos"
          icon={Scale}
          tone={kpis.netDifference < 0 ? "destructive" : "default"}
          loading={query.isPending}
        />
        <StatCard
          label="Alertas"
          value={kpis.alerts}
          hint="diferença no fechamento ou aberto +24h"
          icon={AlertTriangle}
          tone={kpis.alerts ? "warning" : "default"}
          loading={query.isPending}
        />
      </div>

      {query.isError ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      ) : query.isPending ? (
        <Card className="gap-2 p-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </Card>
      ) : rows.length === 0 ? (
        <EmptyState icon={Landmark} title="Nenhum caixa encontrado" description="Ajuste o período ou os filtros." />
      ) : (
        <Card className="gap-0 overflow-hidden py-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="pl-4">Caixa</TableHead>
                <TableHead>Abertura</TableHead>
                <TableHead className="hidden lg:table-cell">Fechamento</TableHead>
                <TableHead className="hidden md:table-cell">Duração</TableHead>
                <TableHead className="text-right">Inicial</TableHead>
                <TableHead className="text-right">Vendas</TableHead>
                <TableHead className="hidden text-right xl:table-cell">Sangrias</TableHead>
                <TableHead className="text-right">Dinheiro esperado</TableHead>
                <TableHead className="text-right">Contado</TableHead>
                <TableHead className="text-right">Diferença</TableHead>
                <TableHead className="pr-4">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageRows.map((s) => {
                const issue = hasDifference(s) || s.longOpen;
                return (
                  <TableRow
                    key={s.session._id}
                    className={cn("cursor-pointer", issue && "bg-destructive/4 hover:bg-destructive/8")}
                    onClick={() => {
                      setSelectedId(s.session._id);
                      setSheetOpen(true);
                    }}
                  >
                    <TableCell className="pl-4">
                      <p className="tabular font-medium">#{s.session.number}</p>
                      <p className="max-w-36 truncate text-xs text-muted-foreground">{s.session.operatorName}</p>
                    </TableCell>
                    <TableCell className="tabular whitespace-nowrap">{formatDateTime(s.session.openedAt)}</TableCell>
                    <TableCell className="tabular hidden whitespace-nowrap text-muted-foreground lg:table-cell">
                      {formatDateTime(s.session.closedAt)}
                    </TableCell>
                    <TableCell className="tabular hidden whitespace-nowrap md:table-cell">
                      <span className={cn(s.longOpen && "font-medium text-warning")}>{formatDuration(s.durationMs)}</span>
                    </TableCell>
                    <TableCell className="tabular text-right">{formatCurrency(s.session.openingAmount)}</TableCell>
                    <TableCell className="tabular text-right">
                      {formatCurrency(s.totalSales)}
                      <p className="text-xs text-muted-foreground">{s.salesCount} venda(s)</p>
                    </TableCell>
                    <TableCell className="tabular hidden text-right text-muted-foreground xl:table-cell">
                      {s.retiradas ? `−${formatCurrency(s.retiradas)}` : "—"}
                    </TableCell>
                    <TableCell className="tabular text-right">{formatCurrency(s.expectedCash)}</TableCell>
                    <TableCell className="tabular text-right">
                      {s.counted === null ? <span className="text-muted-foreground">—</span> : formatCurrency(s.counted)}
                    </TableCell>
                    <TableCell className="text-right">
                      <DifferenceValue value={s.difference} />
                    </TableCell>
                    <TableCell className="pr-4">
                      <div className="flex items-center gap-1.5">
                        {s.session.status === "aberto" ? (
                          <StatusBadge tone="success">Aberto</StatusBadge>
                        ) : (
                          <StatusBadge>Fechado</StatusBadge>
                        )}
                        {s.longOpen && (
                          <StatusBadge tone="warning">
                            <Clock className="size-3" />
                            +24h
                          </StatusBadge>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          <div className="flex items-center justify-between gap-2 border-t px-4 py-3 text-sm text-muted-foreground">
            <span>
              {currentPage * PAGE_SIZE + 1}–{Math.min(rows.length, (currentPage + 1) * PAGE_SIZE)} de {rows.length}
            </span>
            <div className="flex items-center gap-1">
              <Button size="icon-sm" variant="outline" aria-label="Página anterior" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>
                <ChevronLeft />
              </Button>
              <span className="tabular px-2">
                {currentPage + 1} / {pageCount}
              </span>
              <Button
                size="icon-sm"
                variant="outline"
                aria-label="Próxima página"
                disabled={currentPage >= pageCount - 1}
                onClick={() => setPage(currentPage + 1)}
              >
                <ChevronRight />
              </Button>
            </div>
          </div>
        </Card>
      )}

      <SessionDetailSheet id={selectedId} open={sheetOpen} onOpenChange={setSheetOpen} />
    </>
  );
}

function SessionDetailSheet({
  id,
  open,
  onOpenChange,
}: {
  id: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [saleDetail, setSaleDetail] = useState<{ sale: Sale | null; open: boolean }>({ sale: null, open: false });
  const query = useQuery({
    queryKey: ["cash", "session", id],
    queryFn: () => getSessionDetail(id!),
    enabled: !!id,
  });
  const d = query.data;
  const counted = d?.session.countedByMethod;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="flex max-h-[90vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl">
          <DialogHeader className="gap-1 p-4 border-b pr-12">
            <div className="flex items-center gap-2">
              <DialogTitle className="text-lg">Caixa #{d?.session.number ?? "…"}</DialogTitle>
              {d &&
                (d.session.status === "aberto" ? (
                  <StatusBadge tone="success">Aberto</StatusBadge>
                ) : (
                  <StatusBadge>Fechado</StatusBadge>
                ))}
              {d?.longOpen && <StatusBadge tone="warning">Aberto há mais de 24h</StatusBadge>}
            </div>
            <DialogDescription>
              {d
                ? `${d.session.operatorName} · ${formatDateTime(d.session.openedAt)} → ${d.session.closedAt ? formatDateTime(d.session.closedAt) : "em aberto"} (${formatDuration(d.durationMs)})`
                : "Carregando…"}
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="min-h-0 flex-1">
            {query.isError ? (
              <div className="p-4">
                <ErrorState error={query.error} onRetry={() => query.refetch()} />
              </div>
            ) : !d ? (
              <div className="space-y-3 p-4">
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-48 w-full" />
              </div>
            ) : (
              <div className="space-y-5 p-4">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <Mini label="Fundo inicial" value={formatCurrency(d.session.openingAmount)} />
                  <Mini label="Vendas" value={formatCurrency(d.totalSales)} hint={`${d.salesCount} finalizada(s) · ${d.cancelledCount} cancelada(s)`} />
                  <Mini label="Descontos" value={formatCurrency(d.totalDiscounts)} />
                  <Mini
                    label="Diferença"
                    value={<DifferenceValue value={d.difference} className="text-base font-semibold" />}
                    hint={d.difference === null ? (d.session.status === "aberto" ? "caixa em aberto" : "sem contagem") : undefined}
                    highlight={hasDifference(d)}
                  />
                </div>

                {d.session.notes && (
                  <p className="rounded-lg border-l-2 border-warning bg-warning/8 px-3 py-2 text-sm">
                    <span className="font-medium">Observação:</span> {d.session.notes}
                  </p>
                )}

                <Card className="gap-0 py-0">
                  <CardHeader className="border-b py-3">
                    <CardTitle className="text-sm">Conferência por meio de pagamento</CardTitle>
                  </CardHeader>
                  <CardContent className="px-0">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="pl-4">Meio</TableHead>
                          <TableHead className="text-right">Vendas</TableHead>
                          <TableHead className="text-right">Esperado</TableHead>
                          <TableHead className="text-right">Contado</TableHead>
                          <TableHead className="pr-4 text-right">Diferença</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {RECONCILED_METHODS.map((m) => {
                          const Icon = PAYMENT_ICON[m];
                          const countedValue =
                            counted?.[m] ?? (m === "Dinheiro" && d.session.closingAmount != null ? d.session.closingAmount : null);
                          const diff = countedValue != null ? round2(countedValue - d.expectedByMethod[m]) : null;
                          return (
                            <TableRow key={m}>
                              <TableCell className="pl-4">
                                <span className="flex items-center gap-2">
                                  <Icon className="size-4 text-muted-foreground" />
                                  {m}
                                </span>
                              </TableCell>
                              <TableCell className="tabular text-right">{formatCurrency(d.byMethod[m])}</TableCell>
                              <TableCell className="tabular text-right">{formatCurrency(d.expectedByMethod[m])}</TableCell>
                              <TableCell className="tabular text-right">
                                {countedValue != null ? formatCurrency(countedValue) : <span className="text-muted-foreground">—</span>}
                              </TableCell>
                              <TableCell className="pr-4 text-right">
                                <DifferenceValue value={diff} />
                              </TableCell>
                            </TableRow>
                          );
                        })}
                        {d.byMethod["Crediário"] > 0 && (
                          <TableRow className="text-muted-foreground">
                            <TableCell className="pl-4">Crediário (a receber)</TableCell>
                            <TableCell className="tabular text-right">{formatCurrency(d.byMethod["Crediário"])}</TableCell>
                            <TableCell colSpan={3} className="pr-4 text-right text-xs">
                              não entra na conferência
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                      <TableFooter>
                        <TableRow>
                          <TableCell colSpan={5} className="pl-4 text-xs font-normal text-muted-foreground">
                            Dinheiro esperado = inicial {formatCurrency(d.session.openingAmount)} + vendas em dinheiro{" "}
                            {formatCurrency(d.byMethod.Dinheiro)} + suprimentos {formatCurrency(d.suprimentos)} − sangrias{" "}
                            {formatCurrency(d.retiradas)} = <strong className="text-foreground">{formatCurrency(d.expectedCash)}</strong>
                          </TableCell>
                        </TableRow>
                      </TableFooter>
                    </Table>
                  </CardContent>
                </Card>

                <Tabs defaultValue="movements">
                  <TabsList>
                    <TabsTrigger value="movements">Suprimentos e sangrias ({d.movements.length})</TabsTrigger>
                    <TabsTrigger value="sales">Vendas ({d.sales.length})</TabsTrigger>
                  </TabsList>
                  <TabsContent value="movements" className="mt-3">
                    {d.movements.length === 0 ? (
                      <p className="rounded-lg border border-dashed py-8 text-center text-sm text-muted-foreground">
                        Nenhum suprimento ou sangria nesta sessão.
                      </p>
                    ) : (
                      <ol className="space-y-2">
                        {d.movements.map((m) => {
                          const supply = m.type === "suprimento";
                          return (
                            <li key={m._id} className="flex items-center gap-3 rounded-lg border px-3 py-2.5">
                              <div
                                className={cn(
                                  "flex size-8 shrink-0 items-center justify-center rounded-full",
                                  supply ? "bg-success/12 text-success" : "bg-destructive/12 text-destructive",
                                )}
                              >
                                {supply ? <ArrowDownToLine className="size-4" /> : <ArrowUpFromLine className="size-4" />}
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-medium">
                                  {supply ? "Suprimento" : "Sangria"} · {m.reason}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {formatDateTime(m.timestamp)} · {m.userName}
                                </p>
                              </div>
                              <span className={cn("tabular font-medium", supply ? "text-success" : "text-destructive")}>
                                {supply ? "+" : "−"}
                                {formatCurrency(m.amount)}
                              </span>
                            </li>
                          );
                        })}
                      </ol>
                    )}
                  </TabsContent>
                  <TabsContent value="sales" className="mt-3">
                    {d.sales.length === 0 ? (
                      <p className="rounded-lg border border-dashed py-8 text-center text-sm text-muted-foreground">
                        Nenhuma venda vinculada a este caixa.
                      </p>
                    ) : (
                      <div className="overflow-hidden rounded-lg border">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="pl-3">Nº</TableHead>
                              <TableHead>Hora</TableHead>
                              <TableHead>Pagamento</TableHead>
                              <TableHead>Status</TableHead>
                              <TableHead className="pr-3 text-right">Total</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {d.sales.map((sale) => (
                              <TableRow
                                key={sale._id}
                                className="cursor-pointer"
                                onClick={() => setSaleDetail({ sale, open: true })}
                              >
                                <TableCell className="tabular pl-3 font-medium">#{sale.saleNumber}</TableCell>
                                <TableCell className="tabular text-muted-foreground">{formatDateTime(sale.createdAt)}</TableCell>
                                <TableCell>{paymentLabel(sale)}</TableCell>
                                <TableCell>
                                  <SaleStatusBadge status={sale.status} />
                                </TableCell>
                                <TableCell
                                  className={cn(
                                    "tabular pr-3 text-right",
                                    sale.status === "CANCELLED" ? "text-muted-foreground line-through" : "font-medium",
                                  )}
                                >
                                  {formatCurrency(sale.total)}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </TabsContent>
                </Tabs>
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>
      <SaleDetailSheet
        sale={saleDetail.sale}
        open={saleDetail.open}
        onOpenChange={(o) => setSaleDetail((s) => ({ ...s, open: o }))}
        onChanged={(sale) => setSaleDetail((s) => ({ ...s, sale }))}
      />
    </>
  );
}

function Mini({
  label,
  value,
  hint,
  highlight,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  highlight?: boolean;
}) {
  return (
    <div className={cn("rounded-lg border p-3", highlight && "border-destructive/40 bg-destructive/5")}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="tabular mt-0.5 text-base font-semibold">{value}</div>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
