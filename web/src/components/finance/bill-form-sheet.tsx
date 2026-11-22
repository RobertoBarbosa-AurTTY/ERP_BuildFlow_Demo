"use client";

import { useState } from "react";
import { CalendarRange, Repeat } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldSeparator,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { formatCurrency, formatDate, toDateInput } from "@/lib/format";
import { installmentDueDates, splitInstallments, dateInputToISO } from "./bill-utils";
import { CurrencyInput } from "./currency-input";

export interface PartyValue {
  id?: string;
  name: string;
}

export interface BillFormValues {
  description: string;
  party: PartyValue;
  category: string;
  amount: number;
  dueDate: string; // YYYY-MM-DD
  documentNumber: string;
  notes: string;
  recurring: boolean;
  installments: number;
}

export const EMPTY_BILL_FORM = (category: string): BillFormValues => ({
  description: "",
  party: { name: "" },
  category,
  amount: 0,
  dueDate: toDateInput(),
  documentNumber: "",
  notes: "",
  recurring: false,
  installments: 1,
});

interface BillFormSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit";
  title: string;
  description: string;
  initial: BillFormValues;
  categories: string[];
  partyLabel: string;
  renderParty: (props: { value: PartyValue; onChange: (value: PartyValue) => void; invalid: boolean }) => React.ReactNode;
  /** Parcela de um grupo: não pode virar recorrente. */
  isInstallment?: boolean;
  pending?: boolean;
  onSubmit: (values: BillFormValues & { dueDateISO: string }) => void;
}

export function BillFormSheet({
  open,
  onOpenChange,
  mode,
  title,
  description,
  initial,
  categories,
  partyLabel,
  renderParty,
  isInstallment,
  pending,
  onSubmit,
}: BillFormSheetProps) {
  const [values, setValues] = useState<BillFormValues>(initial);
  const [touched, setTouched] = useState(false);
  const set = <K extends keyof BillFormValues>(key: K, v: BillFormValues[K]) => setValues((prev) => ({ ...prev, [key]: v }));

  const errors = {
    description: !values.description.trim() ? "Informe a descrição" : null,
    party: !values.party.name.trim() ? `Informe o ${partyLabel.toLowerCase()}` : null,
    amount: !(values.amount > 0) ? "Informe um valor maior que zero" : null,
    dueDate: !values.dueDate ? "Informe o vencimento" : null,
  };
  const hasErrors = Object.values(errors).some(Boolean);
  const showInstallments = mode === "create";
  const installments = Math.max(1, Math.min(48, values.installments || 1));
  const preview =
    installments > 1 && values.amount > 0 && values.dueDate
      ? (() => {
          const amounts = splitInstallments(values.amount, installments);
          const dues = installmentDueDates(dateInputToISO(values.dueDate), installments);
          return amounts.map((amount, i) => ({ amount, due: dues[i] }));
        })()
      : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="gap-1 p-4 border-b">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <form
          id="bill-form"
          className="flex-1 overflow-y-auto p-4"
          onSubmit={(e) => {
            e.preventDefault();
            setTouched(true);
            if (hasErrors) return;
            onSubmit({ ...values, installments, dueDateISO: dateInputToISO(values.dueDate) });
          }}
        >
          <FieldGroup>
            <Field data-invalid={touched && !!errors.description}>
              <FieldLabel htmlFor="bill-description">Descrição</FieldLabel>
              <Input
                id="bill-description"
                autoFocus
                placeholder="Ex.: Compra de cimento - NF 45871"
                value={values.description}
                aria-invalid={touched && !!errors.description}
                onChange={(e) => set("description", e.target.value)}
              />
              {touched && <FieldError>{errors.description}</FieldError>}
            </Field>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field data-invalid={touched && !!errors.party}>
                <FieldLabel>{partyLabel}</FieldLabel>
                {renderParty({ value: values.party, onChange: (v) => set("party", v), invalid: touched && !!errors.party })}
                {touched && <FieldError>{errors.party}</FieldError>}
              </Field>
              <Field>
                <FieldLabel htmlFor="bill-category">Categoria</FieldLabel>
                <Select value={values.category} onValueChange={(v) => set("category", v)}>
                  <SelectTrigger id="bill-category" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field data-invalid={touched && !!errors.amount}>
                <FieldLabel htmlFor="bill-amount">{installments > 1 ? "Valor total" : "Valor"}</FieldLabel>
                <CurrencyInput
                  id="bill-amount"
                  value={values.amount}
                  aria-invalid={touched && !!errors.amount}
                  onValueChange={(v) => set("amount", v)}
                />
                {touched && <FieldError>{errors.amount}</FieldError>}
              </Field>
              <Field data-invalid={touched && !!errors.dueDate}>
                <FieldLabel htmlFor="bill-due">{installments > 1 ? "1º vencimento" : "Vencimento"}</FieldLabel>
                <Input
                  id="bill-due"
                  type="date"
                  value={values.dueDate}
                  aria-invalid={touched && !!errors.dueDate}
                  onChange={(e) => set("dueDate", e.target.value)}
                />
                {touched && <FieldError>{errors.dueDate}</FieldError>}
              </Field>
            </div>
            <Field>
              <FieldLabel htmlFor="bill-doc">Nº do documento</FieldLabel>
              <Input
                id="bill-doc"
                placeholder="NF, boleto, contrato…"
                value={values.documentNumber}
                onChange={(e) => set("documentNumber", e.target.value)}
              />
            </Field>

            <FieldSeparator />

            {showInstallments && (
              <Field>
                <FieldLabel htmlFor="bill-installments" className="flex items-center gap-2">
                  <CalendarRange className="size-4 text-muted-foreground" />
                  Parcelar em
                </FieldLabel>
                <div className="flex items-center gap-2">
                  <Input
                    id="bill-installments"
                    type="number"
                    min={1}
                    max={48}
                    className="w-24"
                    value={values.installments}
                    onChange={(e) => {
                      const n = Number(e.target.value);
                      set("installments", Number.isFinite(n) ? n : 1);
                      if (n > 1) set("recurring", false);
                    }}
                  />
                  <span className="text-sm text-muted-foreground">
                    {installments > 1 ? `vezes mensais` : "vez (à vista)"}
                  </span>
                </div>
                <FieldDescription>As parcelas ficam agrupadas e vencem no mesmo dia de cada mês.</FieldDescription>
                {preview.length > 0 && (
                  <div className="rounded-lg border">
                    <div className="max-h-48 divide-y overflow-y-auto text-sm">
                      {preview.map((p, i) => (
                        <div key={i} className="flex items-center justify-between px-3 py-1.5">
                          <span className="text-muted-foreground">
                            Parcela {i + 1}/{preview.length}
                          </span>
                          <span>{formatDate(p.due)}</span>
                          <span className="tabular font-medium">{formatCurrency(p.amount)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </Field>
            )}

            {!isInstallment && (
              <Field orientation="horizontal">
                <FieldContent>
                  <FieldLabel htmlFor="bill-recurring" className="flex items-center gap-2">
                    <Repeat className="size-4 text-muted-foreground" />
                    Conta recorrente (mensal)
                  </FieldLabel>
                  <FieldDescription>Ao dar baixa, a próxima ocorrência é criada automaticamente.</FieldDescription>
                </FieldContent>
                <Switch
                  id="bill-recurring"
                  checked={values.recurring}
                  disabled={installments > 1}
                  onCheckedChange={(v) => set("recurring", v)}
                />
              </Field>
            )}

            <Field>
              <FieldLabel htmlFor="bill-notes">Observações</FieldLabel>
              <Textarea
                id="bill-notes"
                rows={3}
                value={values.notes}
                onChange={(e) => set("notes", e.target.value)}
              />
            </Field>
          </FieldGroup>
        </form>
        <DialogFooter className="mx-0 mb-0 flex-row justify-end border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="submit" form="bill-form" disabled={pending}>
            {pending && <Spinner />}
            {mode === "create" ? (installments > 1 ? `Criar ${installments} parcelas` : "Cadastrar conta") : "Salvar alterações"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
