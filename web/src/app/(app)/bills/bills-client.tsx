"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CalendarClock, CheckCircle2, Plus, ReceiptText, Wallet } from "lucide-react";
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
} from "@/components/finance/bill-utils";
import { BillsTable } from "@/components/finance/bills-table";
import { SettleDialog } from "@/components/finance/settle-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { hasRole, useSession } from "@/lib/auth";
import type { AccountPayable, PaymentMethod } from "@/lib/domain/types";
import { errorMessage } from "@/lib/errors";
import { formatCurrency, formatDate } from "@/lib/format";
import {
  cancelPayable,
  createPayable,
  deletePayable,
  deletePayableGroup,
  listPayables,
  PAYABLE_CATEGORIES,
  payPayable,
  updatePayable,
} from "@/lib/services/payables";

const getParty = (b: AccountPayable) => b.supplier;
const getSettled = (b: AccountPayable) => b.paidDate;

type Confirm =
  | { kind: "cancel"; bill: AccountPayable }
  | { kind: "delete"; bill: AccountPayable }
  | { kind: "deleteGroup"; groupId: string; bills: AccountPayable[] };

export function BillsClient() {
  const session = useSession();
  const canEdit = hasRole(session, ["Gerente"]);
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ["payables"], queryFn: listPayables });
  const bills = useMemo(() => query.data ?? [], [query.data]);

  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [grouped, setGrouped] = useState(true);
  const [form, setForm] = useState<{ open: boolean; bill: AccountPayable | null; key: number }>({
    open: false,
    bill: null,
    key: 0,
  });
  const [settling, setSettling] = useState<AccountPayable | null>(null);
  const [confirm, setConfirm] = useState<Confirm | null>(null);

  const summary = useMemo(() => summarizeBills(bills, getSettled), [bills]);
  const filtered = useMemo(() => filterBills(bills, filters, getParty), [bills, filters]);
  const categories = useMemo(() => distinctSorted([...PAYABLE_CATEGORIES, ...bills.map((b) => b.category)]), [bills]);
  const suppliers = useMemo(() => distinctSorted(bills.map((b) => b.supplier)), [bills]);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["payables"] });
  const onError = (error: unknown) => toast.error(errorMessage(error));

  const save = useMutation({
    mutationFn: (values: BillFormValues & { dueDateISO: string }) => {
      const input = {
        description: values.description,
        supplier: values.party.name,
        category: values.category,
        amount: values.amount,
        dueDate: values.dueDateISO,
        documentNumber: values.documentNumber,
        notes: values.notes,
        recurring: values.recurring,
      };
      return form.bill
        ? updatePayable(form.bill._id, input).then((b) => [b])
        : createPayable({ ...input, installments: values.installments });
    },
    onSuccess: (created) => {
      toast.success(
        form.bill
          ? "Conta atualizada"
          : created.length > 1
            ? `${created.length} parcelas cadastradas`
            : "Conta cadastrada",
      );
      setForm((f) => ({ ...f, open: false }));
      invalidate();
    },
    onError,
  });

  const pay = useMutation({
    mutationFn: (input: { id: string; date: string; paymentMethod: PaymentMethod }) =>
      payPayable(input.id, { date: input.date, paymentMethod: input.paymentMethod }),
    onSuccess: ({ next }) => {
      toast.success("Pagamento registrado", {
        description: next ? `Próxima ocorrência gerada para ${formatDate(next.dueDate)}.` : undefined,
      });
      setSettling(null);
      invalidate();
    },
    onError,
  });

  const runConfirm = useMutation({
    mutationFn: async (action: Confirm) => {
      if (action.kind === "cancel") await cancelPayable(action.bill._id);
      else if (action.kind === "delete") await deletePayable(action.bill._id);
      else await deletePayableGroup(action.groupId);
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
  const openEdit = (bill: AccountPayable) => setForm((f) => ({ open: true, bill, key: f.key + 1 }));

  const initial: BillFormValues = form.bill
    ? {
        description: form.bill.description,
        party: { name: form.bill.supplier },
        category: form.bill.category,
        amount: form.bill.amount,
        dueDate: inputDateOf(form.bill.dueDate),
        documentNumber: form.bill.documentNumber ?? "",
        notes: form.bill.notes ?? "",
        recurring: Boolean(form.bill.recurring),
        installments: 1,
      }
    : EMPTY_BILL_FORM("Fornecedores");

  return (
    <>
      <PageHeader
        title="Contas a pagar"
        description="Fornecedores, despesas fixas e parcelamentos da loja."
        actions={
          canEdit && (
            <Button onClick={openCreate}>
              <Plus />
              Nova conta
            </Button>
          )
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Pendente"
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
          label="Pago no mês"
          icon={CheckCircle2}
          tone="success"
          loading={query.isPending}
          value={formatCurrency(summary.settledThisMonth.total)}
          hint={`${summary.settledThisMonth.count} pagamentos`}
        />
      </div>

      <Card className="gap-0 py-0">
        <CardContent className="flex flex-col gap-3 border-b p-4">
          <BillFilters
            value={filters}
            onChange={setFilters}
            categories={categories}
            parties={suppliers}
            partyLabel="Fornecedor"
            paidLabel="Pagas"
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
                icon={ReceiptText}
                title="Nenhuma conta encontrada"
                description={bills.length ? "Ajuste os filtros para ver outras contas." : "Cadastre a primeira conta a pagar."}
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
              labels={{ party: "Fornecedor", settle: "Pagar", settled: "Pago", settledOn: "Pago em" }}
              onEdit={openEdit}
              onSettle={setSettling}
              onCancel={(bill) => setConfirm({ kind: "cancel", bill })}
              onDelete={(bill) => setConfirm({ kind: "delete", bill })}
              onDeleteGroup={(groupId, list) => setConfirm({ kind: "deleteGroup", groupId, bills: list })}
            />
          )}
        </CardContent>
      </Card>

      <datalist id="supplier-options">
        {suppliers.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>

      <BillFormSheet
        key={form.key}
        open={form.open}
        onOpenChange={(open) => setForm((f) => ({ ...f, open }))}
        mode={form.bill ? "edit" : "create"}
        title={form.bill ? "Editar conta a pagar" : "Nova conta a pagar"}
        description={form.bill ? "Altere os dados da conta em aberto." : "Cadastre uma despesa avulsa, recorrente ou parcelada."}
        initial={initial}
        categories={categories}
        partyLabel="Fornecedor"
        isInstallment={Boolean(form.bill?.installmentGroupId)}
        pending={save.isPending}
        onSubmit={(values) => save.mutate(values)}
        renderParty={({ value, onChange, invalid }) => (
          <Input
            list="supplier-options"
            placeholder="Nome do fornecedor"
            value={value.name}
            aria-invalid={invalid}
            onChange={(e) => onChange({ name: e.target.value })}
          />
        )}
      />

      <SettleDialog
        key={settling?._id ?? "none"}
        open={!!settling}
        onOpenChange={(open) => !open && setSettling(null)}
        title="Registrar pagamento"
        bill={settling}
        party={settling?.supplier}
        dateLabel="Data do pagamento"
        confirmLabel="Confirmar pagamento"
        defaultMethod="Boleto"
        pending={pay.isPending}
        onConfirm={(input) => settling && pay.mutate({ id: settling._id, ...input })}
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
                ? `As parcelas em aberto (${confirm.bills.filter((b) => b.status !== "paid").length}) serão removidas. Parcelas já pagas continuam no histórico.`
                : undefined
        }
        confirmLabel={confirm?.kind === "cancel" ? "Cancelar conta" : "Excluir"}
        onConfirm={() => confirm && runConfirm.mutate(confirm)}
      />
    </>
  );
}
