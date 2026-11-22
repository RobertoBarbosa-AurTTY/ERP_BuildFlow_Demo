"use client";

import { CheckCircle2, FileText, Plus, Printer } from "lucide-react";
import type { Sale } from "@/lib/domain/types";
import { formatCurrency } from "@/lib/format";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Kbd } from "@/components/ui/kbd";
import { ScrollArea } from "@/components/ui/scroll-area";
import { printReceipt, ReceiptContent, ReceiptPrintPortal } from "./receipt";
import { useReceiptSettings } from "./queries";

interface ReceiptDialogProps {
  sale: Sale | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Quando informado, mostra o botão "Nova venda" (fluxo do PDV). */
  onNewSale?: () => void;
  /** Mostra o cabeçalho de sucesso (logo após finalizar). */
  success?: boolean;
}

export function ReceiptDialog({ sale, open, onOpenChange, onNewSale, success }: ReceiptDialogProps) {
  const { data: company } = useReceiptSettings();
  const isQuote = sale?.status === "QUOTE";

  return (
    <>
      <ReceiptPrintPortal sale={open ? sale : null} company={company} />
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          className="sm:max-w-md"
          onKeyDown={(e) => {
            if (e.key.toLowerCase() === "p" && !e.ctrlKey && !e.metaKey) {
              e.preventDefault();
              printReceipt();
            }
          }}
        >
          <DialogHeader>
            {success ? (
              <div className="flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-full bg-success/12 text-success">
                  {isQuote ? <FileText className="size-5" /> : <CheckCircle2 className="size-5" />}
                </div>
                <div className="space-y-0.5 text-left">
                  <DialogTitle>{isQuote ? "Orçamento salvo" : "Venda finalizada"}</DialogTitle>
                  <DialogDescription>
                    {isQuote ? "Orçamento" : "Venda"} #{sale?.saleNumber} · {formatCurrency(sale?.total)}
                    {sale?.change ? ` · troco ${formatCurrency(sale.change)}` : ""}
                  </DialogDescription>
                </div>
              </div>
            ) : (
              <>
                <DialogTitle>{isQuote ? "Orçamento" : "Cupom"} #{sale?.saleNumber}</DialogTitle>
                <DialogDescription>Pré-visualização do cupom não fiscal (80mm).</DialogDescription>
              </>
            )}
          </DialogHeader>

          {sale && (
            <ScrollArea className="max-h-[55svh] rounded-lg border border-dashed bg-muted/40">
              <div className="mx-auto w-[300px] max-w-full px-4 py-5">
                <ReceiptContent sale={sale} company={company} />
              </div>
            </ScrollArea>
          )}

          {success && sale?.change != null && sale.change > 0 && (
            <div className="flex items-center justify-between rounded-lg bg-success/10 px-4 py-3 text-success">
              <span className="text-sm font-medium">Troco</span>
              <span className="tabular text-2xl font-semibold">{formatCurrency(sale.change)}</span>
            </div>
          )}

          <DialogFooter className="gap-2 sm:justify-between">
            <Button variant="outline" onClick={printReceipt} disabled={!sale}>
              <Printer />
              Imprimir
              <Kbd className="ml-1">P</Kbd>
            </Button>
            {onNewSale ? (
              <Button autoFocus onClick={onNewSale}>
                <Plus />
                Nova venda
                <Kbd className="ml-1 bg-primary-foreground/20 text-primary-foreground">Enter</Kbd>
              </Button>
            ) : (
              <Button variant="secondary" onClick={() => onOpenChange(false)}>
                Fechar
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
