"use client";

import { useState, useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { BellRing, Monitor, Moon, Palette, Sun } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldSeparator,
  FieldTitle,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { PAYMENT_METHODS, type CompanySettings, type PaymentMethod } from "@/lib/domain/types";
import { errorMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";
import { updateSettings } from "@/lib/services/settings";

const THEMES = [
  { value: "light", label: "Claro", description: "Fundo claro, ideal para lojas iluminadas", icon: Sun },
  { value: "dark", label: "Escuro", description: "Menos brilho em ambientes escuros", icon: Moon },
  { value: "system", label: "Sistema", description: "Segue a configuração do dispositivo", icon: Monitor },
] as const;

const noop = () => () => {};

export function PreferencesTab({ settings, canEdit }: { settings: CompanySettings; canEdit: boolean }) {
  const { theme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  const queryClient = useQueryClient();
  const [days, setDays] = useState(String(settings.expiryAlertDays));

  const save = useMutation({
    mutationFn: (patch: Partial<CompanySettings>) => updateSettings(patch),
    onSuccess: (data) => {
      queryClient.setQueryData(["settings"], data);
      setDays(String(data.expiryAlertDays));
      toast.success("Preferência salva");
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Palette className="size-4 text-muted-foreground" />
            Aparência
          </CardTitle>
          <CardDescription>Tema da interface neste navegador.</CardDescription>
        </CardHeader>
        <CardContent>
          {mounted ? (
            <RadioGroup value={theme ?? "system"} onValueChange={setTheme} className="gap-3">
              {THEMES.map((t) => (
                <FieldLabel key={t.value} htmlFor={`theme-${t.value}`}>
                  <Field orientation="horizontal">
                    <ThemeSwatch theme={t.value} />
                    <FieldContent>
                      <FieldTitle>
                        <t.icon className="size-4 text-muted-foreground" />
                        {t.label}
                      </FieldTitle>
                      <FieldDescription>{t.description}</FieldDescription>
                    </FieldContent>
                    <RadioGroupItem value={t.value} id={`theme-${t.value}`} />
                  </Field>
                </FieldLabel>
              ))}
            </RadioGroup>
          ) : (
            <div className="space-y-3">
              {THEMES.map((t) => (
                <Skeleton key={t.value} className="h-16 w-full" />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BellRing className="size-4 text-muted-foreground" />
            Alertas e PDV
          </CardTitle>
          <CardDescription>
            {canEdit ? "Valem para todos os usuários da loja." : "Somente gerentes e administradores podem alterar."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <Field orientation="horizontal">
              <FieldContent>
                <FieldLabel htmlFor="low-stock-alert">Alerta de estoque baixo</FieldLabel>
                <FieldDescription>Destaca produtos abaixo do estoque mínimo no painel e no estoque.</FieldDescription>
              </FieldContent>
              <Switch
                id="low-stock-alert"
                checked={settings.lowStockAlert}
                disabled={!canEdit || save.isPending}
                onCheckedChange={(v) => save.mutate({ lowStockAlert: v })}
              />
            </Field>
            <FieldSeparator />
            <Field orientation="horizontal">
              <FieldContent>
                <FieldLabel htmlFor="expiry-days">Antecedência do alerta de validade</FieldLabel>
                <FieldDescription>Produtos perecíveis que vencem dentro deste prazo são sinalizados.</FieldDescription>
              </FieldContent>
              <div className="flex items-center gap-2">
                <Input
                  id="expiry-days"
                  type="number"
                  min={0}
                  max={365}
                  className="w-20 text-right"
                  value={days}
                  disabled={!canEdit}
                  onChange={(e) => setDays(e.target.value)}
                  onBlur={() => {
                    const n = Number(days);
                    if (Number.isFinite(n) && n !== settings.expiryAlertDays) save.mutate({ expiryAlertDays: n });
                    else setDays(String(settings.expiryAlertDays));
                  }}
                />
                <span className="text-sm text-muted-foreground">dias</span>
              </div>
            </Field>
            <FieldSeparator />
            <Field orientation="horizontal">
              <FieldContent>
                <FieldLabel htmlFor="default-method">Forma de pagamento padrão</FieldLabel>
                <FieldDescription>Pré-selecionada ao finalizar uma venda no PDV.</FieldDescription>
              </FieldContent>
              <Select
                value={settings.defaultPaymentMethod}
                disabled={!canEdit || save.isPending}
                onValueChange={(v) => save.mutate({ defaultPaymentMethod: v as PaymentMethod })}
              >
                <SelectTrigger id="default-method" className="w-44">
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
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * Miniatura do tema. Aqui as cores são literais de propósito: a prévia precisa
 * mostrar o tema claro/escuro independentemente do tema ativo.
 */
function ThemeSwatch({ theme }: { theme: "light" | "dark" | "system" }) {
  const pane = (mode: "light" | "dark") => (
    <div className={cn("flex flex-1 flex-col gap-1 p-1.5", mode === "dark" ? "bg-neutral-900" : "bg-white")}>
      <div className={cn("h-1.5 w-3/4 rounded-full", mode === "dark" ? "bg-neutral-300" : "bg-neutral-700")} />
      <div className={cn("h-1.5 w-1/2 rounded-full", mode === "dark" ? "bg-neutral-600" : "bg-neutral-300")} />
      <div className="mt-auto h-2 w-1/3 rounded-sm bg-primary" />
    </div>
  );
  return (
    <div className="flex h-12 w-16 shrink-0 overflow-hidden rounded-md border" aria-hidden>
      {theme === "system" ? (
        <>
          {pane("light")}
          {pane("dark")}
        </>
      ) : (
        pane(theme)
      )}
    </div>
  );
}
