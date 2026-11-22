"use client";

import { FilterX, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EMPTY_FILTERS, type BillFilters as Filters, type StatusFilter } from "./bill-utils";

interface BillFiltersProps {
  value: Filters;
  onChange: (value: Filters) => void;
  categories: string[];
  parties: string[];
  partyLabel: string; // "Fornecedor" | "Cliente"
  paidLabel: string; // "Pagas" | "Recebidas"
}

export function BillFilters({ value, onChange, categories, parties, partyLabel, paidLabel }: BillFiltersProps) {
  const set = <K extends keyof Filters>(key: K, v: Filters[K]) => onChange({ ...value, [key]: v });
  const dirty = JSON.stringify(value) !== JSON.stringify(EMPTY_FILTERS);

  const statusOptions: { value: StatusFilter; label: string }[] = [
    { value: "open", label: "Em aberto" },
    { value: "pending", label: "A vencer" },
    { value: "overdue", label: "Vencidas" },
    { value: "paid", label: paidLabel },
    { value: "cancelled", label: "Canceladas" },
    { value: "all", label: "Todos os status" },
  ];

  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-end">
      <InputGroup className="lg:max-w-xs">
        <InputGroupAddon>
          <Search />
        </InputGroupAddon>
        <InputGroupInput
          placeholder="Buscar descrição, documento…"
          value={value.search}
          onChange={(e) => set("search", e.target.value)}
          aria-label="Buscar"
        />
      </InputGroup>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:flex lg:flex-wrap">
        <Select value={value.status} onValueChange={(v) => set("status", v as StatusFilter)}>
          <SelectTrigger className="w-full lg:w-36" aria-label="Status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {statusOptions.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={value.category} onValueChange={(v) => set("category", v)}>
          <SelectTrigger className="w-full lg:w-40" aria-label="Categoria">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as categorias</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={value.party} onValueChange={(v) => set("party", v)}>
          <SelectTrigger className="w-full lg:w-48" aria-label={partyLabel}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos ({partyLabel.toLowerCase()})</SelectItem>
            {parties.map((p) => (
              <SelectItem key={p} value={p}>
                {p}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center gap-2">
        <Label htmlFor="filter-from" className="sr-only">
          Vencimento de
        </Label>
        <Input
          id="filter-from"
          type="date"
          className="w-full lg:w-36"
          value={value.from}
          onChange={(e) => set("from", e.target.value)}
          title="Vencimento a partir de"
        />
        <span className="text-xs text-muted-foreground">até</span>
        <Label htmlFor="filter-to" className="sr-only">
          Vencimento até
        </Label>
        <Input
          id="filter-to"
          type="date"
          className="w-full lg:w-36"
          value={value.to}
          min={value.from || undefined}
          onChange={(e) => set("to", e.target.value)}
          title="Vencimento até"
        />
      </div>
      {dirty && (
        <Button variant="ghost" size="sm" onClick={() => onChange(EMPTY_FILTERS)} className="self-start lg:self-auto">
          <FilterX />
          Limpar filtros
        </Button>
      )}
    </div>
  );
}
