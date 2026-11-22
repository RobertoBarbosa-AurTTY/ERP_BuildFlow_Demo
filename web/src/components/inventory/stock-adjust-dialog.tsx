"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { ArrowDownToLine, ArrowRight, ArrowUpFromLine, ClipboardCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { round2 } from "@/lib/domain/calc";
import type { Product } from "@/lib/domain/types";
import { errorMessage } from "@/lib/errors";
import { formatNumber } from "@/lib/format";
import { adjustStock, type AdjustMode } from "@/lib/services/products";
import { cn } from "@/lib/utils";
import { FormField } from "./form-field";
import { useInvalidateInventory } from "./queries";
import { parseDecimal } from "./utils";

const REASONS: Record<AdjustMode, string[]> = {
  add: ["Devolução de cliente", "Transferência recebida", "Bonificação do fornecedor"],
  remove: ["Avaria / quebra", "Perda / extravio", "Uso interno", "Produto vencido"],
  set: ["Inventário mensal", "Contagem cíclica", "Correção de lançamento"],
};

const MODES: { value: AdjustMode; label: string; icon: typeof ArrowDownToLine }[] = [
  { value: "add", label: "Entrada", icon: ArrowDownToLine },
  { value: "remove", label: "Saída", icon: ArrowUpFromLine },
  { value: "set", label: "Contagem", icon: ClipboardCheck },
];

interface StockAdjustDialogProps {
  product: Product | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function StockAdjustDialog({ product, open, onOpenChange }: StockAdjustDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Ajustar estoque</DialogTitle>
          <DialogDescription>
            {product ? `${product.name} · saldo atual ${formatNumber(product.quantity)} ${product.unit}` : ""}
          </DialogDescription>
        </DialogHeader>
        {open && product && <AdjustForm key={product._id} product={product} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function AdjustForm({ product, onDone }: { product: Product; onDone: () => void }) {
  const [mode, setMode] = useState<AdjustMode>("add");
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState("");
  const [errors, setErrors] = useState<{ quantity?: string; reason?: string }>({});
  const invalidate = useInvalidateInventory();

  const qty = parseDecimal(quantity);
  const preview = Number.isNaN(qty)
    ? null
    : mode === "add"
      ? product.quantity + qty
      : mode === "remove"
        ? product.quantity - qty
        : qty;

  const mutation = useMutation({
    mutationFn: () => adjustStock({ productId: product._id, mode, quantity: qty, reason }),
    onSuccess: async (movement) => {
      await invalidate();
      toast.success("Estoque ajustado", {
        description: `${product.name}: ${formatNumber(movement.previousQuantity)} → ${formatNumber(movement.newQuantity)} ${product.unit}`,
      });
      onDone();
    },
    onError: (error) => toast.error("Não foi possível ajustar", { description: errorMessage(error) }),
  });

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const found: typeof errors = {};
    if (Number.isNaN(qty) || qty < 0 || (mode !== "set" && qty === 0)) found.quantity = "Informe uma quantidade válida";
    else if (mode === "remove" && qty > product.quantity)
      found.quantity = `Saldo insuficiente (máx. ${formatNumber(product.quantity)})`;
    else if (mode === "set" && qty === product.quantity) found.quantity = "A contagem é igual ao saldo atual";
    if (!reason.trim()) found.reason = "Informe o motivo";
    setErrors(found);
    if (!Object.keys(found).length) mutation.mutate();
  };

  return (
    <form onSubmit={submit} className="grid gap-4" noValidate>
      <ToggleGroup
        type="single"
        variant="outline"
        value={mode}
        onValueChange={(v) => v && setMode(v as AdjustMode)}
        className="w-full"
        spacing={0}
      >
        {MODES.map(({ value, label, icon: Icon }) => (
          <ToggleGroupItem key={value} value={value} className="flex-1">
            <Icon />
            {label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>

      <FormField
        label={mode === "set" ? "Quantidade contada" : "Quantidade"}
        htmlFor="adj-qty"
        required
        error={errors.quantity}
      >
        <Input
          id="adj-qty"
          value={quantity}
          onChange={(e) => {
            setQuantity(e.target.value);
            setErrors((x) => ({ ...x, quantity: undefined }));
          }}
          aria-invalid={!!errors.quantity}
          inputMode="decimal"
          placeholder="0"
          className="tabular"
          autoFocus
        />
      </FormField>

      <FormField label="Motivo" htmlFor="adj-reason" required error={errors.reason}>
        <div className="flex flex-wrap gap-1.5">
          {REASONS[mode].map((r) => (
            <Button
              key={r}
              type="button"
              size="xs"
              variant={reason === r ? "secondary" : "outline"}
              onClick={() => {
                setReason(r);
                setErrors((x) => ({ ...x, reason: undefined }));
              }}
            >
              {r}
            </Button>
          ))}
        </div>
        <Textarea
          id="adj-reason"
          value={reason}
          onChange={(e) => {
            setReason(e.target.value);
            setErrors((x) => ({ ...x, reason: undefined }));
          }}
          aria-invalid={!!errors.reason}
          rows={2}
          placeholder="Descreva o motivo do ajuste"
        />
      </FormField>

      <div className="flex items-center justify-between rounded-lg bg-muted/60 px-3 py-2.5 text-sm">
        <span className="text-muted-foreground">Novo saldo</span>
        <span className="tabular flex items-center gap-2 font-medium">
          {formatNumber(product.quantity)}
          <ArrowRight className="size-3.5 text-muted-foreground" />
          <span className={cn(preview !== null && preview < 0 && "text-destructive")}>
            {preview === null ? "—" : formatNumber(round2(preview))}
          </span>
          <span className="text-muted-foreground">{product.unit}</span>
        </span>
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancelar
        </Button>
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending && <Spinner />}
          Confirmar ajuste
        </Button>
      </DialogFooter>
    </form>
  );
}
