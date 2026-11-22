"use client";

import { Fragment, useMemo, useState } from "react";
import {
  Ban,
  Check,
  ChevronRight,
  Layers,
  MoreHorizontal,
  Pencil,
  Repeat,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { billStatus } from "@/lib/domain/calc";
import { formatCurrency, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { BillStatusBadge, DueIn } from "./bill-status";
import { baseDescription, type BillBase } from "./bill-utils";

export interface BillsTableLabels {
  party: string; // "Fornecedor"
  settle: string; // "Pagar"
  settled: string; // "Pago" (badge)
  settledOn: string; // "Pago em"
}

interface BillsTableProps<T extends BillBase> {
  bills: T[];
  /** Lista completa, para o progresso dos parcelamentos ignorar filtros. */
  allBills: T[];
  getParty: (bill: T) => string;
  getSettledDate: (bill: T) => string | undefined;
  grouped: boolean;
  canEdit: boolean;
  labels: BillsTableLabels;
  onEdit: (bill: T) => void;
  onSettle: (bill: T) => void;
  onCancel: (bill: T) => void;
  onDelete: (bill: T) => void;
  onDeleteGroup: (groupId: string, bills: T[]) => void;
}

type Entry<T> = { kind: "bill"; bill: T } | { kind: "group"; id: string; items: T[] };

export function BillsTable<T extends BillBase>(props: BillsTableProps<T>) {
  const { bills, allBills, getParty, grouped, labels } = props;
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

  const entries = useMemo<Entry<T>[]>(() => {
    if (!grouped) return bills.map((bill) => ({ kind: "bill", bill }));
    const seen = new Set<string>();
    const out: Entry<T>[] = [];
    for (const bill of bills) {
      const gid = bill.installmentGroupId;
      if (!gid) {
        out.push({ kind: "bill", bill });
        continue;
      }
      if (seen.has(gid)) continue;
      seen.add(gid);
      const items = bills.filter((b) => b.installmentGroupId === gid);
      out.push(items.length > 1 ? { kind: "group", id: gid, items } : { kind: "bill", bill });
    }
    return out;
  }, [bills, grouped]);

  const groupStats = useMemo(() => {
    const stats = new Map<string, { paid: number; total: number; amount: number }>();
    for (const bill of allBills) {
      if (!bill.installmentGroupId) continue;
      const s = stats.get(bill.installmentGroupId) ?? { paid: 0, total: bill.totalInstallments ?? 0, amount: 0 };
      if (bill.status === "paid") s.paid += 1;
      if (bill.status !== "cancelled") s.amount += bill.amount;
      stats.set(bill.installmentGroupId, s);
    }
    return stats;
  }, [allBills]);

  const total = bills.reduce((sum, b) => sum + (b.status === "cancelled" ? 0 : b.amount), 0);

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead className="min-w-64">Descrição</TableHead>
          <TableHead>{labels.party}</TableHead>
          <TableHead>Categoria</TableHead>
          <TableHead>Vencimento</TableHead>
          <TableHead className="text-right">Valor</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="w-0">
            <span className="sr-only">Ações</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {entries.map((entry) => {
          if (entry.kind === "bill") {
            return <BillRow key={entry.bill._id} {...props} bill={entry.bill} groupStats={groupStats} />;
          }
          const open = expanded.has(entry.id);
          const first = entry.items[0];
          const stats = groupStats.get(entry.id);
          const nextOpen = entry.items.find((b) => ["pending", "overdue"].includes(billStatus(b))) ?? first;
          const sum = entry.items.reduce((s, b) => s + (b.status === "cancelled" ? 0 : b.amount), 0);
          const progress = stats && stats.total ? (stats.paid / stats.total) * 100 : 0;
          return (
            <Fragment key={entry.id}>
              <TableRow
                className="cursor-pointer bg-muted/30"
                onClick={() => toggle(entry.id)}
                aria-expanded={open}
              >
                <TableCell>
                  <div className="flex items-center gap-2">
                    <ChevronRight
                      className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-90")}
                    />
                    <div className="min-w-0">
                      <p className="truncate font-medium">{baseDescription(first.description)}</p>
                      <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                        <Layers className="size-3.5" />
                        <span>
                          {entry.items.length} de {stats?.total ?? entry.items.length} parcelas · {stats?.paid ?? 0} quitadas
                        </span>
                        <Progress value={progress} className="w-16" aria-label="Parcelas quitadas" />
                      </div>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="text-muted-foreground">{getParty(first)}</TableCell>
                <TableCell className="text-muted-foreground">{first.category}</TableCell>
                <TableCell>
                  <div className="text-xs text-muted-foreground">Próxima</div>
                  <div>{formatDate(nextOpen.dueDate)}</div>
                </TableCell>
                <TableCell className="tabular text-right font-medium">{formatCurrency(sum)}</TableCell>
                <TableCell>
                  <BillStatusBadge bill={nextOpen} paidLabel={labels.settled} />
                </TableCell>
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <Button variant="ghost" size="sm" onClick={() => toggle(entry.id)}>
                    {open ? "Ocultar" : "Ver parcelas"}
                  </Button>
                </TableCell>
              </TableRow>
              {open &&
                entry.items.map((bill) => (
                  <BillRow key={bill._id} {...props} bill={bill} groupStats={groupStats} nested />
                ))}
            </Fragment>
          );
        })}
      </TableBody>
      <TableFooter>
        <TableRow className="hover:bg-transparent">
          <TableCell colSpan={4} className="text-muted-foreground">
            {bills.length} {bills.length === 1 ? "conta" : "contas"} no filtro
          </TableCell>
          <TableCell className="tabular text-right font-semibold">{formatCurrency(total)}</TableCell>
          <TableCell colSpan={2} />
        </TableRow>
      </TableFooter>
    </Table>
  );
}

function BillRow<T extends BillBase>({
  bill,
  nested,
  groupStats,
  getParty,
  getSettledDate,
  canEdit,
  labels,
  onEdit,
  onSettle,
  onCancel,
  onDelete,
  onDeleteGroup,
  allBills,
}: BillsTableProps<T> & {
  bill: T;
  nested?: boolean;
  groupStats: Map<string, { paid: number; total: number }>;
}) {
  const status = billStatus(bill);
  const open = status === "pending" || status === "overdue";
  const settledDate = getSettledDate(bill);
  const gid = bill.installmentGroupId;
  const stats = gid ? groupStats.get(gid) : undefined;

  return (
    <TableRow className={cn(status === "cancelled" && "text-muted-foreground", nested && "bg-muted/10")}>
      <TableCell>
        <div className={cn("min-w-0", nested && "border-l-2 border-primary/30 pl-6")}>
          <p className={cn("truncate font-medium", status === "cancelled" && "line-through")}>{bill.description}</p>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            {bill.documentNumber && <span>{bill.documentNumber}</span>}
            {gid && bill.installmentNumber && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-1.5 py-0.5 font-medium text-primary">
                    <Layers className="size-3" />
                    {bill.installmentNumber}/{bill.totalInstallments}
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  Parcela {bill.installmentNumber} de {bill.totalInstallments}
                  {stats ? ` · ${stats.paid} quitada${stats.paid === 1 ? "" : "s"}` : ""}
                </TooltipContent>
              </Tooltip>
            )}
            {bill.recurring && (
              <span className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 font-medium">
                <Repeat className="size-3" />
                Mensal
              </span>
            )}
          </div>
        </div>
      </TableCell>
      <TableCell className="max-w-48 truncate">{getParty(bill) || "—"}</TableCell>
      <TableCell className="text-muted-foreground">{bill.category}</TableCell>
      <TableCell>
        <div>{formatDate(bill.dueDate)}</div>
        {status === "paid" ? (
          <span className="text-xs text-muted-foreground">
            {labels.settledOn} {formatDate(settledDate)}
          </span>
        ) : (
          <DueIn bill={bill} />
        )}
      </TableCell>
      <TableCell className={cn("tabular text-right font-medium", status === "cancelled" && "line-through")}>
        {formatCurrency(bill.amount)}
      </TableCell>
      <TableCell>
        <BillStatusBadge bill={bill} paidLabel={labels.settled} />
      </TableCell>
      <TableCell>
        <div className="flex items-center justify-end gap-1">
          {open && canEdit && (
            <Button size="sm" variant="outline" onClick={() => onSettle(bill)}>
              <Check />
              {labels.settle}
            </Button>
          )}
          {canEdit && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label="Mais ações">
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuLabel className="truncate">{bill.description}</DropdownMenuLabel>
                {open && (
                  <DropdownMenuItem onSelect={() => onEdit(bill)}>
                    <Pencil />
                    Editar
                  </DropdownMenuItem>
                )}
                {open && (
                  <DropdownMenuItem onSelect={() => onCancel(bill)}>
                    <Ban />
                    Cancelar conta
                  </DropdownMenuItem>
                )}
                {open && <DropdownMenuSeparator />}
                <DropdownMenuItem variant="destructive" onSelect={() => onDelete(bill)}>
                  <Trash2 />
                  Excluir
                </DropdownMenuItem>
                {gid && (
                  <DropdownMenuItem
                    variant="destructive"
                    onSelect={() => onDeleteGroup(gid, allBills.filter((b) => b.installmentGroupId === gid))}
                  >
                    <Layers />
                    Excluir parcelamento
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </TableCell>
    </TableRow>
  );
}
