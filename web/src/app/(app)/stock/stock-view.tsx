"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useMutation } from "@tanstack/react-query";
import {
  AlertTriangle,
  Boxes,
  CalendarClock,
  Download,
  Eye,
  FileDown,
  FileUp,
  MapPin,
  MoreHorizontal,
  PackagePlus,
  Pencil,
  Power,
  PowerOff,
  Search,
  SearchX,
  SlidersHorizontal,
  Tag,
  Tags,
  Wallet,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { PageHeader } from "@/components/page-header";
import { EmptyState, ErrorState } from "@/components/query-state";
import { StatCard } from "@/components/stat-card";
import { StatusBadge } from "@/components/status-badge";
import { downloadCsv } from "@/components/inventory/csv";
import { ProductDetailDialog } from "@/components/inventory/product-detail-dialog";
import { ProductFormDialog } from "@/components/inventory/product-form-dialog";
import { useCategories, useInvalidateInventory, useProducts, useStockStats } from "@/components/inventory/queries";
import { StockAdjustDialog } from "@/components/inventory/stock-adjust-dialog";
import { StockStatusBadge } from "@/components/inventory/stock-badges";
import { SortButton, sortBy, TablePagination, type SortDir } from "@/components/inventory/table-tools";
import { daysUntil, margin, STOCK_STATUS_LABEL, stockStatus } from "@/lib/domain/calc";
import type { Product, StockStatus } from "@/lib/domain/types";
import { errorMessage } from "@/lib/errors";
import { formatCurrency, formatDate, formatNumber, formatPercent, toDateInput } from "@/lib/format";
import { locationCode, matchesSearch, setProductActive } from "@/lib/services/products";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 15;
const EXPIRY_WINDOW = 30;

type StatusFilter = "all" | StockStatus | "expiring" | "inactive";
type SortKey = "name" | "category" | "quantity" | "costPrice" | "price" | "margin" | "value";

function isExpiring(p: Product) {
  return p.perishable && !!p.expiryDate && daysUntil(p.expiryDate) <= EXPIRY_WINDOW;
}

export function StockView() {
  const products = useProducts({ includeInactive: true });
  const stats = useStockStats();
  const { data: categories = [] } = useCategories();
  const invalidate = useInvalidateInventory();

  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [showInactive, setShowInactive] = useState(false);
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({ key: "name", dir: "asc" });
  const [page, setPage] = useState(1);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [adjusting, setAdjusting] = useState<Product | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [deactivating, setDeactivating] = useState<Product | null>(null);

  const all = useMemo(() => products.data ?? [], [products.data]);
  const detail = detailId ? (all.find((p) => p._id === detailId) ?? null) : null;

  const filtered = useMemo(() => {
    const list = all.filter((p) => {
      if (status === "inactive") {
        if (p.active) return false;
      } else if (!p.active && !showInactive) return false;
      if (!matchesSearch(p, search)) return false;
      if (category !== "all" && p.category !== category) return false;
      if (status === "expiring") return isExpiring(p);
      if (status !== "all" && status !== "inactive" && stockStatus(p) !== status) return false;
      return true;
    });
    const getters: Record<SortKey, (p: Product) => string | number> = {
      name: (p) => p.name,
      category: (p) => p.category,
      quantity: (p) => p.quantity,
      costPrice: (p) => p.costPrice,
      price: (p) => p.price,
      margin: (p) => margin(p),
      value: (p) => p.quantity * p.costPrice,
    };
    return sortBy(list, getters[sort.key], sort.dir);
  }, [all, search, category, status, showInactive, sort]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pages);
  const visible = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const hasFilters = !!search || category !== "all" || status !== "all" || showInactive;

  const resetPage = <T,>(fn: (v: T) => void) => (v: T) => {
    fn(v);
    setPage(1);
  };

  const onSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "name" || key === "category" ? "asc" : "desc" }));

  const toggleActive = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) => setProductActive(id, active),
    onSuccess: async (p) => {
      await invalidate();
      toast.success(p.active ? "Produto reativado" : "Produto desativado", { description: p.name });
    },
    onError: (error) => toast.error("Não foi possível alterar o produto", { description: errorMessage(error) }),
  });

  const exportCsv = () => {
    if (!filtered.length) {
      toast.info("Nenhum produto para exportar");
      return;
    }
    downloadCsv(
      `estoque-${toDateInput()}.csv`,
      ["SKU", "Código de barras", "Produto", "Categoria", "Marca", "Fornecedor", "Unidade", "Quantidade", "Mínimo", "Máximo", "Custo", "Preço", "Margem %", "Valor em estoque (custo)", "Endereço", "Validade", "Status", "Ativo"],
      filtered.map((p) => [
        p.sku,
        p.barcode,
        p.name,
        p.category,
        p.brand,
        p.supplier,
        p.unit,
        p.quantity,
        p.minStock,
        p.maxStock,
        p.costPrice,
        p.price,
        Math.round(margin(p) * 1000) / 10,
        Math.round(p.quantity * p.costPrice * 100) / 100,
        locationCode(p.location),
        p.perishable ? formatDate(p.expiryDate) : "",
        STOCK_STATUS_LABEL[stockStatus(p)],
        p.active ? "Sim" : "Não",
      ]),
    );
    toast.success("CSV exportado", { description: `${formatNumber(filtered.length)} produtos` });
  };

  const openNew = () => {
    setEditing(null);
    setFormOpen(true);
  };
  const openEdit = (p: Product) => {
    setEditing(p);
    setFormOpen(true);
  };

  const s = stats.data;

  return (
    <>
      <PageHeader
        title="Estoque"
        description="Catálogo de produtos, saldos, validade e endereçamento."
        actions={
          <>
            <Button variant="outline" asChild>
              <Link href="/receiving">
                <FileDown /> Entradas
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/import">
                <FileUp /> Importar XML
              </Link>
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" aria-label="Mais ações">
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuLabel>Etiquetas</DropdownMenuLabel>
                <DropdownMenuItem asChild>
                  <Link href="/price-tag">
                    <Tag /> Etiquetas de preço
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/shelf-label">
                    <Tags /> Placas de prateleira
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuLabel>Depósito</DropdownMenuLabel>
                <DropdownMenuItem asChild>
                  <Link href="/address">
                    <MapPin /> Endereçar produtos
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/new-address">
                    <Boxes /> Gerenciar endereços
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={exportCsv}>
                  <Download /> Exportar CSV
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button onClick={openNew}>
              <PackagePlus /> Novo produto
            </Button>
          </>
        }
      />

      {stats.error ? (
        <ErrorState error={stats.error} onRetry={() => stats.refetch()} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Itens cadastrados"
            icon={Boxes}
            loading={stats.isLoading}
            value={formatNumber(s?.totalItems)}
            hint={`${formatNumber(s?.totalUnits)} unidades em estoque`}
          />
          <StatCard
            label="Valor em estoque (custo)"
            icon={Wallet}
            tone="success"
            loading={stats.isLoading}
            value={formatCurrency(s?.costValue)}
            hint={`${formatCurrency(s?.saleValue)} a preço de venda`}
          />
          <button type="button" className="text-left" onClick={() => resetPage(setStatus)("low")}>
            <StatCard
              label="Baixo estoque"
              icon={AlertTriangle}
              tone="warning"
              loading={stats.isLoading}
              value={formatNumber(s?.lowStock)}
              hint={`${formatNumber(s?.outOfStock)} sem estoque · ver lista`}
              className="h-full transition-colors hover:bg-muted/40"
            />
          </button>
          <button type="button" className="text-left" onClick={() => resetPage(setStatus)("expiring")}>
            <StatCard
              label="Vencendo em 30 dias"
              icon={CalendarClock}
              tone="destructive"
              loading={stats.isLoading}
              value={formatNumber(s?.expiringSoon)}
              hint="Perecíveis vencidos ou a vencer"
              className="h-full transition-colors hover:bg-muted/40"
            />
          </button>
        </div>
      )}

      <Card className="gap-0 py-0">
        <div className="flex flex-col gap-3 border-b p-4 lg:flex-row lg:items-center">
          <InputGroup className="lg:max-w-sm">
            <InputGroupAddon>
              <Search />
            </InputGroupAddon>
            <InputGroupInput
              placeholder="Buscar por nome, SKU ou código de barras"
              value={search}
              onChange={(e) => resetPage(setSearch)(e.target.value)}
            />
            {search && (
              <InputGroupAddon align="inline-end">
                <InputGroupButton size="icon-xs" aria-label="Limpar busca" onClick={() => resetPage(setSearch)("")}>
                  <X />
                </InputGroupButton>
              </InputGroupAddon>
            )}
          </InputGroup>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={category} onValueChange={resetPage(setCategory)}>
              <SelectTrigger className="w-44" aria-label="Categoria">
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper">
                <SelectItem value="all">Todas as categorias</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c._id} value={c.name}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={status} onValueChange={(v) => resetPage(setStatus)(v as StatusFilter)}>
              <SelectTrigger className="w-44" aria-label="Status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper">
                <SelectItem value="all">Todos os status</SelectItem>
                {(Object.keys(STOCK_STATUS_LABEL) as StockStatus[]).map((key) => (
                  <SelectItem key={key} value={key}>
                    {STOCK_STATUS_LABEL[key]}
                  </SelectItem>
                ))}
                <SelectItem value="expiring">Vencendo / vencidos</SelectItem>
                <SelectItem value="inactive">Inativos</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex items-center gap-2 px-1">
              <Switch id="show-inactive" checked={showInactive} onCheckedChange={resetPage(setShowInactive)} size="sm" />
              <Label htmlFor="show-inactive" className="text-sm font-normal text-muted-foreground">
                Incluir inativos
              </Label>
            </div>
            {hasFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSearch("");
                  setCategory("all");
                  setStatus("all");
                  setShowInactive(false);
                  setPage(1);
                }}
              >
                Limpar filtros
              </Button>
            )}
          </div>
          <span className="tabular text-sm text-muted-foreground lg:ml-auto">
            {products.isLoading ? "" : `${formatNumber(filtered.length)} produtos`}
          </span>
        </div>

        {products.error ? (
          <div className="p-4">
            <ErrorState error={products.error} onRetry={() => products.refetch()} />
          </div>
        ) : products.isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 8 }, (_, i) => (
              <Skeleton key={i} className="h-11 w-full" />
            ))}
          </div>
        ) : !filtered.length ? (
          <div className="p-4">
            {all.length ? (
              <EmptyState icon={SearchX} title="Nenhum produto encontrado" description="Ajuste a busca ou os filtros." />
            ) : (
              <EmptyState title="Nenhum produto cadastrado" description="Cadastre o primeiro produto ou importe uma NF-e.">
                <Button onClick={openNew}>
                  <PackagePlus /> Novo produto
                </Button>
              </EmptyState>
            )}
          </div>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="pl-4">
                    <SortButton column="name" label="Produto" sort={sort} onSort={onSort} />
                  </TableHead>
                  <TableHead className="hidden md:table-cell">
                    <SortButton column="category" label="Categoria" sort={sort} onSort={onSort} />
                  </TableHead>
                  <TableHead className="hidden xl:table-cell">Endereço</TableHead>
                  <TableHead className="text-right">
                    <SortButton column="quantity" label="Saldo" sort={sort} onSort={onSort} />
                  </TableHead>
                  <TableHead className="hidden text-right lg:table-cell">
                    <SortButton column="costPrice" label="Custo" sort={sort} onSort={onSort} />
                  </TableHead>
                  <TableHead className="text-right">
                    <SortButton column="price" label="Preço" sort={sort} onSort={onSort} />
                  </TableHead>
                  <TableHead className="hidden text-right lg:table-cell">
                    <SortButton column="margin" label="Margem" sort={sort} onSort={onSort} />
                  </TableHead>
                  <TableHead className="hidden text-right 2xl:table-cell">
                    <SortButton column="value" label="Valor (custo)" sort={sort} onSort={onSort} />
                  </TableHead>
                  <TableHead className="hidden sm:table-cell">Status</TableHead>
                  <TableHead className="w-12 pr-4" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((p) => {
                  const st = stockStatus(p);
                  const m = margin(p);
                  const expDays = p.perishable ? daysUntil(p.expiryDate) : Infinity;
                  return (
                    <TableRow
                      key={p._id}
                      className={cn("cursor-pointer", !p.active && "opacity-60")}
                      onClick={() => setDetailId(p._id)}
                    >
                      <TableCell className="max-w-72 pl-4">
                        <div className="flex items-center gap-2">
                          <span className="truncate font-medium">{p.name}</span>
                          {!p.active && <StatusBadge>Inativo</StatusBadge>}
                          {expDays <= EXPIRY_WINDOW && (
                            <StatusBadge tone={expDays < 0 ? "destructive" : "warning"} className="gap-1">
                              <CalendarClock className="size-3" />
                              {expDays < 0 ? "Vencido" : `${expDays}d`}
                            </StatusBadge>
                          )}
                        </div>
                        <p className="truncate font-mono text-xs text-muted-foreground">
                          {p.sku}
                          {p.barcode ? ` · ${p.barcode}` : ""}
                        </p>
                      </TableCell>
                      <TableCell className="hidden text-muted-foreground md:table-cell">{p.category}</TableCell>
                      <TableCell className="hidden font-mono text-xs text-muted-foreground xl:table-cell">
                        {locationCode(p.location) || "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <span
                          className={cn(
                            "tabular font-medium",
                            st === "out" && "text-destructive",
                            st === "low" && "text-warning",
                          )}
                        >
                          {formatNumber(p.quantity)}
                        </span>{" "}
                        <span className="text-xs text-muted-foreground">{p.unit}</span>
                      </TableCell>
                      <TableCell className="tabular hidden text-right text-muted-foreground lg:table-cell">
                        {formatCurrency(p.costPrice)}
                      </TableCell>
                      <TableCell className="tabular text-right font-medium">{formatCurrency(p.price)}</TableCell>
                      <TableCell
                        className={cn(
                          "tabular hidden text-right lg:table-cell",
                          m < 0 ? "text-destructive" : m < 0.15 ? "text-warning" : "text-muted-foreground",
                        )}
                      >
                        {formatPercent(m)}
                      </TableCell>
                      <TableCell className="tabular hidden text-right text-muted-foreground 2xl:table-cell">
                        {formatCurrency(p.quantity * p.costPrice)}
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        <StockStatusBadge status={st} />
                      </TableCell>
                      <TableCell className="pr-4" onClick={(e) => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon-sm" aria-label={`Ações de ${p.name}`}>
                              <MoreHorizontal />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-48">
                            <DropdownMenuItem onSelect={() => setDetailId(p._id)}>
                              <Eye /> Ver detalhes
                            </DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => openEdit(p)}>
                              <Pencil /> Editar
                            </DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => setAdjusting(p)} disabled={!p.active}>
                              <SlidersHorizontal /> Ajustar estoque
                            </DropdownMenuItem>
                            <DropdownMenuItem asChild>
                              <Link href={`/price-tag?product=${p._id}`}>
                                <Tag /> Imprimir etiqueta
                              </Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem asChild>
                              <Link href={`/address?product=${p._id}`}>
                                <MapPin /> Endereçar
                              </Link>
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            {p.active ? (
                              <DropdownMenuItem variant="destructive" onSelect={() => setDeactivating(p)}>
                                <PowerOff /> Desativar
                              </DropdownMenuItem>
                            ) : (
                              <DropdownMenuItem onSelect={() => toggleActive.mutate({ id: p._id, active: true })}>
                                <Power /> Reativar
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            <div className="border-t p-3">
              <TablePagination page={currentPage} pageSize={PAGE_SIZE} total={filtered.length} onPageChange={setPage} />
            </div>
          </>
        )}
      </Card>

      <ProductFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        product={editing}
        onSaved={(p) => {
          if (!editing) setDetailId(p._id);
        }}
      />
      <StockAdjustDialog product={adjusting} open={!!adjusting} onOpenChange={(o) => !o && setAdjusting(null)} />
      <ProductDetailDialog
        product={detail}
        open={!!detail}
        onOpenChange={(o) => !o && setDetailId(null)}
        onEdit={openEdit}
        onAdjust={setAdjusting}
      />
      <ConfirmDialog
        open={!!deactivating}
        onOpenChange={(o) => !o && setDeactivating(null)}
        title="Desativar produto?"
        description={
          deactivating
            ? `"${deactivating.name}" deixará de aparecer no PDV e nas listas de estoque. O histórico é mantido e você pode reativá-lo depois.`
            : undefined
        }
        confirmLabel="Desativar"
        destructive
        onConfirm={() => {
          if (deactivating) toggleActive.mutate({ id: deactivating._id, active: false });
          setDeactivating(null);
        }}
      />
    </>
  );
}
