"use client";

import { useState } from "react";
import type { ProductUnit, SaleItem } from "@/lib/domain/types";
import { newId } from "@/lib/mock/db";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { parseMoney } from "./money";

const UNITS: ProductUnit[] = ["UN", "KG", "M", "M2", "M3", "L", "CX", "SC", "PC"];

export function CustomItemDialog({
  open,
  onOpenChange,
  onAdd,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (item: SaleItem) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {open && (
          <CustomItemForm
            onAdd={(item) => {
              onAdd(item);
              onOpenChange(false);
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function CustomItemForm({ onAdd }: { onAdd: (item: SaleItem) => void }) {
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [qty, setQty] = useState("1");
  const [unit, setUnit] = useState<ProductUnit>("UN");
  const priceValue = parseMoney(price);
  const qtyValue = parseMoney(qty);
  const valid = name.trim().length >= 2 && priceValue > 0 && qtyValue > 0;

  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!valid) return;
        onAdd({
          id: `custom-${newId()}`,
          sku: "AVULSO",
          name: name.trim(),
          unit,
          qty: qtyValue,
          price: priceValue,
          discount: 0,
          discountType: "percent",
        });
      }}
    >
      <DialogHeader>
        <DialogTitle>Item avulso</DialogTitle>
        <DialogDescription>Para itens sem cadastro (serviços, cortes, fretes). Não movimenta estoque.</DialogDescription>
      </DialogHeader>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="custom-name">Descrição</FieldLabel>
          <Input id="custom-name" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Frete para obra" />
        </Field>
        <div className="grid grid-cols-[1fr_1fr_auto] gap-3">
          <Field>
            <FieldLabel htmlFor="custom-price">Preço unit.</FieldLabel>
            <InputGroup>
              <InputGroupAddon>R$</InputGroupAddon>
              <InputGroupInput id="custom-price" inputMode="decimal" placeholder="0,00" value={price} onChange={(e) => setPrice(e.target.value)} />
            </InputGroup>
          </Field>
          <Field>
            <FieldLabel htmlFor="custom-qty">Quantidade</FieldLabel>
            <Input id="custom-qty" inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} />
          </Field>
          <Field>
            <FieldLabel>Unid.</FieldLabel>
            <Select value={unit} onValueChange={(v) => setUnit(v as ProductUnit)}>
              <SelectTrigger className="w-20">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {UNITS.map((u) => (
                  <SelectItem key={u} value={u}>
                    {u}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>
      </FieldGroup>
      <DialogFooter>
        <Button type="submit" disabled={!valid}>
          Adicionar ao carrinho
        </Button>
      </DialogFooter>
    </form>
  );
}
