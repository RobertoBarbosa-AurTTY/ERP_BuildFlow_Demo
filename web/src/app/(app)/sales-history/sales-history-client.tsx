"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Ban,
  ChevronLeft,
  ChevronRight,
  Eye,
  FileCheck2,
  FileText,
  MoreHorizontal,
  Printer,
  Receipt,
  Search,
  ShoppingCart,
  TrendingUp,
  X,
} from "lucide-react";
import type { PaymentMethod, Sale, SaleStatus } from "@/lib/domain/types";
import { PAYMENT_METHODS } from "@/lib/domain/types";
import { round2 } from "@/lib/domain/calc";
import { hasRole, useSession } from "@/lib/auth";
import { formatCurrency, formatDateTime, toDateInput } from "@/lib/format";
import { errorMessage } from "@/lib/errors";
import {
  convertQuote,
  listSales,
  paymentLabel,
  SALE_STATUS_LABEL,
  type PaymentInput,
  type SaleFilters,
} from "@/lib/services/sales";
import { PageHeader } from "@/components/page-header";
import { EmptyState, ErrorState } from "@/components/query-state";
import { StatCard } from "@/components/stat-card";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CheckoutDialog } from "@/components/pos/checkout-dialog";
import { ReceiptDialog } from "@/components/pos/receipt-dialog";
import { SaleDetailSheet, CancelSaleDialog } from "@/components/pos/sale-detail-sheet";
import { SaleStatusBadge } from "@/components/pos/sale-status";
import { PAYMENT_ICON } from "@/components/pos/payment-methods";
import { invalidateAfterSale } from "@/components/pos/queries";

const PAGE_SIZE = 20;

function daysAgoInput(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return toDateInput(d);
}

const PRESETS = [
  { label: "Hoje", days: 0 },
  { label: "7 dias", days: 6 },
  { label: "30 dias", days: 29 },
  { label: "90 dias", days: 89 },
];

export function SalesHistoryClient() {
  const user = useSession();
  const canCancel = hasRole(user, ["Gerente"]);
  const queryClient = useQueryClient();

  const [filters, setFilters] = useState<Required<Omit<SaleFilters, "search">>>({
    start: daysAgoInput(29),
    end: toDateInput(),
    status: "all",
    paymentMethod: "all",
  });
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [detail, setDetail] = useState<{ sale: Sale | null; open: boolean }>({ sale: null, open: false });
  const [receipt, setReceipt] = useState<{ sale: Sale | null; open: boolean }>({ sale: null, open: false });
  const [cancelTarget, setCancelTarget] = useState<{ sale: Sale | null; open: boolean }>({ sale: null, open: false });
  const [convertTarget, setConvertTarget] = useState<{ sale: Sale | null; open: boolean }>({ sale: null, open: false });

  const query = useQuery({
    queryKey: ["sales", "list", filters],
    queryFn: () => listSales(filters),
  });

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase().replace(/^#/, "");
    const all = query.data ?? [];
    if (!term) return all;
    return all.filter((s) =>
      [String(s.saleNumber), s.customerName ?? "", s.userName].join(" ").toLowerCase().includes(term),
    );
  }, [query.data, search]);

  const kpis = useMemo(() => {
    const finalized = rows.filter((s) => s.status === "FINALIZED");
    const revenue = round2(finalized.reduce((sum, s) => sum + s.total, 0));
    const discounts = round2(finalized.reduce((sum, s) => sum + s.totalDiscount, 0));
    return {
      revenue,
      count: finalized.length,
      ticket: finalized.length ? revenue / finalized.length : 0,
      discounts,
      quotes: rows.filter((s) => s.status === "QUOTE").length,
      cancelled: rows.filter((s) => s.status === "CANCELLED").length,
    };
  }, [rows]);

  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const pageRows = rows.slice(currentPage * PAGE_SIZE, currentPage * PAGE_SIZE + PAGE_SIZE);

  const convertMutation = useMutation({
    mutationFn: (args: { id: string; payment: PaymentInput }) =>
      convertQuote(args.id, args.payment, user?.name ?? "Operador"),
    onSuccess: (sale) => {
      toast.success(`Orçamento #${sale.saleNumber} convertido em venda`);
      setConvertTarget({ sale: null, open: false });
      invalidateAfterSale(queryClient);
      setReceipt({ sale, open: true });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const updateFilter = <K extends keyof typeof filters>(key: K, value: (typeof filters)[K]) => {
    setFilters((f) => ({ ...f, [key]: value }));
    setPage(0);
  };

  const activePreset = PRESETS.find((p) => filters.start === daysAgoInput(p.days) && filters.end === toDateInput());
  const hasExtraFilters = filters.status !== "all" || filters.paymentMethod !== "all" || search;

  return (
    <>
      <PageHeader
        title="Histórico de vendas"
        description="Consulte vendas, orçamentos e cancelamentos. Reimprima cupons e converta orçamentos."
        actions={
          <Button asChild>
            <Link href="/pos">
              <ShoppingCart />
              Ir para o PDV
            </Link>
          </Button>
        }
      />

      <Card className="gap-4 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="grid gap-1.5">
            <Label className="text-xs text-muted-foreground">Período</Label>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex rounded-lg bg-muted p-0.5">
                {PRESETS.map((p) => (
                  <Button
                    key={p.label}
                    size="sm"
                    variant={activePreset === p ? "outline" : "ghost"}
                    className={activePreset === p ? "bg-background shadow-xs" : "text-muted-foreground"}
                    onClick={() => {
                      setFilters((f) => ({ ...f, start: daysAgoInput(p.days), end: toDateInput() }));
                      setPage(0);
                    }}
                  >
                    {p.label}
                  </Button>
                ))}
              </div>
              <Input
                type="date"
                aria-label="Data inicial"
                className="w-38"
                value={filters.start}
                max={filters.end}
                onChange={(e) => updateFilter("start", e.target.value)}
              />
              <span className="text-xs text-muted-foreground">até</span>
              <Input
                type="date"
                aria-label="Data final"
                className="w-38"
                value={filters.end}
                min={filters.start}
                onChange={(e) => updateFilter("end", e.target.value)}
              />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs text-muted-foreground">Status</Label>
            <Select value={filters.status} onValueChange={(v) => updateFilter("status", v as SaleStatus | "all")}>
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {(Object.keys(SALE_STATUS_LABEL) as SaleStatus[]).map((s) => (
                  <SelectItem key={s} value={s}>
                    {SALE_STATUS_LABEL[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs text-muted-foreground">Pagamento</Label>
            <Select
              value={filters.paymentMethod}
              onValueChange={(v) => updateFilter("paymentMethod", v as PaymentMethod | "all")}
            >
              <SelectTrigger className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os meios</SelectItem>
                {PAYMENT_METHODS.map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid min-w-56 flex-1 gap-1.5">
            <Label className="text-xs text-muted-foreground">Buscar</Label>
            <InputGroup>
              <InputGroupAddon>
                <Search />
              </InputGroupAddon>
              <InputGroupInput
                placeholder="Nº da venda, cliente ou operador"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(0);
                }}
              />
            </InputGroup>
          </div>
          {hasExtraFilters && (
            <Button
              variant="ghost"
              size="sm"
              className="mb-0.5"
              onClick={() => {
                setFilters((f) => ({ ...f, status: "all", paymentMethod: "all" }));
                setSearch("");
                setPage(0);
              }}
            >
              <X />
              Limpar filtros
            </Button>
          )}
        </div>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Faturamento"
          value={formatCurrency(kpis.revenue)}
          hint={`${kpis.count} venda(s) finalizada(s)`}
          icon={TrendingUp}
          tone="success"
          loading={query.isPending}
        />
        <StatCard label="Ticket médio" value={formatCurrency(kpis.ticket)} icon={Receipt} loading={query.isPending} />
        <StatCard
          label="Descontos concedidos"
          value={formatCurrency(kpis.discounts)}
          hint={kpis.revenue ? `${((kpis.discounts / (kpis.revenue + kpis.discounts)) * 100).toFixed(1).replace(".", ",")}% do bruto` : undefined}
          icon={FileText}
          tone="warning"
          loading={query.isPending}
        />
        <StatCard
          label="Orçamentos · Cancelamentos"
          value={`${kpis.quotes} · ${kpis.cancelled}`}
          hint="no período filtrado"
          icon={Ban}
          tone="destructive"
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
        <EmptyState
          icon={Receipt}
          title="Nenhuma venda encontrada"
          description="Ajuste o período ou os filtros para ver outras vendas."
        />
      ) : (
        <Card className="gap-0 overflow-hidden py-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="w-20 pl-4">Nº</TableHead>
                <TableHead>Data</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead className="hidden md:table-cell">Operador</TableHead>
                <TableHead>Pagamento</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="w-12 pr-4" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageRows.map((sale) => {
                const Icon = sale.status === "QUOTE" ? FileText : PAYMENT_ICON[sale.splitPayment ? "Dinheiro" : sale.paymentMethod];
                return (
                  <TableRow
                    key={sale._id}
                    className="cursor-pointer"
                    onClick={() => setDetail({ sale, open: true })}
                  >
                    <TableCell className="tabular pl-4 font-medium">#{sale.saleNumber}</TableCell>
                    <TableCell className="tabular whitespace-nowrap text-muted-foreground">
                      {formatDateTime(sale.createdAt)}
                    </TableCell>
                    <TableCell className="max-w-48 truncate">
                      {sale.customerName ?? <span className="text-muted-foreground">Consumidor final</span>}
                    </TableCell>
                    <TableCell className="hidden max-w-40 truncate text-muted-foreground md:table-cell">
                      {sale.userName}
                    </TableCell>
                    <TableCell>
                      <span className="flex items-center gap-1.5 whitespace-nowrap">
                        <Icon className="size-3.5 text-muted-foreground" />
                        {paymentLabel(sale)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <SaleStatusBadge status={sale.status} />
                    </TableCell>
                    <TableCell
                      className={
                        sale.status === "CANCELLED"
                          ? "tabular text-right text-muted-foreground line-through"
                          : "tabular text-right font-medium"
                      }
                    >
                      {formatCurrency(sale.total)}
                    </TableCell>
                    <TableCell className="pr-4" onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu modal={false}>
                        <DropdownMenuTrigger asChild>
                          <Button size="icon-sm" variant="ghost" aria-label={`Ações da venda ${sale.saleNumber}`}>
                            <MoreHorizontal />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onSelect={() => setDetail({ sale, open: true })}>
                            <Eye />
                            Ver detalhes
                          </DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => setReceipt({ sale, open: true })}>
                            <Printer />
                            {sale.status === "QUOTE" ? "Imprimir orçamento" : "Reimprimir cupom"}
                          </DropdownMenuItem>
                          {sale.status === "QUOTE" && (
                            <DropdownMenuItem onSelect={() => setConvertTarget({ sale, open: true })}>
                              <FileCheck2 />
                              Converter em venda
                            </DropdownMenuItem>
                          )}
                          {sale.status !== "CANCELLED" && canCancel && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                variant="destructive"
                                onSelect={() => setCancelTarget({ sale, open: true })}
                              >
                                <Ban />
                                Cancelar
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
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
              <Button
                size="icon-sm"
                variant="outline"
                aria-label="Página anterior"
                disabled={currentPage === 0}
                onClick={() => setPage(currentPage - 1)}
              >
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

      <SaleDetailSheet
        sale={detail.sale}
        open={detail.open}
        onOpenChange={(open) => setDetail((d) => ({ ...d, open }))}
        onChanged={(sale) => setDetail((d) => ({ ...d, sale }))}
      />
      <ReceiptDialog
        sale={receipt.sale}
        open={receipt.open}
        onOpenChange={(open) => setReceipt((r) => ({ ...r, open }))}
      />
      <CancelSaleDialog
        sale={cancelTarget.sale}
        open={cancelTarget.open}
        onOpenChange={(open) => setCancelTarget((c) => ({ ...c, open }))}
      />
      {convertTarget.sale && (
        <CheckoutDialog
          open={convertTarget.open}
          onOpenChange={(open) => setConvertTarget((c) => ({ ...c, open }))}
          title={`Converter orçamento #${convertTarget.sale.saleNumber}`}
          total={convertTarget.sale.total}
          itemCount={convertTarget.sale.items.length}
          customerName={convertTarget.sale.customerName}
          pending={convertMutation.isPending}
          onConfirm={(payment) => convertMutation.mutate({ id: convertTarget.sale!._id, payment })}
        />
      )}
    </>
  );
}
