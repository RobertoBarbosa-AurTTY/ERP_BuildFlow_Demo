"use client";

import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

/** Renderiza as respostas do assistente (markdown leve + tabelas). Links internos usam o roteador. */
export function Markdown({ children, className }: { children: string; className?: string }) {
  return (
    <div className={cn("space-y-3 text-sm leading-relaxed break-words", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href = "", children: label }) =>
            href.startsWith("/") ? (
              <Link href={href} className="font-medium text-primary underline-offset-4 hover:underline">
                {label}
              </Link>
            ) : (
              <a href={href} target="_blank" rel="noreferrer" className="font-medium text-primary underline-offset-4 hover:underline">
                {label}
              </a>
            ),
          p: ({ children: c }) => <p>{c}</p>,
          ul: ({ children: c }) => <ul className="ml-5 list-disc space-y-1">{c}</ul>,
          ol: ({ children: c }) => <ol className="ml-5 list-decimal space-y-1">{c}</ol>,
          strong: ({ children: c }) => <strong className="font-semibold">{c}</strong>,
          h1: ({ children: c }) => <p className="text-base font-semibold">{c}</p>,
          h2: ({ children: c }) => <p className="text-base font-semibold">{c}</p>,
          h3: ({ children: c }) => <p className="font-semibold">{c}</p>,
          code: ({ children: c }) => <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">{c}</code>,
          pre: ({ children: c }) => <pre className="overflow-x-auto rounded-lg bg-muted p-3 text-xs">{c}</pre>,
          table: ({ children: c }) => (
            <div className="overflow-x-auto rounded-lg border">
              <table className="tabular w-full text-xs">{c}</table>
            </div>
          ),
          thead: ({ children: c }) => <thead className="bg-muted/60">{c}</thead>,
          th: ({ children: c }) => <th className="px-3 py-2 text-left font-medium whitespace-nowrap text-muted-foreground">{c}</th>,
          td: ({ children: c }) => <td className="border-t px-3 py-1.5 align-top">{c}</td>,
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
