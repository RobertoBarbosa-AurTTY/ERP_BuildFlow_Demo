"use client";

import { useState } from "react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { AddressWithProducts } from "@/lib/services/products";
import { cn } from "@/lib/utils";

interface WarehouseMapProps {
  addresses: AddressWithProducts[];
  selectedId?: string | null;
  /** Endereço atual do produto em foco. */
  highlightId?: string | null;
  onSelect?: (address: AddressWithProducts) => void;
  /** Corredor exibido (controlado). */
  aisleKey?: string;
  onAisleChange?: (key: string) => void;
}

export function aisleKeyOf(a: { deposit: string; aisle: string }) {
  return `${a.deposit}|${a.aisle}`;
}

const sortCodes = (a: string, b: string) => a.localeCompare(b, "pt-BR", { numeric: true });

/** Mapa visual do depósito: corredor → prateleiras → níveis × posições. */
export function WarehouseMap({ addresses, selectedId, highlightId, onSelect, aisleKey, onAisleChange }: WarehouseMapProps) {
  const keys = [...new Set(addresses.map(aisleKeyOf))].sort(sortCodes);
  const deposits = new Set(addresses.map((a) => a.deposit));
  const [internal, setInternal] = useState<string | undefined>(undefined);
  const current = aisleKey ?? internal ?? keys[0];
  const setAisle = (key: string) => {
    setInternal(key);
    onAisleChange?.(key);
  };

  const inAisle = addresses.filter((a) => aisleKeyOf(a) === current);
  const shelves = [...new Set(inAisle.map((a) => a.shelf))].sort(sortCodes);

  if (!keys.length) return null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          value={current}
          onValueChange={(v) => v && setAisle(v)}
          className="flex-wrap"
        >
          {keys.map((key) => {
            const [deposit, aisle] = key.split("|");
            const count = addresses.filter((a) => aisleKeyOf(a) === key && a.products.length).length;
            return (
              <ToggleGroupItem key={key} value={key} className="gap-1.5 px-3 font-mono">
                {deposits.size > 1 ? `${deposit.replace(/\D/g, "")}·` : ""}
                {aisle}
                {count > 0 && <span className="text-[10px] text-muted-foreground">{count}</span>}
              </ToggleGroupItem>
            );
          })}
        </ToggleGroup>
        <Legend />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
        {shelves.map((shelf) => {
          const cells = inAisle.filter((a) => a.shelf === shelf);
          const levels = [...new Set(cells.map((a) => a.level))].sort(sortCodes).reverse();
          const slots = [...new Set(cells.map((a) => a.slot))].sort(sortCodes);
          return (
            <div key={shelf} className="rounded-lg border bg-muted/20 p-3">
              <p className="mb-2 text-xs font-medium text-muted-foreground">
                Corredor {inAisle[0]?.aisle} · Prateleira {shelf}
              </p>
              <div className="space-y-1.5">
                {levels.map((level) => (
                  <div key={level} className="flex items-center gap-1.5">
                    <span className="w-7 shrink-0 font-mono text-[10px] text-muted-foreground">N{level}</span>
                    <div className="grid flex-1 gap-1.5" style={{ gridTemplateColumns: `repeat(${slots.length}, minmax(0, 1fr))` }}>
                      {slots.map((slot) => {
                        const cell = cells.find((a) => a.level === level && a.slot === slot);
                        if (!cell) return <div key={slot} className="h-9 rounded-md border border-dashed opacity-40" />;
                        const occupied = cell.products.length > 0;
                        const selected = cell._id === selectedId;
                        const highlighted = cell._id === highlightId;
                        return (
                          <Tooltip key={slot}>
                            <TooltipTrigger asChild>
                              <button
                                type="button"
                                onClick={() => onSelect?.(cell)}
                                aria-pressed={selected}
                                aria-label={`${cell.code}${occupied ? `, ${cell.products.length} produto(s)` : ", livre"}`}
                                className={cn(
                                  "flex h-9 items-center justify-center rounded-md border font-mono text-[11px] transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                                  !cell.active && "border-dashed bg-muted text-muted-foreground/60",
                                  cell.active && !occupied && "bg-card hover:bg-muted",
                                  cell.active && occupied && "border-primary/30 bg-primary/15 text-primary hover:bg-primary/25",
                                  highlighted && "border-success/50 bg-success/20 text-success",
                                  selected && "ring-2 ring-primary ring-offset-1 ring-offset-background",
                                )}
                              >
                                {slot}
                              </button>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p className="font-mono">{cell.code}</p>
                              <p>
                                {!cell.active
                                  ? "Inativo"
                                  : occupied
                                    ? cell.products.map((p) => p.name).join(", ")
                                    : "Livre"}
                              </p>
                            </TooltipContent>
                          </Tooltip>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Legend() {
  const item = (cls: string, label: string) => (
    <span className="flex items-center gap-1.5">
      <span className={cn("size-3 rounded-sm border", cls)} />
      {label}
    </span>
  );
  return (
    <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
      {item("bg-card", "Livre")}
      {item("border-primary/30 bg-primary/15", "Ocupado")}
      {item("border-success/50 bg-success/20", "Produto atual")}
      {item("border-dashed bg-muted", "Inativo")}
    </div>
  );
}
