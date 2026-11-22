"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CalendarClock, CheckCircle2, HandCoins, Plus, TrendingUp, Wallet } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { PageHeader } from "@/components/page-header";
import { EmptyState, ErrorState } from "@/components/query-state";
import { StatCard } from "@/components/stat-card";
import { BillFilters } from "@/components/finance/bill-filters";
import { BillFormSheet, EMPTY_BILL_FORM, type BillFormValues } from "@/components/finance/bill-form-sheet";
import {
  distinctSorted,
  EMPTY_FILTERS,
  filterBills,
  inputDateOf,
  summarizeBills,
  type BillFilters as Filters,
  type StatusFilter,
} from "@/components/finance/bill-utils";
import { BillsTable } from "@/components/finance/bills-table";
import { CustomerPicker } from "@/components/finance/customer-picker";
import { InflowChart } from "@/components/finance/inflow-chart";
import { SettleDialog } from "@/components/finance/settle-dialog";
import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { hasRole, useSession } from "@/lib/auth";
import { billStatus } from "@/lib/domain/calc";
import type { AccountReceivable, PaymentMethod } from "@/lib/domain/types";
import { errorMessage } from "@/lib/errors";
import { formatCurrency, formatDate } from "@/lib/format";
import {
  cancelReceivable,
  createReceivable,
  deleteReceivable,
  deleteReceivableGroup,
  listReceivables,
  projectInflow,
  RECEIVABLE_CATEGORIES,
  receiveReceivable,
  updateReceivable,
} from "@/lib/services/receivables";

const getParty = (b: AccountReceivable) => b.customerName;
const getSettled = (b: AccountReceivable) => b.receivedDate;
const STATUS_VALUES: StatusFilter[] = ["all", "open", "pending", "overdue", "paid", "cancelled"];

type Confirm =
  | { kind: "cancel"; bill: AccountReceivable }
  | { kind: "delete"; bill: AccountReceivable }
  | { kind: "deleteGroup"; groupId: string; bills: AccountReceivable[] };

export function ReceivablesClient() {
  const params = useSearchParams();
  const session = useSession();
  const canEdit = hasRole(session, ["Gerente"]);
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ["receivables"], queryFn: listReceivables });
  const bills = useMemo(() => query.data ?? [], [query.data]);

  const [filters, setFilters] = useState<Filters>(() => {
    const status = params.get("status") as StatusFilter | null;
    return {
      ...EMPTY_FILTERS,
      party: params.get("cliente") || "all",
      status: status && STATUS_VALUES.includes(status) ? status : EMPTY_FILTERS.status,
    };
  });
  const [grouped, setGrouped] = useState(true);
  const [form, setForm] = useState<{ open: boolean; bill: AccountReceivable | null; key: number }>({
    open: false,
    bill: null,
    key: 0,
  });
  const [settling, setSettling] = useState<AccountReceivable | null>(null);
  const [confirm, setConfirm] = useState<Confirm | null>(null);

  const summary = useMemo(() => summarizeBills(bills, getSettled), [bills]);
  const filtered = useMemo(() => filterBills(bills, filters, getParty), [bills, filters]);
  const categories = useMemo(
    () => distinctSorted([...RECEIVABLE_CATEGORIES, ...bills.map((b) => b.category)]),
    [bills],
  );
  const customersInUse = useMemo(() => distinctSorted(bills.map((b) => b.customerName)), [bills]);
  const projection = useMemo(() => projectInflow(bills, 30), [bills]);
  const projectedTotal = projection.reduce((s, p) => s + p.amount, 0);
  const nextWeek = projection.slice(0, 7).reduce((s, p) => s + p.amount, 0);

  const overdueDebtors = useMemo(() => {
    const map = new Map<string, number>();
    for (const b of bills) if (billStatus(b) === "overdue") map.set(b.customerName, (map.get(b.customerName) ?? 0) + b.amount);
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [bills]);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["receivables"] });
    queryClient.invalidateQueries({ queryKey: ["customers"] });
  };
  const onError = (error: unknown) => toast.error(errorMessage(error));

  const save = useMutation({
    mutationFn: (values: BillFormValues & { dueDateISO: string }) => {
      const input = {
        description: values.description,
        customerId: values.party.id,
        customerName: values.party.name,
        category: values.category,
        amount: values.amount,
        dueDate: values.dueDateISO,
        documentNumber: values.documentNumber,
        notes: values.notes,
        recurring: values.recurring,
      };
      return form.bill
        ? updateReceivable(form.bill._id, input).then((b) => [b])
        : createReceivable({ ...input, installments: values.installments });
    },
    onSuccess: (created) => {
      toast.success(
        form.bill ? "Conta atualizada" : created.length > 1 ? `${created.length} parcelas cadastradas` : "Conta cadastrada",
      );
      setForm((f) => ({ ...f, open: false }));
      invalidate();
    },
    onError,
  });

  const receive = useMutation({
    mutationFn: (input: { id: string; date: string; paymentMethod: PaymentMethod }) =>
      receiveReceivable(input.id, { date: input.date, paymentMethod: input.paymentMethod }),
    onSuccess: ({ next }) => {
      toast.success("Recebimento registrado", {
        description: next ? `Próxima ocorrência gerada para ${formatDate(next.dueDate)}.` : undefined,
      });
      setSettling(null);
      invalidate();
    },
    onError,
  });

  const runConfirm = useMutation({
    mutationFn: async (action: Confirm) => {
      if (action.kind === "cancel") await cancelReceivable(action.bill._id);
      else if (action.kind === "delete") await deleteReceivable(action.bill._id);
      else await deleteReceivableGroup(action.groupId);
      return action;
    },
    onSuccess: (action) => {
      toast.success(
        action.kind === "cancel" ? "Conta cancelada" : action.kind === "delete" ? "Conta excluída" : "Parcelamento excluído",
      );
      invalidate();
    },
    onError,
  });

  const openCreate = () => setForm((f) => ({ open: true, bill: null, key: f.key + 1 }));
  const openEdit = (bill: AccountReceivable) => setForm((f) => ({ open: true, bill, key: f.key + 1 }));

  const initial: BillFormValues = form.bill
    ? {
        description: form.bill.description,
        party: { id: form.bill.customerId, name: form.bill.customerName },
        category: form.bill.category,
        amount: form.bill.amount,
        dueDate: inputDateOf(form.bill.dueDate),
        documentNumber: form.bill.documentNumber ?? "",
        notes: form.bill.notes ?? "",
        recurring: Boolean(form.bill.recurring),
        installments: 1,
      }
    : EMPTY_BILL_FORM("Vendas a prazo");

  return (
    <>
      <PageHeader
        title="Contas a receber"
        description="Vendas a prazo, crediário e serviços a receber dos clientes."
        actions={
          canEdit && (
            <Button onClick={openCreate}>
              <Plus />
              Nova conta
            </Button>
          )
        }
      />

      {overdueDebtors.length > 0 && (
        <Alert variant="destructive">
          <AlertTriangle />
          <AlertTitle>
            {summary.overdue.count} {summary.overdue.count === 1 ? "conta vencida" : "contas vencidas"} somando{" "}
            {formatCurrency(summary.overdue.total)}
          </AlertTitle>
          <AlertDescription>
            {overdueDebtors
              .slice(0, 3)
              .map(([name, amount]) => `${name} (${formatCurrency(amount)})`)
              .join(" · ")}
            {overdueDebtors.length > 3 && ` e mais ${overdueDebtors.length - 3}`}
          </AlertDescription>
          <AlertAction>
            <Button size="sm" variant="outline" onClick={() => setFilters({ ...EMPTY_FILTERS, status: "overdue" })}>
              Ver vencidas
            </Button>
          </AlertAction>
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="A receber"
          icon={Wallet}
          loading={query.isPending}
          value={formatCurrency(summary.pending.total)}
          hint={`${summary.pending.count} contas a vencer`}
        />
        <StatCard
          label="Vencido"
          icon={AlertTriangle}
          tone="destructive"
          loading={query.isPending}
          value={formatCurrency(summary.overdue.total)}
          hint={summary.overdue.count ? `${summary.overdue.count} contas em atraso` : "Nenhuma conta em atraso"}
        />
        <StatCard
          label="Vence em 7 dias"
          icon={CalendarClock}
          tone="warning"
          loading={query.isPending}
          value={formatCurrency(summary.dueSoon.total)}
          hint={`${summary.dueSoon.count} contas na semana`}
        />
        <StatCard
          label="Recebido no mês"
          icon={CheckCircle2}
          tone="success"
          loading={query.isPending}
          value={formatCurrency(summary.settledThisMonth.total)}
          hint={`${summary.settledThisMonth.count} recebimentos`}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="size-4 text-muted-foreground" />
            Entradas previstas · próximos 30 dias
          </CardTitle>
          <CardDescription>Contas pendentes agrupadas pelo dia de vencimento (não inclui vencidas).</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6 md:grid-cols-[12rem_1fr] md:items-center">
          {query.isPending ? (
            <>
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-40 w-full" />
            </>
          ) : (
            <>
              <div className="flex gap-6 md:flex-col md:gap-4">
                <div>
                  <p className="text-xs text-muted-foreground">Total previsto</p>
                  <p className="tabular text-2xl font-semibold tracking-tight">{formatCurrency(projectedTotal)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Nos próximos 7 dias</p>
                  <p className="tabular text-lg font-medium">{formatCurrency(nextWeek)}</p>
                </div>
              </div>
              {projectedTotal > 0 ? (
                <InflowChart data={projection} />
              ) : (
                <p className="py-10 text-center text-sm text-muted-foreground">Nenhuma entrada prevista para o período.</p>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Card className="gap-0 py-0">
        <CardContent className="flex flex-col gap-3 border-b p-4">
          <BillFilters
            value={filters}
            onChange={setFilters}
            categories={categories}
            parties={customersInUse}
            partyLabel="Cliente"
            paidLabel="Recebidas"
          />
          <div className="flex items-center gap-2">
            <Switch id="group-installments" size="sm" checked={grouped} onCheckedChange={setGrouped} />
            <Label htmlFor="group-installments" className="text-sm font-normal text-muted-foreground">
              Agrupar parcelamentos
            </Label>
          </div>
        </CardContent>
        <CardContent className="p-0">
          {query.isPending ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 6 }, (_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : query.isError ? (
            <div className="p-4">
              <ErrorState error={query.error} onRetry={() => query.refetch()} />
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-4">
              <EmptyState
                icon={HandCoins}
                title="Nenhuma conta encontrada"
                description={bills.length ? "Ajuste os filtros para ver outras contas." : "Cadastre a primeira conta a receber."}
              >
                {bills.length > 0 && (
                  <Button variant="outline" size="sm" onClick={() => setFilters(EMPTY_FILTERS)}>
                    Limpar filtros
                  </Button>
                )}
              </EmptyState>
            </div>
          ) : (
            <BillsTable
              bills={filtered}
              allBills={bills}
              getParty={getParty}
              getSettledDate={getSettled}
              grouped={grouped}
              canEdit={canEdit}
              labels={{ party: "Cliente", settle: "Receber", settled: "Recebido", settledOn: "Recebido em" }}
              onEdit={openEdit}
              onSettle={setSettling}
              onCancel={(bill) => setConfirm({ kind: "cancel", bill })}
              onDelete={(bill) => setConfirm({ kind: "delete", bill })}
              onDeleteGroup={(groupId, list) => setConfirm({ kind: "deleteGroup", groupId, bills: list })}
            />
          )}
        </CardContent>
      </Card>

      <BillFormSheet
        key={form.key}
        open={form.open}
        onOpenChange={(open) => setForm((f) => ({ ...f, open }))}
        mode={form.bill ? "edit" : "create"}
        title={form.bill ? "Editar conta a receber" : "Nova conta a receber"}
        description={
          form.bill ? "Altere os dados da conta em aberto." : "Lance uma venda a prazo, crediário ou serviço a receber."
        }
        initial={initial}
        categories={categories}
        partyLabel="Cliente"
        isInstallment={Boolean(form.bill?.installmentGroupId)}
        pending={save.isPending}
        onSubmit={(values) => save.mutate(values)}
        renderParty={(props) => <CustomerPicker {...props} />}
      />

      <SettleDialog
        key={settling?._id ?? "none"}
        open={!!settling}
        onOpenChange={(open) => !open && setSettling(null)}
        title="Registrar recebimento"
        bill={settling}
        party={settling?.customerName}
        dateLabel="Data do recebimento"
        confirmLabel="Confirmar recebimento"
        defaultMethod="PIX"
        pending={receive.isPending}
        onConfirm={(input) => settling && receive.mutate({ id: settling._id, ...input })}
      />

      <ConfirmDialog
        open={!!confirm}
        onOpenChange={(open) => !open && setConfirm(null)}
        destructive
        title={
          confirm?.kind === "cancel"
            ? "Cancelar esta conta?"
            : confirm?.kind === "delete"
              ? "Excluir esta conta?"
              : "Excluir parcelamento?"
        }
        description={
          confirm?.kind === "cancel"
            ? `"${confirm.bill.description}" ficará marcada como cancelada e não entrará nos totais.`
            : confirm?.kind === "delete"
              ? `"${confirm.bill.description}" será removida permanentemente.`
              : confirm
                ? `As parcelas em aberto (${confirm.bills.filter((b) => b.status !== "paid").length}) serão removidas. Parcelas já recebidas continuam no histórico.`
                : undefined
        }
        confirmLabel={confirm?.kind === "cancel" ? "Cancelar conta" : "Excluir"}
        onConfirm={() => confirm && runConfirm.mutate(confirm)}
      />
    </>
  );
}
