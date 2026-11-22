"use client";

import Link from "next/link";
import { CalendarClock, MapPin, Pencil, SlidersHorizontal, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState, ErrorState } from "@/components/query-state";
import { StatusBadge } from "@/components/status-badge";
import { daysUntil, margin, stockStatus } from "@/lib/domain/calc";
import type { Product } from "@/lib/domain/types";
import { formatCurrency, formatDate, formatDateTime, formatNumber, formatPercent } from "@/lib/format";
import { locationCode } from "@/lib/services/products";
import { cn } from "@/lib/utils";
import { Barcode } from "./barcode";
import { useStockMovements } from "./queries";
import { MovementTypeBadge, StockStatusBadge } from "./stock-badges";

interface ProductDetailDialogProps {
  product: Product | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit: (product: Product) => void;
  onAdjust: (product: Product) => void;
}

export function ProductDetailDialog({ product, open, onOpenChange, onEdit, onAdjust }: ProductDetailDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] gap-0 overflow-y-auto p-0 sm:max-w-3xl">
        {product && (
          <>
            <DialogHeader className="gap-1 border-b p-5 pr-12">
              <div className="flex flex-wrap items-center gap-2">
                <DialogTitle className="text-lg leading-tight">{product.name}</DialogTitle>
                <StockStatusBadge status={stockStatus(product)} />
                {!product.active && <StatusBadge>Inativo</StatusBadge>}
              </div>
              <DialogDescription>
                <span className="font-mono">{product.sku}</span> · {product.category}
                {product.brand ? ` · ${product.brand}` : ""}
              </DialogDescription>
              <div className="flex flex-wrap gap-2 pt-2">
                <Button size="sm" variant="outline" onClick={() => onEdit(product)}>
                  <Pencil /> Editar
                </Button>
                <Button size="sm" variant="outline" onClick={() => onAdjust(product)} disabled={!product.active}>
                  <SlidersHorizontal /> Ajustar estoque
                </Button>
                <Button size="sm" variant="outline" asChild>
                  <Link href={`/price-tag?product=${product._id}`}>
                    <Tag /> Etiqueta
                  </Link>
                </Button>
                <Button size="sm" variant="outline" asChild>
                  <Link href={`/address?product=${product._id}`}>
                    <MapPin /> Endereçar
                  </Link>
                </Button>
              </div>
            </DialogHeader>
            <div className="space-y-6 p-5">
              <ProductSummary product={product} />
              <Separator />
              <MovementHistory productId={product._id} unit={product.unit} />
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Info({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("space-y-0.5", className)}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium">{children}</dd>
    </div>
  );
}

function ProductSummary({ product }: { product: Product }) {
  const m = margin(product);
  const expiryDays = product.perishable ? daysUntil(product.expiryDate) : Infinity;
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ["Saldo", `${formatNumber(product.quantity)} ${product.unit}`],
          ["Preço de venda", formatCurrency(product.price)],
          ["Custo", formatCurrency(product.costPrice)],
          ["Margem", formatPercent(m)],
        ].map(([label, value]) => (
          <div key={label} className="rounded-lg border bg-muted/30 p-3">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="tabular mt-1 text-lg font-semibold">{value}</p>
          </div>
        ))}
      </div>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
        <Info label="Estoque mín. / máx.">
          <span className="tabular">
            {formatNumber(product.minStock)} / {product.maxStock ? formatNumber(product.maxStock) : "—"}
          </span>
        </Info>
        <Info label="Valor em estoque (custo)">
          <span className="tabular">{formatCurrency(product.quantity * product.costPrice)}</span>
        </Info>
        <Info label="Fornecedor">{product.supplier || "—"}</Info>
        <Info label="Endereço">
          {product.location?.aisle ? (
            <span className="font-mono">{locationCode(product.location)}</span>
          ) : (
            <span className="text-muted-foreground">Sem endereço</span>
          )}
        </Info>
        <Info label="Validade">
          {product.perishable ? (
            <span
              className={cn(
                "inline-flex items-center gap-1",
                expiryDays < 0 ? "text-destructive" : expiryDays <= 30 ? "text-warning" : undefined,
              )}
            >
              <CalendarClock className="size-3.5" />
              {formatDate(product.expiryDate)}
              {expiryDays < 0 ? " (vencido)" : expiryDays <= 30 ? ` (${expiryDays} dias)` : ""}
            </span>
          ) : (
            <span className="text-muted-foreground">Não perecível</span>
          )}
        </Info>
        <Info label="Cadastro">{formatDate(product.createdAt)}</Info>
      </dl>
      {product.barcode && (
        <div className="flex items-center gap-4 rounded-lg border p-3">
          <div className="w-44 rounded bg-white p-1.5 text-black">
            <Barcode value={product.barcode} height={40} className="h-14 w-full" />
          </div>
          <div className="text-sm">
            <p className="text-xs text-muted-foreground">Código de barras</p>
            <p className="font-mono">{product.barcode}</p>
          </div>
        </div>
      )}
    </div>
  );
}

function MovementHistory({ productId, unit }: { productId: string; unit: string }) {
  const { data, isLoading, error, refetch } = useStockMovements({ productId });
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold">Histórico de movimentações</h3>
      {error ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : !data?.length ? (
        <EmptyState title="Sem movimentações" description="Entradas, vendas e ajustes deste produto aparecerão aqui." />
      ) : (
        <div className="overflow-hidden rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead className="text-right">Qtd.</TableHead>
                <TableHead className="text-right">Saldo</TableHead>
                <TableHead>Detalhe</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((m) => (
                <TableRow key={m._id}>
                  <TableCell className="whitespace-nowrap text-muted-foreground">{formatDateTime(m.timestamp)}</TableCell>
                  <TableCell>
                    <MovementTypeBadge type={m.type} />
                  </TableCell>
                  <TableCell
                    className={cn("tabular text-right font-medium", m.quantity >= 0 ? "text-success" : "text-destructive")}
                  >
                    {m.quantity > 0 ? "+" : ""}
                    {formatNumber(m.quantity)}
                  </TableCell>
                  <TableCell className="tabular text-right">
                    {formatNumber(m.newQuantity)} <span className="text-xs text-muted-foreground">{unit}</span>
                  </TableCell>
                  <TableCell className="max-w-56">
                    <p className="truncate text-sm">{m.reference ?? m.reason ?? "—"}</p>
                    {m.userName && <p className="truncate text-xs text-muted-foreground">{m.userName}</p>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
