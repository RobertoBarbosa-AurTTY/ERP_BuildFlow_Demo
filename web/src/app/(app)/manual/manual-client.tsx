"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Collapsible } from "radix-ui";
import { ArrowUpRight, ChevronDown, CircleHelp, Keyboard, Lightbulb, Search, SearchX } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/query-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";
import { Kbd } from "@/components/ui/kbd";
import { cn } from "@/lib/utils";
import { FAQ, MODULES, SHORTCUTS, type HelpModule, type HelpTopic } from "./content";

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

function topicText(topic: HelpTopic) {
  return normalize([topic.title, topic.body, ...(topic.steps ?? []), topic.tip].filter(Boolean).join(" "));
}

export function ManualClient() {
  const [search, setSearch] = useState("");
  const [openTopics, setOpenTopics] = useState<Set<string>>(() => new Set(["pdv:0"]));
  const term = normalize(search.trim());

  const results = useMemo(() => {
    if (!term) return MODULES.map((m) => ({ module: m, topics: m.topics.map((t, i) => ({ topic: t, index: i })) }));
    return MODULES.map((m) => {
      const moduleHit = normalize(`${m.title} ${m.summary}`).includes(term);
      const topics = m.topics.map((t, i) => ({ topic: t, index: i })).filter(({ topic }) => moduleHit || topicText(topic).includes(term));
      return { module: m, topics };
    }).filter((r) => r.topics.length > 0);
  }, [term]);

  const faq = useMemo(
    () => (term ? FAQ.filter((f) => normalize(`${f.q} ${f.a}`).includes(term)) : FAQ),
    [term],
  );
  const shortcuts = useMemo(
    () =>
      term
        ? SHORTCUTS.filter((s) => normalize(`${s.keys.join(" ")} ${s.label} ${s.description} atalho teclado pdv`).includes(term))
        : SHORTCUTS,
    [term],
  );

  const totalHits = results.reduce((s, r) => s + r.topics.length, 0) + faq.length + shortcuts.length;

  const toggle = (id: string, open: boolean) =>
    setOpenTopics((prev) => {
      const next = new Set(prev);
      if (open) next.add(id);
      else next.delete(id);
      return next;
    });

  return (
    <>
      <PageHeader title="Central de ajuda" description="Guias rápidos de cada módulo, atalhos do PDV e perguntas frequentes." />

      <Card className="bg-linear-to-br from-primary/10 via-card to-card">
        <CardContent className="flex flex-col gap-3 py-2 sm:py-4">
          <p className="text-lg font-semibold tracking-tight">Como podemos ajudar?</p>
          <InputGroup className="h-10 bg-background sm:max-w-xl">
            <InputGroupAddon>
              <Search />
            </InputGroupAddon>
            <InputGroupInput
              placeholder="Ex.: parcelar, sangria, desconto, CNPJ…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Buscar na ajuda"
            />
            {search && (
              <InputGroupAddon align="inline-end">
                <InputGroupButton onClick={() => setSearch("")}>Limpar</InputGroupButton>
              </InputGroupAddon>
            )}
          </InputGroup>
          {term && (
            <p className="text-sm text-muted-foreground">
              {totalHits} {totalHits === 1 ? "resultado" : "resultados"} para &ldquo;{search.trim()}&rdquo;
            </p>
          )}
        </CardContent>
      </Card>

      {term && totalHits === 0 ? (
        <EmptyState
          icon={SearchX}
          title="Nada encontrado"
          description="Tente outra palavra, como o nome do módulo ou da ação que você quer fazer."
        >
          <Button variant="outline" size="sm" onClick={() => setSearch("")}>
            Ver todos os tópicos
          </Button>
        </EmptyState>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[14rem_1fr]">
          <nav className="hidden lg:block" aria-label="Módulos">
            <div className="sticky top-20 space-y-4">
              {(["Operação", "Financeiro", "Análises", "Sistema"] as const).map((group) => {
                const items = results.filter((r) => r.module.group === group);
                if (!items.length) return null;
                return (
                  <div key={group} className="space-y-1">
                    <p className="px-2 text-xs font-medium text-muted-foreground">{group}</p>
                    {items.map(({ module: m }) => (
                      <a
                        key={m.id}
                        href={`#${m.id}`}
                        className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-foreground/80 hover:bg-muted hover:text-foreground"
                      >
                        <m.icon className="size-4 text-muted-foreground" />
                        {m.title}
                      </a>
                    ))}
                  </div>
                );
              })}
              <div className="space-y-1">
                <p className="px-2 text-xs font-medium text-muted-foreground">Referência</p>
                <a href="#atalhos" className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-foreground/80 hover:bg-muted hover:text-foreground">
                  <Keyboard className="size-4 text-muted-foreground" />
                  Atalhos do PDV
                </a>
                <a href="#faq" className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-foreground/80 hover:bg-muted hover:text-foreground">
                  <CircleHelp className="size-4 text-muted-foreground" />
                  Perguntas frequentes
                </a>
              </div>
            </div>
          </nav>

          <div className="min-w-0 space-y-6">
            {shortcuts.length > 0 && (
              <Card id="atalhos" className="scroll-mt-20">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Keyboard className="size-4 text-muted-foreground" />
                    Atalhos de teclado do PDV
                  </CardTitle>
                  <CardDescription>Funcionam na tela de vendas, sem precisar do mouse.</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                    {shortcuts.map((s) => (
                      <div key={s.label} className="flex items-center gap-3 rounded-lg border p-3">
                        <Kbd className="h-7 min-w-10 text-sm text-foreground">{s.keys.join(" + ")}</Kbd>
                        <div className="min-w-0">
                          <p className="text-sm font-medium">{s.label}</p>
                          <p className="truncate text-xs text-muted-foreground">{s.description}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {results.map(({ module: m, topics }) => (
              <ModuleSection
                key={m.id}
                module={m}
                topics={topics}
                forceOpen={!!term}
                openTopics={openTopics}
                onToggle={toggle}
              />
            ))}

            {faq.length > 0 && (
              <Card id="faq" className="scroll-mt-20">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <CircleHelp className="size-4 text-muted-foreground" />
                    Perguntas frequentes
                  </CardTitle>
                </CardHeader>
                <CardContent className="divide-y">
                  {faq.map((f) => {
                    const id = `faq:${f.q}`;
                    return (
                      <TopicCollapsible
                        key={f.q}
                        title={f.q}
                        open={!!term || openTopics.has(id)}
                        onOpenChange={(o) => toggle(id, o)}
                      >
                        <p className="text-muted-foreground">{f.a}</p>
                      </TopicCollapsible>
                    );
                  })}
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function ModuleSection({
  module: m,
  topics,
  forceOpen,
  openTopics,
  onToggle,
}: {
  module: HelpModule;
  topics: { topic: HelpTopic; index: number }[];
  forceOpen: boolean;
  openTopics: Set<string>;
  onToggle: (id: string, open: boolean) => void;
}) {
  return (
    <Card id={m.id} className="scroll-mt-20">
      <CardHeader className="flex flex-row items-start gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <m.icon className="size-5" />
        </div>
        <div className="min-w-0 flex-1 space-y-1">
          <CardTitle>{m.title}</CardTitle>
          <CardDescription>{m.summary}</CardDescription>
        </div>
        <Button variant="ghost" size="sm" asChild className="shrink-0">
          <Link href={m.href}>
            Abrir
            <ArrowUpRight />
          </Link>
        </Button>
      </CardHeader>
      <CardContent className="divide-y">
        {topics.map(({ topic, index }) => {
          const id = `${m.id}:${index}`;
          return (
            <TopicCollapsible
              key={id}
              title={topic.title}
              open={forceOpen || openTopics.has(id)}
              onOpenChange={(o) => onToggle(id, o)}
            >
              {topic.body && <p className="text-muted-foreground">{topic.body}</p>}
              {topic.steps && (
                <ol className="space-y-2">
                  {topic.steps.map((step, i) => (
                    <li key={i} className="flex gap-3">
                      <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">
                        {i + 1}
                      </span>
                      <span className="text-muted-foreground">{step}</span>
                    </li>
                  ))}
                </ol>
              )}
              {topic.tip && (
                <p className="mt-3 flex items-start gap-2 rounded-md bg-warning/10 p-2.5 text-foreground">
                  <Lightbulb className="mt-0.5 size-4 shrink-0 text-warning" />
                  {topic.tip}
                </p>
              )}
            </TopicCollapsible>
          );
        })}
      </CardContent>
    </Card>
  );
}

function TopicCollapsible({
  title,
  open,
  onOpenChange,
  children,
}: {
  title: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <Collapsible.Root open={open} onOpenChange={onOpenChange} className="py-1 first:pt-0 last:pb-0">
      <Collapsible.Trigger className="group flex w-full items-center justify-between gap-3 rounded-md py-2.5 text-left text-sm font-medium outline-none hover:text-primary focus-visible:ring-3 focus-visible:ring-ring/50">
        {title}
        <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
      </Collapsible.Trigger>
      <Collapsible.Content className="pb-3 text-sm leading-relaxed">{children}</Collapsible.Content>
    </Collapsible.Root>
  );
}
