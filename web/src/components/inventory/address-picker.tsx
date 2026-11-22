"use client";

import { useState } from "react";
import { Check, ChevronsUpDown, MapPin } from "lucide-react";
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
import type { AddressWithProducts } from "@/lib/services/products";
import { cn } from "@/lib/utils";

interface AddressPickerProps {
  addresses: AddressWithProducts[];
  value?: string | null;
  onSelect: (address: AddressWithProducts) => void;
  placeholder?: string;
  className?: string;
  onlyActive?: boolean;
  resetOnSelect?: boolean;
  id?: string;
}

export function AddressPicker({
  addresses,
  value,
  onSelect,
  placeholder = "Selecionar endereço…",
  className,
  onlyActive = true,
  resetOnSelect,
  id,
}: AddressPickerProps) {
  const [open, setOpen] = useState(false);
  const selected = value ? addresses.find((a) => a._id === value) : undefined;
  const options = onlyActive ? addresses.filter((a) => a.active) : addresses;
  const aisles = [...new Set(options.map((a) => a.aisle))];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("w-full justify-between font-normal", className)}
        >
          {selected && !resetOnSelect ? (
            <span className="font-mono">{selected.code}</span>
          ) : (
            <span className="flex items-center gap-2 text-muted-foreground">
              <MapPin className="size-4" />
              {placeholder}
            </span>
          )}
          <ChevronsUpDown className="opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) min-w-72 p-0" align="start">
        <Command>
          <CommandInput placeholder="Buscar código, ex.: A-01-02" />
          <CommandList>
            <CommandEmpty>Nenhum endereço encontrado.</CommandEmpty>
            {aisles.map((aisle) => (
              <CommandGroup key={aisle} heading={`Corredor ${aisle}`}>
                {options
                  .filter((a) => a.aisle === aisle)
                  .map((address) => (
                    <CommandItem
                      key={address._id}
                      value={address._id}
                      keywords={[address.code, address.description ?? "", ...address.products.map((p) => p.name)]}
                      onSelect={() => {
                        onSelect(address);
                        setOpen(false);
                      }}
                    >
                      <span className="font-mono">{address.code}</span>
                      <span className="ml-auto truncate text-xs text-muted-foreground">
                        {address.products.length
                          ? `${address.products.length} produto${address.products.length > 1 ? "s" : ""}`
                          : "livre"}
                      </span>
                      <Check className={cn(value === address._id && !resetOnSelect ? "opacity-100" : "opacity-0")} />
                    </CommandItem>
                  ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
