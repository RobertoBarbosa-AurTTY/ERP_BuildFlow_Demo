"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, FileText, Mail, MapPin, Pencil, Phone, ShoppingBag } from "lucide-react";
import { ErrorState } from "@/components/query-state";
import { StatusBadge, type StatusTone } from "@/components/status-badge";
import { BillStatusBadge, DueIn } from "@/components/finance/bill-status";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import type { SaleStatus } from "@/lib/domain/types";
import { formatCurrency, formatDate, formatDateTime, formatDocument, formatPhone, initials } from "@/lib/format";
import { documentKind, getCustomerDetail } from "@/lib/services/customers";

const SALE_STATUS: Record<SaleStatus, { label: string; tone: StatusTone }> = {
  FINALIZED: { label: "Finalizada", tone: "success" },
  QUOTE: { label: "Orçamento", tone: "info" },
  CANCELLED: { label: "Cancelada", tone: "neutral" },
};

const PAGE = 10;

interface CustomerDetailSheetProps {
  customerId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  canEdit: boolean;
  onEdit: () => void;
}

export function CustomerDetailSheet({ customerId, open, onOpenChange, canEdit, onEdit }: CustomerDetailSheetProps) {
  const [visible, setVisible] = useState(PAGE);
  const query = useQuery({
    queryKey: ["customers", customerId, "detail"],
    queryFn: () => getCustomerDetail(customerId!),
    enabled: !!customerId,
  });
  const detail = query.data;

  return (
    <Dialog open={open && !!customerId} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-xl">
        <DialogHeader className="gap-1 p-4 border-b pr-12">
          {detail ? (
            <div className="flex items-center gap-3">
              <Avatar className="size-11">
                <AvatarFallback className="bg-primary/10 font-medium text-primary">
                  {initials(detail.customer.name)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <DialogTitle className="truncate text-lg">{detail.customer.name}</DialogTitle>
                <DialogDescription>
                  {documentKind(detail.customer.cpfCnpj) === "PJ" ? "Pessoa jurídica" : "Pessoa física"} · cliente desde{" "}
                  {formatDate(detail.customer.createdAt)}
                </DialogDescription>
              </div>
            </div>
          ) : (
            <>
              <DialogTitle>Cliente</DialogTitle>
              <DialogDescription>Carregando cadastro…</DialogDescription>
            </>
          )}
        </DialogHeader>

        <div className="flex-1 space-y-6 overflow-y-auto p-4">
          {query.isPending ? (
            <div className="space-y-3">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-48 w-full" />
            </div>
          ) : query.isError ? (
            <ErrorState error={query.error} onRetry={() => query.refetch()} />
          ) : detail ? (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Metric label="Total gasto" value={formatCurrency(detail.stats.totalSpent)} />
                <Metric label="Compras" value={String(detail.stats.purchaseCount)} />
                <Metric
                  label="Ticket médio"
                  value={formatCurrency(detail.stats.purchaseCount ? detail.stats.totalSpent / detail.stats.purchaseCount : 0)}
                />
                <Metric label="Última compra" value={detail.stats.lastPurchase ? formatDate(detail.stats.lastPurchase) : "—"} />
              </div>

              <section className="space-y-2 text-sm">
                <InfoLine icon={FileText} value={detail.customer.cpfCnpj ? formatDocument(detail.customer.cpfCnpj) : null} />
                <InfoLine icon={Phone} value={detail.customer.phone ? formatPhone(detail.customer.phone) : null} />
                <InfoLine icon={Mail} value={detail.customer.email} />
                <InfoLine icon={MapPin} value={detail.customer.address} />
                {detail.customer.notes && (
                  <p className="rounded-lg bg-muted/50 p-3 text-muted-foreground">{detail.customer.notes}</p>
                )}
                {canEdit && (
                  <Button variant="outline" size="sm" onClick={onEdit}>
                    <Pencil />
                    Editar cadastro
                  </Button>
                )}
              </section>

              <Separator />

              <section className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-medium">
                    Contas a receber em aberto
                    {detail.stats.openReceivables > 0 && (
                      <span className="ml-2 tabular text-muted-foreground">{formatCurrency(detail.stats.openReceivables)}</span>
                    )}
                  </h3>
                  {detail.receivables.length > 0 && (
                    <Button variant="link" size="sm" asChild className="px-0">
                      <Link href={`/receivables?cliente=${encodeURIComponent(detail.customer.name)}&status=open`}>
                        Ver no financeiro
                        <ArrowRight />
                      </Link>
                    </Button>
                  )}
                </div>
                {detail.receivables.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhuma conta em aberto.</p>
                ) : (
                  <ul className="divide-y rounded-lg border">
                    {detail.receivables.map((r) => (
                      <li key={r._id} className="flex items-center justify-between gap-3 p-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{r.description}</p>
                          <p className="text-xs text-muted-foreground">
                            Vence {formatDate(r.dueDate)} · <DueIn bill={r} />
                          </p>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1">
                          <span className="tabular text-sm font-medium">{formatCurrency(r.amount)}</span>
                          <BillStatusBadge bill={r} paidLabel="Recebido" />
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <Separator />

              <section className="space-y-3">
                <h3 className="font-medium">Histórico de compras</h3>
                {detail.sales.length === 0 ? (
                  <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                    <ShoppingBag className="size-5" />
                    Nenhuma compra vinculada a este cliente.
                  </div>
                ) : (
                  <>
                    <ul className="divide-y rounded-lg border">
                      {detail.sales.slice(0, visible).map((sale) => {
                        const status = SALE_STATUS[sale.status];
                        const qty = sale.items.length;
                        return (
                          <li key={sale._id} className="flex items-center justify-between gap-3 p-3">
                            <div className="min-w-0">
                              <p className="text-sm font-medium">
                                Venda #{sale.saleNumber}
                                <span className="ml-2 font-normal text-muted-foreground">{formatDateTime(sale.createdAt)}</span>
                              </p>
                              <p className="truncate text-xs text-muted-foreground">
                                {qty} {qty === 1 ? "item" : "itens"} · {sale.paymentMethod} ·{" "}
                                {sale.items.map((i) => i.name).join(", ")}
                              </p>
                            </div>
                            <div className="flex shrink-0 flex-col items-end gap-1">
                              <span className={sale.status === "CANCELLED" ? "tabular text-sm text-muted-foreground line-through" : "tabular text-sm font-medium"}>
                                {formatCurrency(sale.total)}
                              </span>
                              <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                    {detail.sales.length > visible && (
                      <Button variant="ghost" size="sm" className="w-full" onClick={() => setVisible((v) => v + PAGE)}>
                        Mostrar mais ({detail.sales.length - visible} restantes)
                      </Button>
                    )}
                  </>
                )}
              </section>
            </>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-muted/30 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="tabular mt-1 truncate font-semibold">{value}</p>
    </div>
  );
}

function InfoLine({ icon: Icon, value }: { icon: React.ComponentType<{ className?: string }>; value?: string | null }) {
  return (
    <div className="flex items-start gap-2">
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <span className={value ? "" : "text-muted-foreground"}>{value || "Não informado"}</span>
    </div>
  );
}
