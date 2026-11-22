"use client";

import { useState } from "react";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { PAYMENT_METHODS, type PaymentMethod } from "@/lib/domain/types";
import { formatCurrency, formatDate, toDateInput } from "@/lib/format";
import { dateInputToISO } from "./bill-utils";

interface SettleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  bill: { description: string; amount: number; dueDate: string; paymentMethod?: PaymentMethod } | null;
  party?: string;
  dateLabel: string;
  confirmLabel: string;
  defaultMethod?: PaymentMethod;
  pending?: boolean;
  onConfirm: (input: { date: string; paymentMethod: PaymentMethod }) => void;
}

/** Diálogo de baixa (pagar/receber). Remonte com `key` para reiniciar os campos. */
export function SettleDialog({
  open,
  onOpenChange,
  title,
  bill,
  party,
  dateLabel,
  confirmLabel,
  defaultMethod = "PIX",
  pending,
  onConfirm,
}: SettleDialogProps) {
  const [date, setDate] = useState(() => toDateInput());
  const [method, setMethod] = useState<PaymentMethod>(bill?.paymentMethod ?? defaultMethod);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>Confirme a data e a forma de pagamento.</DialogDescription>
        </DialogHeader>
        {bill && (
          <div className="rounded-lg border bg-muted/40 p-3">
            <p className="font-medium">{bill.description}</p>
            <div className="mt-1 flex flex-wrap items-end justify-between gap-2 text-sm text-muted-foreground">
              <span>
                {party ? `${party} · ` : ""}vence {formatDate(bill.dueDate)}
              </span>
              <span className="tabular text-lg font-semibold text-foreground">{formatCurrency(bill.amount)}</span>
            </div>
          </div>
        )}
        <form
          id="settle-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (!date) return;
            onConfirm({ date: dateInputToISO(date), paymentMethod: method });
          }}
        >
          <FieldGroup className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="settle-date">{dateLabel}</FieldLabel>
              <Input
                id="settle-date"
                type="date"
                required
                max={toDateInput()}
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="settle-method">Forma de pagamento</FieldLabel>
              <Select value={method} onValueChange={(v) => setMethod(v as PaymentMethod)}>
                <SelectTrigger id="settle-method" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHODS.map((m) => (
                    <SelectItem key={m} value={m}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </FieldGroup>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="submit" form="settle-form" disabled={pending}>
            {pending && <Spinner />}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
