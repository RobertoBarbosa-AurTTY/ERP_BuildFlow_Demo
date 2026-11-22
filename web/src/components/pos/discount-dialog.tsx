"use client";

import { useState } from "react";
import type { DiscountType } from "@/lib/domain/types";
import { discountAmount, round2 } from "@/lib/domain/calc";
import { formatCurrency } from "@/lib/format";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { moneyInput, parseMoney } from "./money";

export interface DiscountValue {
  discount: number;
  discountType: DiscountType;
}

interface DiscountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  /** Valor sobre o qual o desconto incide. */
  base: number;
  value: DiscountValue;
  onApply: (value: DiscountValue) => void;
}

export function DiscountDialog(props: DiscountDialogProps) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="sm:max-w-sm">{props.open && <DiscountForm {...props} />}</DialogContent>
    </Dialog>
  );
}

function DiscountForm({ title, description, base, value, onApply, onOpenChange }: DiscountDialogProps) {
  const [type, setType] = useState<DiscountType>(value.discountType);
  const [text, setText] = useState(value.discount ? moneyInput(value.discount).replace(/,00$/, "") : "");
  const parsed = text ? parseMoney(text) : 0;
  const invalid = Number.isNaN(parsed) || parsed < 0 || (type === "percent" ? parsed > 100 : parsed > base);
  const amount = invalid ? 0 : discountAmount(base, parsed, type);

  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (invalid) return;
        onApply({ discount: round2(parsed), discountType: type });
        onOpenChange(false);
      }}
    >
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description ?? `Sobre ${formatCurrency(base)}`}</DialogDescription>
      </DialogHeader>
      <ToggleGroup
        type="single"
        variant="outline"
        spacing={0}
        value={type}
        onValueChange={(v) => v && setType(v as DiscountType)}
        className="w-full"
      >
        <ToggleGroupItem value="percent" className="flex-1">
          Percentual (%)
        </ToggleGroupItem>
        <ToggleGroupItem value="value" className="flex-1">
          Valor (R$)
        </ToggleGroupItem>
      </ToggleGroup>
      <Field data-invalid={invalid || undefined}>
        <FieldLabel htmlFor="discount-value">Desconto</FieldLabel>
        <InputGroup className="h-10">
          {type === "value" && <InputGroupAddon>R$</InputGroupAddon>}
          <InputGroupInput
            id="discount-value"
            autoFocus
            inputMode="decimal"
            placeholder="0"
            value={text}
            aria-invalid={invalid}
            onChange={(e) => setText(e.target.value)}
            className="tabular text-base"
          />
          {type === "percent" && <InputGroupAddon align="inline-end">%</InputGroupAddon>}
        </InputGroup>
        <FieldDescription>
          {invalid
            ? type === "percent"
              ? "Informe um percentual entre 0 e 100."
              : `O desconto não pode passar de ${formatCurrency(base)}.`
            : `Desconto de ${formatCurrency(amount)} · fica ${formatCurrency(base - amount)}`}
        </FieldDescription>
      </Field>
      <DialogFooter>
        {value.discount > 0 && (
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              onApply({ discount: 0, discountType: type });
              onOpenChange(false);
            }}
          >
            Remover desconto
          </Button>
        )}
        <Button type="submit" disabled={invalid}>
          Aplicar
        </Button>
      </DialogFooter>
    </form>
  );
}
