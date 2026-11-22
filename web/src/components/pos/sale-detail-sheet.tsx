"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Ban, FileCheck2, Printer } from "lucide-react";
import type { Sale } from "@/lib/domain/types";
import { lineTotals } from "@/lib/domain/calc";
import { hasRole, useSession } from "@/lib/auth";
import { errorMessage } from "@/lib/errors";
import { formatCurrency, formatDateTime, formatNumber } from "@/lib/format";
import { cancelSale, convertQuote, isCustomItem, paymentLabel, type PaymentInput } from "@/lib/services/sales";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { CheckoutDialog } from "./checkout-dialog";
import { invalidateAfterSale } from "./queries";
import { ReceiptDialog } from "./receipt-dialog";
import { SaleStatusBadge } from "./sale-status";

interface SaleDetailSheetProps {
  sale: Sale | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Chamado com a venda atualizada após cancelar/converter. */
  onChanged?: (sale: Sale) => void;
}

/** Detalhe da venda com reimpressão, cancelamento e conversão de orçamento. */
export function SaleDetailSheet({ sale, open, onOpenChange, onChanged }: SaleDetailSheetProps) {
  const user = useSession();
  const canCancel = hasRole(user, ["Gerente"]);
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [convertOpen, setConvertOpen] = useState(false);
  const queryClient = useQueryClient();

  const convertMutation = useMutation({
    mutationFn: (payment: PaymentInput) => convertQuote(sale!._id, payment, user?.name ?? "Operador"),
    onSuccess: (updated) => {
      toast.success(`Orçamento #${updated.saleNumber} convertido em venda`);
      setConvertOpen(false);
      invalidateAfterSale(queryClient);
      onChanged?.(updated);
      setReceiptOpen(true);
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="flex max-h-[90vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-xl">
          {sale && (
            <>
              <DialogHeader className="gap-1 p-4 border-b pr-12">
                <div className="flex items-center gap-2">
                  <DialogTitle className="text-lg">
                    {sale.status === "QUOTE" ? "Orçamento" : "Venda"} #{sale.saleNumber}
                  </DialogTitle>
                  <SaleStatusBadge status={sale.status} />
                </div>
                <DialogDescription>{formatDateTime(sale.createdAt)}</DialogDescription>
              </DialogHeader>

              <ScrollArea className="min-h-0 flex-1">
                <div className="space-y-5 p-4">
                  {sale.status === "CANCELLED" && (
                    <Alert variant="destructive">
                      <Ban />
                      <AlertTitle>Venda cancelada em {formatDateTime(sale.cancelledAt)}</AlertTitle>
                      <AlertDescription>{sale.cancelReason || "Sem motivo informado."}</AlertDescription>
                    </Alert>
                  )}

                  <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                    <Info label="Cliente" value={sale.customerName ?? "Consumidor final"} />
                    <Info label="Operador" value={sale.userName} />
                    <Info label="Pagamento" value={paymentLabel(sale)} />
                    {sale.splitPayment ? (
                      <Info
                        label="Divisão"
                        value={`${formatCurrency(sale.splitPayment.cash)} + ${formatCurrency(sale.splitPayment.rest)}`}
                      />
                    ) : sale.amountPaid != null ? (
                      <Info
                        label="Recebido / troco"
                        value={`${formatCurrency(sale.amountPaid)} / ${formatCurrency(sale.change)}`}
                      />
                    ) : (
                      <Info label="Itens" value={`${sale.items.length}`} />
                    )}
                  </dl>

                  <div className="overflow-hidden rounded-lg border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Produto</TableHead>
                          <TableHead className="text-right">Qtd.</TableHead>
                          <TableHead className="text-right">Unit.</TableHead>
                          <TableHead className="text-right">Total</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {sale.items.map((item, i) => {
                          const line = lineTotals(item);
                          return (
                            <TableRow key={`${item.id}-${i}`}>
                              <TableCell className="max-w-56">
                                <p className="truncate font-medium">{item.name}</p>
                                <p className="text-xs text-muted-foreground">
                                  {isCustomItem(item) ? "Item avulso" : item.sku}
                                  {line.discount > 0 && (
                                    <span className="text-success">
                                      {" "}
                                      · desc.{" "}
                                      {item.discountType === "percent"
                                        ? `${formatNumber(item.discount)}%`
                                        : formatCurrency(item.discount)}
                                    </span>
                                  )}
                                </p>
                              </TableCell>
                              <TableCell className="tabular text-right">
                                {formatNumber(item.qty)} {item.unit}
                              </TableCell>
                              <TableCell className="tabular text-right">{formatCurrency(item.price)}</TableCell>
                              <TableCell className="tabular text-right font-medium">{formatCurrency(line.total)}</TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>

                  <dl className="space-y-1.5 text-sm">
                    <Row label="Subtotal" value={formatCurrency(sale.grossSubtotal)} />
                    <Row label="Desconto nos itens" value={`−${formatCurrency(sale.itemsDiscountTotal)}`} />
                    <Row
                      label={`Desconto geral${sale.globalDiscountType === "percent" && sale.globalDiscount ? ` (${formatNumber(sale.globalDiscount)}%)` : ""}`}
                      value={`−${formatCurrency(sale.globalDiscountAmount)}`}
                    />
                    <Separator className="my-2" />
                    <div className="flex items-center justify-between">
                      <dt className="font-medium">Total</dt>
                      <dd className="tabular text-xl font-semibold">{formatCurrency(sale.total)}</dd>
                    </div>
                  </dl>
                </div>
              </ScrollArea>

              <DialogFooter className="mx-0 mb-0 flex-row flex-wrap gap-2 border-t">
                <Button variant="outline" onClick={() => setReceiptOpen(true)}>
                  <Printer />
                  {sale.status === "QUOTE" ? "Imprimir orçamento" : "Reimprimir cupom"}
                </Button>
                {sale.status === "QUOTE" && (
                  <Button onClick={() => setConvertOpen(true)}>
                    <FileCheck2 />
                    Converter em venda
                  </Button>
                )}
                {sale.status !== "CANCELLED" &&
                  (canCancel ? (
                    <Button variant="destructive" className="sm:ml-auto" onClick={() => setCancelOpen(true)}>
                      <Ban />
                      Cancelar {sale.status === "QUOTE" ? "orçamento" : "venda"}
                    </Button>
                  ) : (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="sm:ml-auto">
                          <Button variant="destructive" disabled>
                            <Ban />
                            Cancelar
                          </Button>
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>Somente Gerente ou Admin</TooltipContent>
                    </Tooltip>
                  ))}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <ReceiptDialog sale={sale} open={receiptOpen} onOpenChange={setReceiptOpen} />

      <CancelSaleDialog
        sale={sale}
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        onCancelled={(updated) => onChanged?.(updated)}
      />

      {sale?.status === "QUOTE" && (
        <CheckoutDialog
          open={convertOpen}
          onOpenChange={setConvertOpen}
          title={`Converter orçamento #${sale.saleNumber}`}
          total={sale.total}
          itemCount={sale.items.length}
          customerName={sale.customerName}
          pending={convertMutation.isPending}
          onConfirm={(payment) => convertMutation.mutate(payment)}
        />
      )}
    </>
  );
}

export function CancelSaleDialog({
  sale,
  open,
  onOpenChange,
  onCancelled,
}: {
  sale: Sale | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCancelled?: (sale: Sale) => void;
}) {
  const user = useSession();
  const queryClient = useQueryClient();
  const [reason, setReason] = useState("");

  const mutation = useMutation({
    mutationFn: () => cancelSale(sale!._id, reason, { name: user?.name ?? "", role: user?.role ?? "Operador" }),
    onSuccess: (updated) => {
      toast.success(`${sale?.status === "QUOTE" ? "Orçamento" : "Venda"} #${updated.saleNumber} cancelado(a)`, {
        description: sale?.status === "FINALIZED" ? "Estoque estornado." : undefined,
      });
      invalidateAfterSale(queryClient);
      onCancelled?.(updated);
      setReason("");
      onOpenChange(false);
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const valid = reason.trim().length >= 3;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (mutation.isPending) return;
        if (!next) setReason("");
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (valid) mutation.mutate();
          }}
        >
          <DialogHeader>
            <DialogTitle>
              Cancelar {sale?.status === "QUOTE" ? "orçamento" : "venda"} #{sale?.saleNumber}?
            </DialogTitle>
            <DialogDescription>
              {sale?.status === "FINALIZED"
                ? `Os itens voltam ao estoque (movimento de estorno) e o valor de ${formatCurrency(sale.total)} sai do caixa. Esta ação não pode ser desfeita.`
                : "O orçamento ficará marcado como cancelado."}
            </DialogDescription>
          </DialogHeader>
          <Field>
            <FieldLabel htmlFor="cancel-reason">Motivo do cancelamento</FieldLabel>
            <Textarea
              id="cancel-reason"
              autoFocus
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ex.: cliente desistiu da compra"
            />
            <FieldDescription>Fica registrado na venda e na auditoria.</FieldDescription>
          </Field>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>
              Voltar
            </Button>
            <Button type="submit" variant="destructive" disabled={!valid || mutation.isPending}>
              {mutation.isPending && <Spinner />}
              Confirmar cancelamento
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="truncate font-medium">{value}</dd>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-muted-foreground">
      <dt>{label}</dt>
      <dd className="tabular">{value}</dd>
    </div>
  );
}
