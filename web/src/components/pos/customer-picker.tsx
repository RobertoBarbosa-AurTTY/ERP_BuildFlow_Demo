"use client";

import { Check, UserRound, UserRoundX } from "lucide-react";
import type { Customer } from "@/lib/domain/types";
import { formatDocument } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { Kbd } from "@/components/ui/kbd";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface CustomerPickerProps {
  customers: Customer[];
  value: string | null;
  onChange: (id: string | null) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  loading?: boolean;
}

export function CustomerPicker({ customers, value, onChange, open, onOpenChange, loading }: CustomerPickerProps) {
  const selected = customers.find((c) => c._id === value) ?? null;

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="h-auto w-full justify-start gap-3 px-3 py-2 text-left" disabled={loading}>
          <div
            className={cn(
              "flex size-8 shrink-0 items-center justify-center rounded-full",
              selected ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
            )}
          >
            <UserRound className="size-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{selected?.name ?? "Consumidor final"}</p>
            <p className="truncate text-xs font-normal text-muted-foreground">
              {selected ? formatDocument(selected.cpfCnpj) || selected.phone || "Cliente cadastrado" : "Selecionar cliente"}
            </p>
          </div>
          <Kbd>F3</Kbd>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) min-w-72 p-0" align="start">
        <Command
          filter={(itemValue, search) => {
            const normalize = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
            return normalize(itemValue).includes(normalize(search)) ? 1 : 0;
          }}
        >
          <CommandInput placeholder="Nome, CPF/CNPJ ou telefone…" autoFocus />
          <CommandList>
            <CommandEmpty>Nenhum cliente encontrado.</CommandEmpty>
            {selected && (
              <>
                <CommandGroup>
                  <CommandItem
                    value="__none__ consumidor final remover"
                    onSelect={() => {
                      onChange(null);
                      onOpenChange(false);
                    }}
                  >
                    <UserRoundX />
                    Remover cliente (consumidor final)
                  </CommandItem>
                </CommandGroup>
                <CommandSeparator />
              </>
            )}
            <CommandGroup heading="Clientes">
              {customers.map((c) => (
                <CommandItem
                  key={c._id}
                  value={`${c.name} ${c.cpfCnpj ?? ""} ${c.phone ?? ""} ${c._id}`}
                  onSelect={() => {
                    onChange(c._id);
                    onOpenChange(false);
                  }}
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate">{c.name}</p>
                    {c.cpfCnpj && <p className="truncate text-xs text-muted-foreground">{formatDocument(c.cpfCnpj)}</p>}
                  </div>
                  <Check className={cn("size-4", c._id === value ? "opacity-100" : "opacity-0")} />
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
