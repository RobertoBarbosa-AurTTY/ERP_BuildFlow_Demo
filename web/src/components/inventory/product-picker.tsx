"use client";

import { useState } from "react";
import { Check, ChevronsUpDown, PackageSearch } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { Product } from "@/lib/domain/types";
import { formatCurrency, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useProducts } from "./queries";

interface ProductPickerProps {
  value?: string | null;
  onSelect: (product: Product) => void;
  placeholder?: string;
  /** IDs que não devem aparecer (ex.: já adicionados). */
  excludeIds?: string[];
  className?: string;
  invalid?: boolean;
  /** Mantém o texto do placeholder mesmo após escolher (modo "adicionar"). */
  resetOnSelect?: boolean;
  id?: string;
}

export function ProductPicker({
  value,
  onSelect,
  placeholder = "Selecionar produto…",
  excludeIds,
  className,
  invalid,
  resetOnSelect,
  id,
}: ProductPickerProps) {
  const [open, setOpen] = useState(false);
  const { data: products = [], isLoading } = useProducts();
  const selected = value ? products.find((p) => p._id === value) : undefined;
  const options = excludeIds?.length ? products.filter((p) => !excludeIds.includes(p._id)) : products;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-invalid={invalid || undefined}
          className={cn("w-full justify-between font-normal", className)}
        >
          {selected && !resetOnSelect ? (
            <span className="flex min-w-0 items-center gap-2">
              <span className="truncate">{selected.name}</span>
              <span className="shrink-0 font-mono text-xs text-muted-foreground">{selected.sku}</span>
            </span>
          ) : (
            <span className="flex items-center gap-2 text-muted-foreground">
              <PackageSearch className="size-4" />
              {placeholder}
            </span>
          )}
          <ChevronsUpDown className="opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) min-w-80 p-0" align="start">
        <Command>
          <CommandInput placeholder="Nome, SKU ou código de barras…" />
          <CommandList>
            <CommandEmpty>{isLoading ? "Carregando…" : "Nenhum produto encontrado."}</CommandEmpty>
            <CommandGroup>
              {options.map((product) => (
                <CommandItem
                  key={product._id}
                  value={product._id}
                  keywords={[product.name, product.sku, product.barcode ?? "", product.brand ?? ""]}
                  onSelect={() => {
                    onSelect(product);
                    setOpen(false);
                  }}
                >
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate">{product.name}</span>
                    <span className="text-xs text-muted-foreground">
                      <span className="font-mono">{product.sku}</span> · {formatNumber(product.quantity)} {product.unit} ·{" "}
                      {formatCurrency(product.price)}
                    </span>
                  </div>
                  <Check className={cn("ml-auto", value === product._id && !resetOnSelect ? "opacity-100" : "opacity-0")} />
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
