"use client";

import { useState } from "react";
import { AlertTriangle, Split } from "lucide-react";
import type { PaymentMethod } from "@/lib/domain/types";
import { PAYMENT_METHODS } from "@/lib/domain/types";
import { round2 } from "@/lib/domain/calc";
import { formatCurrency, formatDate } from "@/lib/format";
import type { PaymentInput } from "@/lib/services/sales";
import { cn } from "@/lib/utils";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import { Kbd } from "@/components/ui/kbd";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { moneyInput, parseMoney } from "./money";
import { PAYMENT_ICON, PAYMENT_SHORT } from "./payment-methods";

type Mode = PaymentMethod | "split";

const MODES: Mode[] = [...PAYMENT_METHODS, "split"];
const SPLIT_METHODS: PaymentMethod[] = ["PIX", "Cartão de Crédito", "Cartão de Débito", "Boleto"];

interface CheckoutDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  total: number;
  itemCount: number;
  customerName?: string | null;
  defaultMethod?: PaymentMethod;
  pending?: boolean;
  title?: string;
  onConfirm: (payment: PaymentInput) => void;
}

export function CheckoutDialog(props: CheckoutDialogProps) {
  return (
    <Dialog open={props.open} onOpenChange={(open) => !props.pending && props.onOpenChange(open)}>
      <DialogContent className="sm:max-w-xl">{props.open && <CheckoutForm {...props} />}</DialogContent>
    </Dialog>
  );
}

function CheckoutForm({
  total,
  itemCount,
  customerName,
  defaultMethod = "Dinheiro",
  pending,
  title = "Finalizar venda",
  onConfirm,
}: CheckoutDialogProps) {
  const [mode, setMode] = useState<Mode>(defaultMethod);
  const [received, setReceived] = useState("");
  const [splitCash, setSplitCash] = useState("");
  const [splitMethod, setSplitMethod] = useState<PaymentMethod>("Cartão de Crédito");
  const [dueDate] = useState(() => new Date(Date.now() + 30 * 86_400_000));

  const receivedValue = received ? parseMoney(received) : total;
  const change = round2(receivedValue - total);
  const splitCashValue = parseMoney(splitCash);
  const splitRest = round2(total - (Number.isNaN(splitCashValue) ? 0 : splitCashValue));

  let error: string | null = null;
  if (mode === "Dinheiro" && (Number.isNaN(receivedValue) || receivedValue < total)) {
    error = "Valor recebido menor que o total.";
  } else if (mode === "Crediário" && !customerName) {
    error = "Selecione um cliente para vender no crediário.";
  } else if (mode === "split" && (Number.isNaN(splitCashValue) || splitCashValue <= 0 || splitCashValue >= total)) {
    error = "Informe a parte em dinheiro (maior que zero e menor que o total).";
  }

  const quickValues = Array.from(
    new Set([total, Math.ceil(total / 10) * 10, Math.ceil(total / 50) * 50, Math.ceil(total / 100) * 100]),
  ).filter((v) => v >= total);

  const submit = () => {
    if (error || pending) return;
    if (mode === "split") onConfirm({ method: splitMethod, split: { cash: round2(splitCashValue), method: splitMethod } });
    else if (mode === "Dinheiro") onConfirm({ method: "Dinheiro", amountPaid: round2(receivedValue) });
    else onConfirm({ method: mode });
  };

  return (
    <form
      className="grid gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      onKeyDown={(e) => {
        const target = e.target as HTMLElement;
        if (e.key === "Enter" && target.getAttribute("role") === "radio") {
          e.preventDefault();
          submit();
          return;
        }
        // Atalhos 1–7 escolhem o meio de pagamento (fora dos campos de texto).
        if (target.tagName === "INPUT" || target.getAttribute("role") === "combobox") return;
        const index = Number(e.key) - 1;
        if (index >= 0 && index < MODES.length) {
          e.preventDefault();
          setMode(MODES[index]);
        }
      }}
    >
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>
          {itemCount} {itemCount === 1 ? "item" : "itens"}
          {customerName ? ` · ${customerName}` : " · consumidor final"}
        </DialogDescription>
      </DialogHeader>

      <div className="flex items-end justify-between rounded-xl bg-primary/8 px-5 py-4">
        <span className="text-sm font-medium text-muted-foreground">Total a pagar</span>
        <span className="tabular text-3xl font-semibold tracking-tight text-primary">{formatCurrency(total)}</span>
      </div>

      <div role="radiogroup" aria-label="Forma de pagamento" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {MODES.map((m, i) => {
          const Icon = m === "split" ? Split : PAYMENT_ICON[m];
          const selected = mode === m;
          return (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => setMode(m)}
              className={cn(
                "relative flex flex-col items-center gap-1.5 rounded-lg border px-2 py-3 text-xs font-medium transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                selected
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <Icon className="size-5" />
              {m === "split" ? "Dividido" : PAYMENT_SHORT[m]}
              <span className="absolute top-1 right-1.5 text-[10px] text-muted-foreground/70">{i + 1}</span>
            </button>
          );
        })}
      </div>

      {mode === "Dinheiro" && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="cash-received">Valor recebido</FieldLabel>
            <InputGroup className="h-10">
              <InputGroupAddon>R$</InputGroupAddon>
              <InputGroupInput
                id="cash-received"
                autoFocus
                inputMode="decimal"
                placeholder={moneyInput(total)}
                value={received}
                onChange={(e) => setReceived(e.target.value)}
                className="tabular text-base"
              />
            </InputGroup>
            <div className="flex flex-wrap gap-1.5">
              {quickValues.map((v) => (
                <Button key={v} type="button" size="xs" variant="outline" onClick={() => setReceived(moneyInput(v))}>
                  {v === total ? "Exato" : formatCurrency(v)}
                </Button>
              ))}
            </div>
          </Field>
          <div
            className={cn(
              "flex flex-col justify-center rounded-lg border px-4 py-3",
              change >= 0 ? "border-success/30 bg-success/8" : "border-destructive/30 bg-destructive/8",
            )}
          >
            <span className="text-xs font-medium text-muted-foreground">{change >= 0 ? "Troco" : "Faltam"}</span>
            <span
              className={cn(
                "tabular text-2xl font-semibold",
                change >= 0 ? "text-success" : "text-destructive",
              )}
            >
              {Number.isNaN(change) ? "—" : formatCurrency(Math.abs(change))}
            </span>
          </div>
        </div>
      )}

      {mode === "split" && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="split-cash">Parte em dinheiro</FieldLabel>
            <InputGroup className="h-10">
              <InputGroupAddon>R$</InputGroupAddon>
              <InputGroupInput
                id="split-cash"
                autoFocus
                inputMode="decimal"
                placeholder="0,00"
                value={splitCash}
                onChange={(e) => setSplitCash(e.target.value)}
                className="tabular text-base"
              />
            </InputGroup>
          </Field>
          <Field>
            <Label>Restante em</Label>
            <Select value={splitMethod} onValueChange={(v) => setSplitMethod(v as PaymentMethod)}>
              <SelectTrigger className="h-10! w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SPLIT_METHODS.map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldDescription>
              Restante: <span className="tabular font-medium text-foreground">{formatCurrency(Math.max(0, splitRest))}</span>
            </FieldDescription>
          </Field>
        </div>
      )}

      {mode === "Crediário" &&
        (customerName ? (
          <Alert>
            <AlertTriangle />
            <AlertTitle>Venda a prazo</AlertTitle>
            <AlertDescription>
              Será gerada uma conta a receber de {formatCurrency(total)} para {customerName}, com vencimento em{" "}
              {formatDate(dueDate)}.
            </AlertDescription>
          </Alert>
        ) : (
          <Alert variant="destructive">
            <AlertTriangle />
            <AlertTitle>Cliente obrigatório</AlertTitle>
            <AlertDescription>Feche esta janela e selecione um cliente (F3) para vender no crediário.</AlertDescription>
          </Alert>
        ))}

      {error && mode !== "Crediário" && (Boolean(received) || Boolean(splitCash)) && (
        <p className="text-sm text-destructive">{error}</p>
      )}

      <DialogFooter className="items-center gap-2 sm:justify-between">
        <p className="hidden text-xs text-muted-foreground sm:block">
          <Kbd>1</Kbd>–<Kbd>7</Kbd> forma de pagamento
        </p>
        <Button type="submit" size="lg" disabled={Boolean(error) || pending} className="min-w-44">
          {pending ? <Spinner /> : null}
          Confirmar pagamento
          <Kbd className="ml-1 bg-primary-foreground/20 text-primary-foreground">Enter</Kbd>
        </Button>
      </DialogFooter>
    </form>
  );
}
