"use client";

import { useState } from "react";
import { Bot, Cpu, KeyRound, ShieldCheck, Sparkles } from "lucide-react";
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
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { saveAssistantConfig, useAssistantConfig } from "@/lib/assistant/config";
import type { AssistantConfig, ProviderId } from "@/lib/assistant/types";
import { cn } from "@/lib/utils";

const OPTIONS: { id: ProviderId; title: string; text: string; icon: typeof Bot }[] = [
  { id: "local", title: "Assistente local", text: "Sem IA externa e sem custo. Entende pedidos diretos.", icon: Cpu },
  { id: "anthropic", title: "Claude (Anthropic)", text: "Conversa livre e resumos completos. Usa sua chave de API.", icon: Sparkles },
  { id: "openai", title: "OpenAI", text: "Conversa livre com modelos GPT. Usa sua chave de API.", icon: Bot },
];

export function AssistantSettingsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const stored = useAssistantConfig();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        {/* key força o formulário a recomeçar dos valores salvos a cada abertura */}
        {open && <SettingsForm key={JSON.stringify(stored)} initial={stored} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function SettingsForm({ initial, onDone }: { initial: AssistantConfig; onDone: () => void }) {
  const [draft, setDraft] = useState(initial);
  const set = <K extends keyof AssistantConfig>(key: K, value: AssistantConfig[K]) => setDraft((d) => ({ ...d, [key]: value }));

  const missingKey =
    (draft.provider === "anthropic" && !draft.anthropicApiKey.trim()) || (draft.provider === "openai" && !draft.openaiApiKey.trim());

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        saveAssistantConfig(draft);
        toast.success("Assistente configurado");
        onDone();
      }}
      className="grid gap-4"
    >
      <DialogHeader>
        <DialogTitle>Configurar assistente</DialogTitle>
        <DialogDescription>Escolha quem responde às perguntas. Dá para trocar a qualquer momento.</DialogDescription>
      </DialogHeader>

      <RadioGroup value={draft.provider} onValueChange={(v) => set("provider", v as ProviderId)} className="gap-2">
        {OPTIONS.map(({ id, title, text, icon: Icon }) => (
          <Label
            key={id}
            htmlFor={`provider-${id}`}
            className={cn(
              "flex cursor-pointer items-start gap-3 rounded-lg border p-3 font-normal transition-colors hover:bg-muted/50",
              draft.provider === id && "border-primary bg-primary/5",
            )}
          >
            <RadioGroupItem value={id} id={`provider-${id}`} className="mt-0.5" />
            <Icon className="mt-0.5 size-4 text-muted-foreground" />
            <span className="grid gap-0.5">
              <span className="font-medium">{title}</span>
              <span className="text-xs text-muted-foreground">{text}</span>
            </span>
          </Label>
        ))}
      </RadioGroup>

      {draft.provider === "anthropic" && (
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="anthropic-key">Chave de API da Anthropic</FieldLabel>
            <Input
              id="anthropic-key"
              type="password"
              autoComplete="off"
              placeholder="sk-ant-..."
              value={draft.anthropicApiKey}
              onChange={(e) => set("anthropicApiKey", e.target.value)}
            />
            <FieldDescription>Crie em console.anthropic.com → API Keys.</FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="anthropic-model">Modelo</FieldLabel>
            <Input id="anthropic-model" value={draft.anthropicModel} onChange={(e) => set("anthropicModel", e.target.value)} />
            <FieldDescription>Padrão: claude-opus-5-5. Para respostas mais rápidas e baratas: claude-sonnet-5-5 ou claude-haiku-5-5.</FieldDescription>
          </Field>
        </FieldGroup>
      )}

      {draft.provider === "openai" && (
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="openai-key">Chave de API da OpenAI</FieldLabel>
            <Input
              id="openai-key"
              type="password"
              autoComplete="off"
              placeholder="sk-..."
              value={draft.openaiApiKey}
              onChange={(e) => set("openaiApiKey", e.target.value)}
            />
            <FieldDescription>Crie em platform.openai.com → API keys.</FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="openai-model">Modelo</FieldLabel>
            <Input id="openai-model" value={draft.openaiModel} onChange={(e) => set("openaiModel", e.target.value)} />
            <FieldDescription>Qualquer modelo de chat com suporte a ferramentas (function calling).</FieldDescription>
          </Field>
        </FieldGroup>
      )}

      {draft.provider !== "local" && (
        <Alert>
          <ShieldCheck />
          <AlertDescription>
            A chave fica salva só neste navegador e vai direto para o provedor escolhido. Os dados consultados pelo assistente (produtos,
            vendas, caixa) são enviados ao provedor para gerar a resposta. Use uma chave com limite de gastos.
          </AlertDescription>
        </Alert>
      )}

      {missingKey && (
        <p className="flex items-center gap-2 text-xs text-warning">
          <KeyRound className="size-3.5" />
          Sem chave, o assistente local continua respondendo.
        </p>
      )}

      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancelar
        </Button>
        <Button type="submit">Salvar</Button>
      </DialogFooter>
    </form>
  );
}
