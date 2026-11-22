"use client";

import { useState } from "react";
import { PackageSearch } from "lucide-react";
import type { Product } from "@/lib/domain/types";
import { formatCurrency, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Kbd } from "@/components/ui/kbd";

export function normalizeText(value: string) {
  return value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

/** "3*cimento" → { qty: 3, term: "cimento" } (multiplicador estilo PDV). */
export function parseQuery(raw: string) {
  const match = raw.match(/^\s*(\d+(?:[.,]\d+)?)\s*[*xX]\s*(.*)$/);
  if (match) {
    const qty = Number(match[1].replace(",", "."));
    if (qty > 0) return { qty, term: match[2].trim() };
  }
  return { qty: 1, term: raw.trim() };
}

/** Match exato por código de barras ou SKU (leitor de código de barras). */
export function findExactProduct(products: Product[], term: string) {
  const t = term.trim().toLowerCase();
  if (!t) return undefined;
  return products.find((p) => p.barcode === term.trim() || p.sku.toLowerCase() === t);
}

export function searchProducts(products: Product[], term: string, limit = 60) {
  const t = normalizeText(term.trim());
  if (!t) return products.slice(0, limit);
  const tokens = t.split(/\s+/);
  const scored: { p: Product; score: number }[] = [];
  for (const p of products) {
    const sku = p.sku.toLowerCase();
    const name = normalizeText(p.name);
    let score = -1;
    if (p.barcode === term.trim() || sku === t) score = 100;
    else if (sku.startsWith(t) || p.barcode?.startsWith(t)) score = 80;
    else if (name.startsWith(t)) score = 60;
    else if (tokens.every((tok) => name.includes(tok) || sku.includes(tok) || normalizeText(p.category).includes(tok)))
      score = 40;
    if (score >= 0) scored.push({ p, score: score + (p.quantity > 0 ? 5 : 0) });
  }
  return scored
    .sort((a, b) => b.score - a.score || a.p.name.localeCompare(b.p.name, "pt-BR"))
    .slice(0, limit)
    .map((s) => s.p);
}

interface ProductSearchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  products: Product[];
  /** Quantidade já no carrinho por produto, para mostrar o saldo restante. */
  inCart: Map<string, number>;
  initialQuery?: string;
  onSelect: (product: Product, qty: number) => void;
}

export function ProductSearchDialog(props: ProductSearchDialogProps) {
  return (
    <CommandDialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      title="Buscar produto"
      description="Busque por nome, SKU ou código de barras"
      className="sm:max-w-2xl"
    >
      {props.open && <SearchBody {...props} />}
    </CommandDialog>
  );
}

function SearchBody({ products, inCart, initialQuery = "", onSelect, onOpenChange }: ProductSearchDialogProps) {
  const [query, setQuery] = useState(initialQuery);
  const { qty, term } = parseQuery(query);
  const results = searchProducts(products, term);

  return (
    <Command shouldFilter={false} className="rounded-none!">
      <CommandInput
        autoFocus
        value={query}
        onValueChange={setQuery}
        placeholder="Nome, SKU ou código de barras… (ex.: 3*cimento)"
      />
      <CommandList className="max-h-[min(60svh,460px)]">
        <CommandEmpty>
          <div className="flex flex-col items-center gap-2 text-muted-foreground">
            <PackageSearch className="size-6" />
            Nenhum produto encontrado.
          </div>
        </CommandEmpty>
        {results.length > 0 && (
          <CommandGroup heading={term ? `${results.length} resultado(s)` : "Produtos"}>
            {results.map((p) => {
              const available = p.quantity - (inCart.get(p._id) ?? 0);
              const out = available <= 0;
              return (
                <CommandItem
                  key={p._id}
                  value={p._id}
                  disabled={out}
                  onSelect={() => {
                    onSelect(p, qty);
                    onOpenChange(false);
                  }}
                  className="gap-3 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{p.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {p.sku}
                      {p.barcode ? ` · ${p.barcode}` : ""} · {p.category}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="tabular font-medium">{formatCurrency(p.price)}</p>
                    <p
                      className={cn(
                        "tabular text-xs",
                        out ? "text-destructive" : available <= p.minStock ? "text-warning" : "text-muted-foreground",
                      )}
                    >
                      {out ? "Sem saldo" : `${formatNumber(available)} ${p.unit} disp.`}
                    </p>
                  </div>
                </CommandItem>
              );
            })}
          </CommandGroup>
        )}
      </CommandList>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t px-3 py-2 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <Kbd>↑</Kbd>
          <Kbd>↓</Kbd> navegar
        </span>
        <span className="flex items-center gap-1">
          <Kbd>Enter</Kbd> adicionar{qty !== 1 ? ` ${formatNumber(qty)}×` : ""}
        </span>
        <span className="flex items-center gap-1">
          <Kbd>3*</Kbd> quantidade
        </span>
        <span className="ml-auto flex items-center gap-1">
          <Kbd>Esc</Kbd> fechar
        </span>
      </div>
    </Command>
  );
}
