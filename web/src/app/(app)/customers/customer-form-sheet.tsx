"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { maskDocument, maskPhone } from "@/components/finance/masks";
import type { Customer } from "@/lib/domain/types";
import { onlyDigits } from "@/lib/format";
import { documentError, documentKind, type CustomerInput } from "@/lib/services/customers";

interface CustomerFormSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customer: Customer | null;
  pending?: boolean;
  onSubmit: (input: CustomerInput) => void;
}

export function CustomerFormSheet({ open, onOpenChange, customer, pending, onSubmit }: CustomerFormSheetProps) {
  const [values, setValues] = useState({
    name: customer?.name ?? "",
    cpfCnpj: maskDocument(customer?.cpfCnpj ?? ""),
    email: customer?.email ?? "",
    phone: maskPhone(customer?.phone ?? ""),
    address: customer?.address ?? "",
    notes: customer?.notes ?? "",
  });
  const [touched, setTouched] = useState(false);
  const set = (key: keyof typeof values, v: string) => setValues((prev) => ({ ...prev, [key]: v }));

  const docChanged = onlyDigits(values.cpfCnpj) !== onlyDigits(customer?.cpfCnpj ?? "");
  const docErr = documentError(values.cpfCnpj);
  const phoneDigits = onlyDigits(values.phone).length;
  const errors = {
    name: !values.name.trim() ? "Informe o nome" : null,
    cpfCnpj: docChanged ? docErr : null,
    email: values.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim()) ? "E-mail inválido" : null,
    phone: phoneDigits > 0 && phoneDigits < 10 ? "Telefone incompleto" : null,
  };
  const hasErrors = Object.values(errors).some(Boolean);
  const kind = documentKind(values.cpfCnpj);
  const docDigits = onlyDigits(values.cpfCnpj).length;
  // Feedback ao vivo quando o documento está completo.
  const docLive = docDigits === 11 || docDigits === 14 ? docErr : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="gap-1 p-4 border-b">
          <DialogTitle>{customer ? "Editar cliente" : "Novo cliente"}</DialogTitle>
          <DialogDescription>
            {customer ? "Atualize o cadastro do cliente." : "Cadastre pessoa física ou jurídica para vendas e crediário."}
          </DialogDescription>
        </DialogHeader>
        <form
          id="customer-form"
          className="flex-1 overflow-y-auto p-4"
          onSubmit={(e) => {
            e.preventDefault();
            setTouched(true);
            if (hasErrors) return;
            onSubmit(values);
          }}
        >
          <FieldGroup>
            <Field data-invalid={touched && !!errors.name}>
              <FieldLabel htmlFor="customer-name">Nome / Razão social</FieldLabel>
              <Input
                id="customer-name"
                autoFocus
                value={values.name}
                aria-invalid={touched && !!errors.name}
                onChange={(e) => set("name", e.target.value)}
              />
              {touched && <FieldError>{errors.name}</FieldError>}
            </Field>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field data-invalid={(touched && !!errors.cpfCnpj) || (docChanged && !!docLive)}>
                <FieldLabel htmlFor="customer-doc">
                  CPF / CNPJ
                  {kind && <span className="font-normal text-muted-foreground">· {kind === "PF" ? "Pessoa física" : "Pessoa jurídica"}</span>}
                </FieldLabel>
                <Input
                  id="customer-doc"
                  inputMode="numeric"
                  placeholder="000.000.000-00"
                  value={values.cpfCnpj}
                  aria-invalid={(touched && !!errors.cpfCnpj) || (docChanged && !!docLive)}
                  onChange={(e) => set("cpfCnpj", maskDocument(e.target.value))}
                />
                {(touched && errors.cpfCnpj) || (docChanged && docLive) ? (
                  <FieldError>{errors.cpfCnpj ?? docLive}</FieldError>
                ) : !docChanged && docErr && customer?.cpfCnpj ? (
                  <FieldDescription className="text-warning">Documento atual não passa na validação.</FieldDescription>
                ) : null}
              </Field>
              <Field data-invalid={touched && !!errors.phone}>
                <FieldLabel htmlFor="customer-phone">Telefone</FieldLabel>
                <Input
                  id="customer-phone"
                  inputMode="tel"
                  placeholder="(82) 99999-9999"
                  value={values.phone}
                  aria-invalid={touched && !!errors.phone}
                  onChange={(e) => set("phone", maskPhone(e.target.value))}
                />
                {touched && <FieldError>{errors.phone}</FieldError>}
              </Field>
            </div>
            <Field data-invalid={touched && !!errors.email}>
              <FieldLabel htmlFor="customer-email">E-mail</FieldLabel>
              <Input
                id="customer-email"
                type="email"
                placeholder="cliente@email.com"
                value={values.email}
                aria-invalid={touched && !!errors.email}
                onChange={(e) => set("email", e.target.value)}
              />
              {touched && <FieldError>{errors.email}</FieldError>}
            </Field>
            <Field>
              <FieldLabel htmlFor="customer-address">Endereço</FieldLabel>
              <Input
                id="customer-address"
                placeholder="Rua, número - bairro, cidade/UF"
                value={values.address}
                onChange={(e) => set("address", e.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="customer-notes">Observações</FieldLabel>
              <Textarea
                id="customer-notes"
                rows={3}
                placeholder="Preferências, obra em andamento, limite de crediário…"
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
          <Button type="submit" form="customer-form" disabled={pending}>
            {pending && <Spinner />}
            {customer ? "Salvar alterações" : "Cadastrar cliente"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
