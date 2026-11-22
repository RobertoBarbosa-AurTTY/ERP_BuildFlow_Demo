"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowUp,
  Bot,
  Check,
  CircleAlert,
  FileCode2,
  Loader2,
  Paperclip,
  RotateCcw,
  Settings2,
  ShieldQuestion,
  Square,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { createAssistantSession, friendlyError } from "@/lib/assistant";
import { effectiveProvider, PROVIDER_LABEL, useAssistantConfig } from "@/lib/assistant/config";
import type { Attachment, ConfirmRequest, ToolCallInfo } from "@/lib/assistant/types";
import { useSession } from "@/lib/auth";
import { initials } from "@/lib/format";
import { cn } from "@/lib/utils";
import { AssistantSettingsDialog } from "./assistant-settings-dialog";
import { Markdown } from "./markdown";

type Part =
  | { kind: "text"; text: string }
  | { kind: "tool"; call: ToolCallInfo; status: "running" | "ok" | "error"; summary?: string }
  | { kind: "confirm"; id: string; request: ConfirmRequest; state: "pending" | "approved" | "declined" };

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  parts: Part[];
  attachments?: string[];
  error?: string;
}

const SUGGESTIONS = [
  "O que está com estoque baixo?",
  "Resumo das vendas de hoje",
  "Resumo do caixa",
  "Contas a pagar que vencem esta semana",
  "Como faço uma sangria no caixa?",
  "Ajustar estoque do MAT-001 para 118 motivo inventário",
];

const uid = () => Math.random().toString(36).slice(2);

export function AssistantChat() {
  const config = useAssistantConfig();
  const user = useSession();
  const queryClient = useQueryClient();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<Attachment[]>([]);
  const [conversation, setConversation] = useState(0);

  const attachments = useRef(new Map<string, Attachment>());
  const confirmResolvers = useRef(new Map<string, (ok: boolean) => void>());
  const abortRef = useRef<AbortController | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const provider = effectiveProvider(config);

  // Uma sessão por conversa + configuração; trocar o provedor começa do zero.
  const { session } = useMemo(
    () =>
      createAssistantSession(config, {
        userName: user?.name ?? "Usuário",
        userRole: user?.role ?? "Operador",
        attachments: attachments.current,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `conversation` reinicia a sessão
    [config, user?.name, user?.role, conversation],
  );

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  function updateLast(update: (msg: ChatMessage) => ChatMessage) {
    setMessages((list) => {
      const copy = [...list];
      copy[copy.length - 1] = update(copy[copy.length - 1]);
      return copy;
    });
  }

  function reset() {
    abortRef.current?.abort();
    confirmResolvers.current.forEach((resolve) => resolve(false));
    confirmResolvers.current.clear();
    attachments.current.clear();
    setMessages([]);
    setPendingFiles([]);
    setConversation((n) => n + 1);
  }

  async function send(text: string) {
    const content = text.trim();
    if (!content || busy) return;
    const files = pendingFiles;
    files.forEach((f) => attachments.current.set(f.id, f));
    setPendingFiles([]);
    setInput("");
    setBusy(true);
    setMessages((list) => [
      ...list,
      { id: uid(), role: "user", parts: [{ kind: "text", text: content }], attachments: files.map((f) => f.name) },
      { id: uid(), role: "assistant", parts: [] },
    ]);

    const controller = new AbortController();
    abortRef.current = controller;
    let changedData = false;

    try {
      await session.send(content, {
        signal: controller.signal,
        onText: (delta) =>
          updateLast((msg) => {
            const parts = [...msg.parts];
            const last = parts.at(-1);
            if (last?.kind === "text") parts[parts.length - 1] = { ...last, text: last.text + delta };
            else parts.push({ kind: "text", text: delta });
            return { ...msg, parts };
          }),
        onToolStart: (call) => updateLast((msg) => ({ ...msg, parts: [...msg.parts, { kind: "tool", call, status: "running" }] })),
        onToolEnd: (call, result) => {
          if (result.ok && ["ajustar_estoque", "importar_nfe"].includes(call.name)) changedData = true;
          updateLast((msg) => ({
            ...msg,
            parts: msg.parts.map((p) =>
              p.kind === "tool" && p.call.id === call.id ? { ...p, status: result.ok ? "ok" : "error", summary: result.summary } : p,
            ),
          }));
        },
        confirm: (request) =>
          new Promise<boolean>((resolve) => {
            const id = uid();
            confirmResolvers.current.set(id, resolve);
            updateLast((msg) => ({ ...msg, parts: [...msg.parts, { kind: "confirm", id, request, state: "pending" }] }));
          }),
      });
    } catch (error) {
      updateLast((msg) => ({ ...msg, error: friendlyError(provider, error) }));
    } finally {
      setBusy(false);
      abortRef.current = null;
      // Telas abertas (estoque, entradas) refletem o que o assistente alterou.
      if (changedData) await queryClient.invalidateQueries();
    }
  }

  function answerConfirm(id: string, ok: boolean) {
    confirmResolvers.current.get(id)?.(ok);
    confirmResolvers.current.delete(id);
    setMessages((list) =>
      list.map((msg) => ({
        ...msg,
        parts: msg.parts.map((p) => (p.kind === "confirm" && p.id === id ? { ...p, state: ok ? "approved" : "declined" } : p)),
      })),
    );
  }

  async function onFiles(list: FileList | null) {
    if (!list?.length) return;
    const added: Attachment[] = [];
    for (const file of Array.from(list)) {
      if (file.size > 2_000_000) {
        toast.error(`${file.name} é grande demais (máx. 2 MB).`);
        continue;
      }
      added.push({ id: `arq-${uid()}`, name: file.name, content: await file.text() });
    }
    setPendingFiles((current) => [...current, ...added]);
    if (fileInput.current) fileInput.current.value = "";
  }

  return (
    <Card className="flex h-[calc(100svh-15rem)] min-h-[520px] flex-col gap-0 overflow-hidden py-0">
      <header className="flex flex-wrap items-center gap-3 border-b px-4 py-3">
        <div className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Bot className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold leading-tight">Assistente BuildFlow</p>
          <p className="truncate text-xs text-muted-foreground">Dúvidas, estoque, vendas, caixa, contas e notas fiscais</p>
        </div>
        <Badge variant="secondary" className="gap-1.5">
          <span className={cn("size-1.5 rounded-full", provider === "local" ? "bg-muted-foreground" : "bg-success")} />
          {PROVIDER_LABEL[provider]}
        </Badge>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon-sm" onClick={reset} aria-label="Nova conversa" disabled={!messages.length && !busy}>
              <RotateCcw />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Nova conversa</TooltipContent>
        </Tooltip>
        <Button variant="outline" size="sm" onClick={() => setSettingsOpen(true)}>
          <Settings2 />
          Configurar
        </Button>
      </header>

      <ScrollArea className="min-h-0 flex-1">
        <div className="mx-auto flex max-w-3xl flex-col gap-6 p-4 md:p-6">
          {!messages.length && (
            <div className="flex flex-col items-center gap-5 py-8 text-center">
              <div className="flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <Bot className="size-7" />
              </div>
              <div className="space-y-1.5">
                <p className="text-lg font-semibold">Como posso ajudar hoje?</p>
                <p className="max-w-md text-sm text-muted-foreground">
                  Pergunte sobre o sistema, consulte números da loja, corrija o estoque ou anexe o XML de uma NF-e para importar.
                  Ações que alteram dados sempre pedem sua confirmação.
                </p>
              </div>
              <div className="flex max-w-2xl flex-wrap justify-center gap-2">
                {SUGGESTIONS.map((s) => (
                  <Button key={s} variant="outline" size="sm" className="h-auto rounded-full py-1.5 font-normal" onClick={() => send(s)}>
                    {s}
                  </Button>
                ))}
              </div>
              {provider === "local" && (
                <p className="text-xs text-muted-foreground">
                  Usando o assistente local.{" "}
                  <button className="font-medium text-primary hover:underline" onClick={() => setSettingsOpen(true)}>
                    Conecte o Claude ou a OpenAI
                  </button>{" "}
                  para conversas livres.
                </p>
              )}
            </div>
          )}

          {messages.map((msg) =>
            msg.role === "user" ? (
              <div key={msg.id} className="flex justify-end gap-3">
                <div className="max-w-[85%] space-y-1.5">
                  {!!msg.attachments?.length && (
                    <div className="flex flex-wrap justify-end gap-1.5">
                      {msg.attachments.map((name) => (
                        <Badge key={name} variant="outline" className="gap-1 font-normal">
                          <FileCode2 className="size-3" />
                          {name}
                        </Badge>
                      ))}
                    </div>
                  )}
                  <div className="rounded-2xl rounded-tr-sm bg-primary px-4 py-2.5 text-sm text-primary-foreground">
                    {msg.parts[0]?.kind === "text" && msg.parts[0].text}
                  </div>
                </div>
                <Avatar className="size-8">
                  <AvatarFallback className="bg-muted text-xs">{initials(user?.name)}</AvatarFallback>
                </Avatar>
              </div>
            ) : (
              <div key={msg.id} className="flex gap-3">
                <Avatar className="size-8">
                  <AvatarFallback className="bg-primary/10 text-primary">
                    <Bot className="size-4" />
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1 space-y-3 pt-1">
                  {msg.parts.map((part, i) => {
                    if (part.kind === "text") return <Markdown key={i}>{part.text}</Markdown>;
                    if (part.kind === "tool") return <ToolChip key={i} part={part} />;
                    return <ConfirmCard key={part.id} part={part} onAnswer={(ok) => answerConfirm(part.id, ok)} />;
                  })}
                  {busy && msg === messages.at(-1) && !msg.parts.some((p) => p.kind === "confirm" && p.state === "pending") && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Loader2 className="size-3.5 animate-spin" />
                      Pensando…
                    </div>
                  )}
                  {msg.error && (
                    <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                      <CircleAlert className="mt-0.5 size-4 shrink-0" />
                      <span>
                        {msg.error}{" "}
                        {provider !== "local" && (
                          <button className="font-medium underline-offset-4 hover:underline" onClick={() => setSettingsOpen(true)}>
                            Configurar
                          </button>
                        )}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            ),
          )}
          <div ref={bottomRef} />
        </div>
      </ScrollArea>

      <form
        className="border-t bg-background/60 p-3"
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
      >
        <div className="mx-auto max-w-3xl">
          {!!pendingFiles.length && (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {pendingFiles.map((f) => (
                <Badge key={f.id} variant="secondary" className="gap-1 pr-1 font-normal">
                  <FileCode2 className="size-3" />
                  {f.name}
                  <button
                    type="button"
                    aria-label={`Remover ${f.name}`}
                    className="rounded p-0.5 hover:bg-background"
                    onClick={() => setPendingFiles((list) => list.filter((x) => x.id !== f.id))}
                  >
                    <X className="size-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}
          <div className="flex items-end gap-2 rounded-xl border bg-background p-2 focus-within:ring-2 focus-within:ring-ring/40">
            <input ref={fileInput} type="file" accept=".xml,text/xml,application/xml" multiple hidden onChange={(e) => onFiles(e.target.files)} />
            <Tooltip>
              <TooltipTrigger asChild>
                <Button type="button" variant="ghost" size="icon-sm" onClick={() => fileInput.current?.click()} aria-label="Anexar XML da NF-e">
                  <Paperclip />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Anexar XML da NF-e</TooltipContent>
            </Tooltip>
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send(input);
                }
              }}
              rows={1}
              placeholder={pendingFiles.length ? "Ex.: importar nota" : "Pergunte algo ou peça uma ação…"}
              className="max-h-40 min-h-9 resize-none border-0 bg-transparent px-1 py-1.5 shadow-none focus-visible:ring-0"
            />
            {busy ? (
              <Button type="button" size="icon-sm" variant="secondary" onClick={() => abortRef.current?.abort()} aria-label="Parar">
                <Square className="fill-current" />
              </Button>
            ) : (
              <Button type="submit" size="icon-sm" disabled={!input.trim()} aria-label="Enviar">
                <ArrowUp />
              </Button>
            )}
          </div>
          <p className="mt-1.5 text-center text-[11px] text-muted-foreground">
            Enter envia · Shift+Enter quebra linha · O assistente pode errar: confira valores importantes.
          </p>
        </div>
      </form>

      <AssistantSettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </Card>
  );
}

function ToolChip({ part }: { part: Extract<Part, { kind: "tool" }> }) {
  return (
    <div
      className={cn(
        "flex w-fit max-w-full items-center gap-2 rounded-lg border bg-muted/40 px-2.5 py-1.5 text-xs",
        part.status === "error" && "border-destructive/30 text-destructive",
      )}
    >
      {part.status === "running" ? (
        <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
      ) : part.status === "ok" ? (
        <Check className="size-3.5 text-success" />
      ) : (
        <CircleAlert className="size-3.5" />
      )}
      <span className="font-medium">{part.call.label}</span>
      {part.summary && <span className="truncate text-muted-foreground">· {part.summary}</span>}
    </div>
  );
}

function ConfirmCard({ part, onAnswer }: { part: Extract<Part, { kind: "confirm" }>; onAnswer: (ok: boolean) => void }) {
  return (
    <div className="rounded-xl border border-warning/40 bg-warning/5 p-4">
      <div className="flex items-start gap-3">
        <ShieldQuestion className="mt-0.5 size-5 shrink-0 text-warning" />
        <div className="min-w-0 flex-1 space-y-2">
          <p className="text-sm font-medium">{part.request.title}</p>
          <ul className="space-y-0.5 text-xs text-muted-foreground">
            {part.request.details.map((d) => (
              <li key={d}>• {d}</li>
            ))}
          </ul>
          {part.state === "pending" ? (
            <div className="flex flex-wrap gap-2 pt-1">
              <Button size="sm" onClick={() => onAnswer(true)}>
                <Check />
                Confirmar
              </Button>
              <Button size="sm" variant="outline" onClick={() => onAnswer(false)}>
                Cancelar
              </Button>
            </div>
          ) : (
            <p className={cn("text-xs font-medium", part.state === "approved" ? "text-success" : "text-muted-foreground")}>
              {part.state === "approved" ? "Confirmado" : "Cancelado — nada foi alterado"}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
