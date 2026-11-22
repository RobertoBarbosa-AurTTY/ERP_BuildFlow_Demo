"use client";

import { Minus, PackagePlus, Percent, Plus, Trash2 } from "lucide-react";
import type { ProductUnit, SaleItem } from "@/lib/domain/types";
import { lineTotals } from "@/lib/domain/calc";
import { formatCurrency, formatNumber } from "@/lib/format";
import { isCustomItem } from "@/lib/services/sales";
import { cn } from "@/lib/utils";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Kbd } from "@/components/ui/kbd";
import { parseMoney } from "./money";

const FRACTIONAL_UNITS: ProductUnit[] = ["M", "M2", "M3", "KG", "L"];

export function isFractional(unit: ProductUnit) {
  return FRACTIONAL_UNITS.includes(unit);
}

interface CartTableProps {
  items: SaleItem[];
  selected: number;
  onSelect: (index: number) => void;
  /** Saldo do produto no estoque (undefined para avulso). */
  stockOf: (item: SaleItem) => number | undefined;
  onQtyChange: (index: number, qty: number) => void;
  onDiscount: (index: number) => void;
  onRemove: (index: number) => void;
}

export function CartTable({ items, selected, onSelect, stockOf, onQtyChange, onDiscount, onRemove }: CartTableProps) {
  if (!items.length) {
    return (
      <Empty className="h-full border-0">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <PackagePlus />
          </EmptyMedia>
          <EmptyTitle>Carrinho vazio</EmptyTitle>
          <EmptyDescription>
            Leia o código de barras ou pressione <Kbd>F2</Kbd> para buscar produtos.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <ul className="divide-y" role="listbox" aria-label="Itens da venda">
      {items.map((item, index) => {
        const line = lineTotals(item);
        const stock = stockOf(item);
        const custom = isCustomItem(item);
        const atLimit = stock !== undefined && item.qty >= stock;
        const step = isFractional(item.unit) ? 0.5 : 1;
        return (
          <li
            key={`${item.id}-${index}`}
            role="option"
            aria-selected={selected === index}
            onClick={() => onSelect(index)}
            className={cn(
              "group grid grid-cols-[1.75rem_1fr_auto] items-center gap-x-3 gap-y-2 px-3 py-2.5 transition-colors sm:grid-cols-[1.75rem_1fr_auto_auto_auto]",
              selected === index ? "bg-primary/6" : "hover:bg-muted/50",
            )}
          >
            <span
              className={cn(
                "tabular text-xs text-muted-foreground",
                selected === index && "font-semibold text-primary",
              )}
            >
              {String(index + 1).padStart(2, "0")}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{item.name}</p>
              <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                <span>{custom ? "Item avulso" : item.sku}</span>
                <span className="tabular">
                  {formatCurrency(item.price)} / {item.unit}
                </span>
                {stock !== undefined && (
                  <span className={cn("tabular", atLimit && "text-warning")}>
                    estoque {formatNumber(stock)}
                  </span>
                )}
              </p>
            </div>

            <div className="col-span-3 col-start-2 flex items-center gap-1 sm:col-span-1 sm:col-start-auto">
              <Button
                size="icon-sm"
                variant="outline"
                aria-label="Diminuir quantidade"
                disabled={item.qty <= step}
                onClick={(e) => {
                  e.stopPropagation();
                  onQtyChange(index, Math.max(step, item.qty - step));
                }}
              >
                <Minus />
              </Button>
              <QtyInput
                key={`${item.id}-${item.qty}`}
                value={item.qty}
                fractional={isFractional(item.unit)}
                onCommit={(qty) => onQtyChange(index, qty)}
              />
              <Button
                size="icon-sm"
                variant="outline"
                aria-label="Aumentar quantidade"
                disabled={atLimit}
                onClick={(e) => {
                  e.stopPropagation();
                  onQtyChange(index, item.qty + step);
                }}
              >
                <Plus />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className={cn("ml-1 sm:hidden", item.discount > 0 && "text-success")}
                onClick={(e) => {
                  e.stopPropagation();
                  onDiscount(index);
                }}
              >
                <Percent />
                {item.discount > 0 ? discountLabel(item) : "Desc."}
              </Button>
            </div>

            <div className="hidden w-24 justify-end sm:flex">
              {item.discount > 0 ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDiscount(index);
                  }}
                >
                  <StatusBadge tone="success" className="tabular">
                    −{discountLabel(item)}
                  </StatusBadge>
                </button>
              ) : (
                <Button
                  size="xs"
                  variant="ghost"
                  className="text-muted-foreground opacity-0 group-hover:opacity-100 group-aria-selected:opacity-100 focus-visible:opacity-100"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDiscount(index);
                  }}
                >
                  <Percent />
                  Desconto
                </Button>
              )}
            </div>

            <div className="col-start-3 row-start-1 flex items-center gap-1 sm:col-start-auto sm:row-start-auto">
              <div className="w-24 text-right">
                <p className="tabular text-sm font-semibold">{formatCurrency(line.total)}</p>
                {line.discount > 0 && (
                  <p className="tabular text-xs text-muted-foreground line-through">{formatCurrency(line.gross)}</p>
                )}
              </div>
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label={`Remover ${item.name}`}
                className="text-muted-foreground hover:text-destructive"
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove(index);
                }}
              >
                <Trash2 />
              </Button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function discountLabel(item: SaleItem) {
  return item.discountType === "percent" ? `${formatNumber(item.discount)}%` : formatCurrency(item.discount);
}

const qtyText = (value: number) => String(value).replace(".", ",");

function QtyInput({
  value,
  fractional,
  onCommit,
}: {
  value: number;
  fractional: boolean;
  onCommit: (qty: number) => void;
}) {
  const commit = (input: HTMLInputElement) => {
    const parsed = parseMoney(input.value);
    const qty = fractional ? Math.round(parsed * 1000) / 1000 : Math.floor(parsed);
    if (!Number.isNaN(qty) && qty > 0 && qty !== value) onCommit(qty);
    else input.value = qtyText(value);
  };
  return (
    <input
      defaultValue={qtyText(value)}
      inputMode={fractional ? "decimal" : "numeric"}
      aria-label="Quantidade"
      onClick={(e) => e.stopPropagation()}
      onFocus={(e) => e.currentTarget.select()}
      onBlur={(e) => commit(e.currentTarget)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          e.currentTarget.blur();
        }
      }}
      className="tabular h-7 w-14 rounded-md border border-input bg-transparent text-center text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
    />
  );
}
