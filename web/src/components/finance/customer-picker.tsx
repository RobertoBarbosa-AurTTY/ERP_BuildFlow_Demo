"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronsUpDown, UserPlus, UserRound, X } from "lucide-react";
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
import { formatDocument } from "@/lib/format";
import { listCustomers } from "@/lib/services/customers";
import { cn } from "@/lib/utils";
import type { PartyValue } from "./bill-form-sheet";

interface CustomerPickerProps {
  value: PartyValue;
  onChange: (value: PartyValue) => void;
  invalid?: boolean;
}

/** Combobox de clientes cadastrados, com opção de cliente avulso (só o nome). */
export function CustomerPicker({ value, onChange, invalid }: CustomerPickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const { data: customers = [], isPending } = useQuery({
    queryKey: ["customers", "list", ""],
    queryFn: () => listCustomers(),
  });
  const typed = search.trim();

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-invalid={invalid}
          className={cn("w-full justify-between font-normal", !value.name && "text-muted-foreground")}
        >
          <span className="flex min-w-0 items-center gap-2">
            <UserRound className="text-muted-foreground" />
            <span className="truncate">{value.name || "Selecionar cliente"}</span>
            {value.name && !value.id && <span className="text-xs text-muted-foreground">(avulso)</span>}
          </span>
          {value.name ? (
            <X
              className="opacity-60 hover:opacity-100"
              onPointerDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onChange({ name: "" });
              }}
            />
          ) : (
            <ChevronsUpDown className="opacity-50" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) min-w-72 p-0" align="start">
        <Command>
          <CommandInput placeholder="Buscar por nome ou documento…" value={search} onValueChange={setSearch} />
          <CommandList>
            <CommandEmpty>{isPending ? "Carregando…" : "Nenhum cliente encontrado."}</CommandEmpty>
            {typed && (
              <CommandGroup>
                <CommandItem
                  value={`__avulso__ ${typed}`}
                  onSelect={() => {
                    onChange({ name: typed });
                    setOpen(false);
                  }}
                >
                  <UserPlus />
                  Usar &ldquo;{typed}&rdquo; como cliente avulso
                </CommandItem>
              </CommandGroup>
            )}
            <CommandGroup heading="Clientes cadastrados">
              {customers.map((c) => (
                <CommandItem
                  key={c._id}
                  value={`${c.name} ${c.cpfCnpj ?? ""} ${c._id}`}
                  data-checked={value.id === c._id}
                  onSelect={() => {
                    onChange({ id: c._id, name: c.name });
                    setOpen(false);
                  }}
                >
                  <div className="min-w-0">
                    <p className="truncate">{c.name}</p>
                    {c.cpfCnpj && <p className="text-xs text-muted-foreground">{formatDocument(c.cpfCnpj)}</p>}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
