"use client";

import { useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import type { CompanySettings, Sale } from "@/lib/domain/types";
import { lineTotals } from "@/lib/domain/calc";
import { formatCurrency, formatDateTime, formatDocument, formatNumber, formatPhone } from "@/lib/format";
import { paymentLabel } from "@/lib/services/sales";
import { cn } from "@/lib/utils";

/** Cupom não fiscal (80mm). Usado na pré-visualização e na impressão. */
export function ReceiptContent({
  sale,
  company,
  className,
}: {
  sale: Sale;
  company?: CompanySettings;
  className?: string;
}) {
  const isQuote = sale.status === "QUOTE";
  const isCancelled = sale.status === "CANCELLED";
  return (
    <div className={cn("receipt font-mono text-[11px] leading-snug", className)}>
      <div className="text-center">
        <p className="text-[13px] font-bold uppercase">{company?.tradeName ?? "BuildFlow"}</p>
        {company && (
          <>
            <p>{company.companyName}</p>
            <p>CNPJ {formatDocument(company.cnpj)}</p>
            {company.address && <p>{company.address}</p>}
            {company.phone && <p>Tel. {formatPhone(company.phone)}</p>}
          </>
        )}
      </div>
      <Divider />
      <p className="text-center font-bold">
        {isQuote ? "ORÇAMENTO" : "CUPOM NÃO FISCAL"} Nº {sale.saleNumber}
      </p>
      {isCancelled && <p className="text-center font-bold">*** VENDA CANCELADA ***</p>}
      <p className="text-center">{formatDateTime(sale.createdAt)}</p>
      <Divider />
      <div className="space-y-1">
        {sale.items.map((item, index) => {
          const line = lineTotals(item);
          return (
            <div key={`${item.id}-${index}`}>
              <p className="truncate">
                {String(index + 1).padStart(3, "0")} {item.name}
              </p>
              <div className="flex justify-between gap-2">
                <span>
                  {formatNumber(item.qty)} {item.unit} x {formatCurrency(item.price)}
                </span>
                <span className="tabular">{formatCurrency(line.gross)}</span>
              </div>
              {line.discount > 0 && (
                <div className="flex justify-between gap-2">
                  <span>desconto</span>
                  <span className="tabular">-{formatCurrency(line.discount)}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <Divider />
      <Row label="Subtotal" value={formatCurrency(sale.grossSubtotal)} />
      {sale.totalDiscount > 0 && <Row label="Descontos" value={`-${formatCurrency(sale.totalDiscount)}`} />}
      <Row label="TOTAL" value={formatCurrency(sale.total)} strong />
      {!isQuote && (
        <>
          <Divider />
          {sale.splitPayment ? (
            <>
              <Row label="Dinheiro" value={formatCurrency(sale.splitPayment.cash)} />
              <Row label={sale.splitPayment.method} value={formatCurrency(sale.splitPayment.rest)} />
            </>
          ) : (
            <Row label={paymentLabel(sale)} value={formatCurrency(sale.amountPaid ?? sale.total)} />
          )}
          {sale.change != null && sale.change > 0 && <Row label="Troco" value={formatCurrency(sale.change)} />}
        </>
      )}
      <Divider />
      {sale.customerName && <p>Cliente: {sale.customerName}</p>}
      <p>Operador: {sale.userName}</p>
      {isQuote && <p className="mt-1 text-center">Orçamento válido por 7 dias. Sujeito à disponibilidade de estoque.</p>}
      <p className="mt-2 text-center">{company?.receiptFooter ?? "Obrigado pela preferência!"}</p>
      <p className="mt-1 text-center">*** NÃO É DOCUMENTO FISCAL ***</p>
    </div>
  );
}

function Divider() {
  return <div className="my-1.5 border-t border-dashed border-current opacity-60" />;
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={cn("flex justify-between gap-2", strong && "text-[13px] font-bold")}>
      <span>{label}</span>
      <span className="tabular">{value}</span>
    </div>
  );
}

const PRINT_CSS = `
.bf-receipt-print { display: none; }
@media print {
  @page { size: 80mm auto; margin: 0; }
  html, body { background: white !important; }
  body > *:not(.bf-receipt-print) { display: none !important; }
  .bf-receipt-print { display: block !important; width: 80mm; padding: 4mm 3mm; box-sizing: border-box; }
  .bf-receipt-print, .bf-receipt-print * { color: black !important; background: transparent !important; }
}
`;

const noopSubscribe = () => () => {};

/**
 * Renderiza o cupom num portal invisível na tela; `window.print()` imprime só ele.
 */
export function ReceiptPrintPortal({ sale, company }: { sale: Sale | null; company?: CompanySettings }) {
  const mounted = useSyncExternalStore(noopSubscribe, () => true, () => false);
  if (!mounted || !sale) return null;
  return createPortal(
    <div className="bf-receipt-print" aria-hidden>
      <style>{PRINT_CSS}</style>
      <ReceiptContent sale={sale} company={company} />
    </div>,
    document.body,
  );
}

export function printReceipt() {
  // Dá um frame para o portal montar antes de abrir o diálogo de impressão.
  requestAnimationFrame(() => window.print());
}
