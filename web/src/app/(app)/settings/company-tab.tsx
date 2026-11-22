"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Building2, Lock, Save } from "lucide-react";
import { toast } from "sonner";
import { maskCnpj, maskPhone } from "@/components/finance/masks";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import type { CompanySettings } from "@/lib/domain/types";
import { errorMessage } from "@/lib/errors";
import { formatDateTime, onlyDigits } from "@/lib/format";
import { isValidCnpj } from "@/lib/services/customers";
import { updateSettings } from "@/lib/services/settings";

export function CompanyTab({ settings, canEdit }: { settings: CompanySettings; canEdit: boolean }) {
  const queryClient = useQueryClient();
  const [values, setValues] = useState({
    companyName: settings.companyName,
    tradeName: settings.tradeName,
    cnpj: maskCnpj(settings.cnpj),
    stateRegistration: settings.stateRegistration ?? "",
    phone: maskPhone(settings.phone ?? ""),
    email: settings.email ?? "",
    address: settings.address ?? "",
    receiptFooter: settings.receiptFooter ?? "",
  });
  const [touched, setTouched] = useState(false);
  const set = (key: keyof typeof values, v: string) => setValues((p) => ({ ...p, [key]: v }));

  const errors = {
    companyName: !values.companyName.trim() ? "Informe a razão social" : null,
    tradeName: !values.tradeName.trim() ? "Informe o nome fantasia" : null,
    cnpj: !isValidCnpj(values.cnpj) ? "CNPJ inválido" : null,
    email: values.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email) ? "E-mail inválido" : null,
  };
  const hasErrors = Object.values(errors).some(Boolean);

  const save = useMutation({
    mutationFn: () => updateSettings({ ...values, cnpj: onlyDigits(values.cnpj), phone: onlyDigits(values.phone) }),
    onSuccess: (data) => {
      queryClient.setQueryData(["settings"], data);
      toast.success("Dados da empresa salvos");
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const err = (key: keyof typeof errors) => (touched ? errors[key] : null);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="size-4 text-muted-foreground" />
            Dados da empresa
          </CardTitle>
          <CardDescription>Usados no cupom, nas etiquetas e nos relatórios.</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            id="company-form"
            onSubmit={(e) => {
              e.preventDefault();
              setTouched(true);
              if (!hasErrors) save.mutate();
            }}
          >
            <fieldset disabled={!canEdit} className="contents">
              <FieldGroup>
                <div className="grid gap-5 sm:grid-cols-2">
                  <Field data-invalid={!!err("companyName")}>
                    <FieldLabel htmlFor="company-name">Razão social</FieldLabel>
                    <Input
                      id="company-name"
                      value={values.companyName}
                      aria-invalid={!!err("companyName")}
                      onChange={(e) => set("companyName", e.target.value)}
                    />
                    <FieldError>{err("companyName")}</FieldError>
                  </Field>
                  <Field data-invalid={!!err("tradeName")}>
                    <FieldLabel htmlFor="trade-name">Nome fantasia</FieldLabel>
                    <Input
                      id="trade-name"
                      value={values.tradeName}
                      aria-invalid={!!err("tradeName")}
                      onChange={(e) => set("tradeName", e.target.value)}
                    />
                    <FieldError>{err("tradeName")}</FieldError>
                  </Field>
                </div>
                <div className="grid gap-5 sm:grid-cols-2">
                  <Field data-invalid={!!err("cnpj")}>
                    <FieldLabel htmlFor="company-cnpj">CNPJ</FieldLabel>
                    <Input
                      id="company-cnpj"
                      inputMode="numeric"
                      placeholder="00.000.000/0000-00"
                      value={values.cnpj}
                      aria-invalid={!!err("cnpj")}
                      onChange={(e) => set("cnpj", maskCnpj(e.target.value))}
                    />
                    <FieldError>{err("cnpj")}</FieldError>
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="company-ie">Inscrição estadual</FieldLabel>
                    <Input
                      id="company-ie"
                      value={values.stateRegistration}
                      onChange={(e) => set("stateRegistration", e.target.value)}
                    />
                  </Field>
                </div>
                <div className="grid gap-5 sm:grid-cols-2">
                  <Field>
                    <FieldLabel htmlFor="company-phone">Telefone</FieldLabel>
                    <Input
                      id="company-phone"
                      inputMode="tel"
                      value={values.phone}
                      onChange={(e) => set("phone", maskPhone(e.target.value))}
                    />
                  </Field>
                  <Field data-invalid={!!err("email")}>
                    <FieldLabel htmlFor="company-email">E-mail</FieldLabel>
                    <Input
                      id="company-email"
                      type="email"
                      value={values.email}
                      aria-invalid={!!err("email")}
                      onChange={(e) => set("email", e.target.value)}
                    />
                    <FieldError>{err("email")}</FieldError>
                  </Field>
                </div>
                <Field>
                  <FieldLabel htmlFor="company-address">Endereço</FieldLabel>
                  <Input id="company-address" value={values.address} onChange={(e) => set("address", e.target.value)} />
                </Field>
                <Field>
                  <FieldLabel htmlFor="company-footer">Mensagem do rodapé do cupom</FieldLabel>
                  <Textarea
                    id="company-footer"
                    rows={2}
                    maxLength={160}
                    value={values.receiptFooter}
                    onChange={(e) => set("receiptFooter", e.target.value)}
                  />
                  <FieldDescription>{values.receiptFooter.length}/160 caracteres</FieldDescription>
                </Field>
              </FieldGroup>
            </fieldset>
          </form>
        </CardContent>
        <CardFooter className="justify-between gap-3 border-t">
          {canEdit ? (
            <span className="text-xs text-muted-foreground">As alterações valem para novos cupons.</span>
          ) : (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Lock className="size-3.5" />
              Somente administradores podem alterar estes dados.
            </span>
          )}
          {canEdit && (
            <Button type="submit" form="company-form" disabled={save.isPending}>
              {save.isPending ? <Spinner /> : <Save />}
              Salvar
            </Button>
          )}
        </CardFooter>
      </Card>

      <div className="space-y-2">
        <p className="text-sm font-medium">Pré-visualização do cupom</p>
        <div className="rounded-xl border bg-card p-5 font-mono text-xs leading-relaxed shadow-sm">
          <div className="text-center">
            <p className="text-sm font-bold uppercase">{values.tradeName || "Nome fantasia"}</p>
            <p>{values.companyName}</p>
            <p>CNPJ {values.cnpj || "—"}</p>
            {values.stateRegistration && <p>IE {values.stateRegistration}</p>}
            {values.address && <p>{values.address}</p>}
            {values.phone && <p>Tel. {values.phone}</p>}
          </div>
          <div className="my-3 border-t border-dashed" />
          <p className="text-center">CUPOM NÃO FISCAL</p>
          <div className="mt-2 flex justify-between">
            <span>1x Cimento CP-II 50kg</span>
            <span>35,90</span>
          </div>
          <div className="flex justify-between font-bold">
            <span>TOTAL</span>
            <span>R$ 35,90</span>
          </div>
          <div className="my-3 border-t border-dashed" />
          <p className="text-center whitespace-pre-line">{values.receiptFooter || "Obrigado pela preferência!"}</p>
          <p className="mt-2 text-center text-muted-foreground">{formatDateTime(new Date())}</p>
        </div>
      </div>
    </div>
  );
}
