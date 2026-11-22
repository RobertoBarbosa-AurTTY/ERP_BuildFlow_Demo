"use client";

import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group";
import { onlyDigits } from "@/lib/format";

const fmt = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

interface CurrencyInputProps extends Omit<React.ComponentProps<"input">, "value" | "onChange" | "type"> {
  value: number;
  onValueChange: (value: number) => void;
}

/** Campo monetário estilo "caixa": os dígitos entram pelos centavos. */
export function CurrencyInput({ value, onValueChange, className, ...props }: CurrencyInputProps) {
  return (
    <InputGroup className={className}>
      <InputGroupAddon>
        <InputGroupText>R$</InputGroupText>
      </InputGroupAddon>
      <InputGroupInput
        inputMode="numeric"
        className="tabular text-right"
        value={fmt.format(value || 0)}
        onChange={(e) => {
          const cents = Number(onlyDigits(e.target.value).slice(-12) || "0");
          onValueChange(cents / 100);
        }}
        onFocus={(e) => e.currentTarget.select()}
        {...props}
      />
    </InputGroup>
  );
}
