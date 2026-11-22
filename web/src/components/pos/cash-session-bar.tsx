"use client";

import { AlertTriangle, ArrowDownToLine, ArrowUpFromLine, History, Lock } from "lucide-react";
import Link from "next/link";
import { formatCurrency, formatDateTime } from "@/lib/format";
import type { CashSummary } from "@/lib/services/cash";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface CashSessionBarProps {
  summary: CashSummary;
  onSupply: () => void;
  onWithdraw: () => void;
  onClose: () => void;
}

export function CashSessionBar({ summary, onSupply, onWithdraw, onClose }: CashSessionBarProps) {
  const { session } = summary;
  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-card px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <div className="flex items-center gap-2.5">
          <span className="relative flex size-2.5">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-50" />
            <span className="relative inline-flex size-2.5 rounded-full bg-success" />
          </span>
          <div className="leading-tight">
            <p className="text-sm font-semibold">
              Caixa #{session.number} <StatusBadge tone="success" className="ml-1 align-middle">Aberto</StatusBadge>
            </p>
            <p className="text-xs text-muted-foreground">
              {session.operatorName} · desde {formatDateTime(session.openedAt)}
            </p>
          </div>
        </div>
        <Metric label="Vendas" value={`${formatCurrency(summary.totalSales)}`} hint={`${summary.salesCount} venda(s)`} />
        <Metric label="Dinheiro em caixa" value={formatCurrency(summary.expectedCash)} />
        {summary.longOpen && (
          <span className="flex items-center gap-1.5 rounded-md bg-warning/15 px-2 py-1 text-xs font-medium text-warning">
            <AlertTriangle className="size-3.5" />
            Aberto há mais de 24h
          </span>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/sales-history">
                <History />
                Histórico
              </Link>
            </Button>
          </TooltipTrigger>
          <TooltipContent>Histórico de vendas</TooltipContent>
        </Tooltip>
        <Button variant="outline" size="sm" onClick={onSupply}>
          <ArrowDownToLine className="text-success" />
          Suprimento
          <Kbd>F8</Kbd>
        </Button>
        <Button variant="outline" size="sm" onClick={onWithdraw}>
          <ArrowUpFromLine className="text-destructive" />
          Sangria
          <Kbd>F10</Kbd>
        </Button>
        <Button variant="secondary" size="sm" onClick={onClose}>
          <Lock />
          Fechar caixa
        </Button>
      </div>
    </div>
  );
}

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="leading-tight">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="tabular text-sm font-semibold">
        {value}
        {hint && <span className="ml-1.5 text-xs font-normal text-muted-foreground">{hint}</span>}
      </p>
    </div>
  );
}
