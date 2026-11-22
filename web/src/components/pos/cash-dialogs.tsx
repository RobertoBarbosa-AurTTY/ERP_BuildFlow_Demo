"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowDownToLine, ArrowUpFromLine, LockKeyhole, Store } from "lucide-react";
import type { CashMovementType } from "@/lib/domain/types";
import { round2 } from "@/lib/domain/calc";
import { useSession } from "@/lib/auth";
import { errorMessage } from "@/lib/errors";
import { formatCurrency, formatDateTime } from "@/lib/format";
import {
  addCashMovement,
  closeCashSession,
  openCashSession,
  RECONCILED_METHODS,
  type CashSummary,
  type CountedByMethod,
} from "@/lib/services/cash";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { moneyInput, parseMoney } from "./money";
import { PAYMENT_ICON } from "./payment-methods";

function invalidateCash(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: ["cash"] });
}

// ---------------------------------------------------------------------------
// Abertura
// ---------------------------------------------------------------------------

export function OpenCashCard({ lastClosing }: { lastClosing?: string }) {
  const user = useSession();
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState("200,00");
  const [notes, setNotes] = useState("");
  const parsed = parseMoney(amount || "0");

  const mutation = useMutation({
    mutationFn: () =>
      openCashSession({ openingAmount: parsed, notes, operatorName: user?.name ?? "Operador" }),
    onSuccess: (session) => {
      toast.success(`Caixa #${session.number} aberto`, {
        description: `Fundo de troco: ${formatCurrency(session.openingAmount)}`,
      });
      invalidateCash(queryClient);
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  return (
    <div className="flex flex-1 items-center justify-center py-10">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="mb-2 flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Store className="size-5" />
          </div>
          <CardTitle className="text-lg">Caixa fechado</CardTitle>
          <CardDescription>
            Abra o caixa informando o fundo de troco para começar a vender.
            {lastClosing && <> Último fechamento: {lastClosing}.</>}
          </CardDescription>
        </CardHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!Number.isNaN(parsed) && parsed >= 0) mutation.mutate();
          }}
        >
          <CardContent>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="opening-amount">Valor inicial (fundo de troco)</FieldLabel>
                <InputGroup className="h-10">
                  <InputGroupAddon>R$</InputGroupAddon>
                  <InputGroupInput
                    id="opening-amount"
                    autoFocus
                    inputMode="decimal"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    onFocus={(e) => e.currentTarget.select()}
                    className="tabular text-base"
                  />
                </InputGroup>
                {parsed === 0 && (
                  <FieldDescription className="text-warning">Caixa será aberto sem troco.</FieldDescription>
                )}
              </Field>
              <Field>
                <FieldLabel htmlFor="opening-notes">Observação (opcional)</FieldLabel>
                <Textarea
                  id="opening-notes"
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Ex.: troco conferido com a gerência"
                />
              </Field>
            </FieldGroup>
          </CardContent>
          <CardFooter className="mt-6">
            <Button type="submit" size="lg" className="w-full" disabled={Number.isNaN(parsed) || parsed < 0 || mutation.isPending}>
              {mutation.isPending ? <Spinner /> : <LockKeyhole />}
              Abrir caixa
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Suprimento / sangria
// ---------------------------------------------------------------------------

const REASONS: Record<CashMovementType, string[]> = {
  suprimento: ["Troco adicional", "Reposição de fundo", "Outros"],
  retirada: ["Sangria para cofre", "Pagamento de fornecedor", "Despesa operacional", "Entregas", "Outros"],
};

export function CashMovementDialog({
  type,
  summary,
  onOpenChange,
}: {
  type: CashMovementType | null;
  summary: CashSummary;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={type !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {type && <CashMovementForm type={type} summary={summary} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function CashMovementForm({ type, summary, onDone }: { type: CashMovementType; summary: CashSummary; onDone: () => void }) {
  const user = useSession();
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState(REASONS[type][0]);
  const [details, setDetails] = useState("");
  const parsed = parseMoney(amount);
  const isWithdrawal = type === "retirada";
  const tooMuch = isWithdrawal && parsed > summary.expectedCash;
  const valid = !Number.isNaN(parsed) && parsed > 0 && !tooMuch;

  const mutation = useMutation({
    mutationFn: () =>
      addCashMovement({
        caixaId: summary.session._id,
        type,
        amount: parsed,
        reason: details.trim() ? `${category} — ${details.trim()}` : category,
        userName: user?.name ?? "Operador",
      }),
    onSuccess: (move) => {
      toast.success(isWithdrawal ? "Sangria registrada" : "Suprimento registrado", {
        description: `${formatCurrency(move.amount)} · ${move.reason}`,
      });
      invalidateCash(queryClient);
      onDone();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) mutation.mutate();
      }}
    >
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          {isWithdrawal ? (
            <ArrowUpFromLine className="size-4 text-destructive" />
          ) : (
            <ArrowDownToLine className="size-4 text-success" />
          )}
          {isWithdrawal ? "Sangria (retirada)" : "Suprimento"}
        </DialogTitle>
        <DialogDescription>
          {isWithdrawal ? "Retirada de dinheiro da gaveta." : "Entrada de dinheiro na gaveta."} Dinheiro em caixa:{" "}
          <span className="tabular font-medium text-foreground">{formatCurrency(summary.expectedCash)}</span>
        </DialogDescription>
      </DialogHeader>
      <FieldGroup>
        <Field data-invalid={tooMuch || undefined}>
          <FieldLabel htmlFor="move-amount">Valor</FieldLabel>
          <InputGroup className="h-10">
            <InputGroupAddon>R$</InputGroupAddon>
            <InputGroupInput
              id="move-amount"
              autoFocus
              inputMode="decimal"
              placeholder="0,00"
              value={amount}
              aria-invalid={tooMuch}
              onChange={(e) => setAmount(e.target.value)}
              className="tabular text-base"
            />
          </InputGroup>
          {tooMuch && (
            <FieldDescription className="text-destructive">
              Valor maior que o dinheiro disponível em caixa.
            </FieldDescription>
          )}
        </Field>
        <Field>
          <FieldLabel>Motivo</FieldLabel>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {REASONS[type].map((r) => (
                <SelectItem key={r} value={r}>
                  {r}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field>
          <FieldLabel htmlFor="move-details">Descrição (opcional)</FieldLabel>
          <Textarea id="move-details" rows={2} value={details} onChange={(e) => setDetails(e.target.value)} />
        </Field>
      </FieldGroup>
      <DialogFooter>
        <Button type="submit" variant={isWithdrawal ? "destructive" : "default"} disabled={!valid || mutation.isPending}>
          {mutation.isPending && <Spinner />}
          {isWithdrawal ? "Registrar sangria" : "Registrar suprimento"}
        </Button>
      </DialogFooter>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Fechamento
// ---------------------------------------------------------------------------

export function DifferenceValue({ value, className }: { value: number | null; className?: string }) {
  if (value === null) return <span className={cn("text-muted-foreground", className)}>—</span>;
  const rounded = round2(value);
  return (
    <span
      className={cn(
        "tabular font-medium",
        rounded === 0 ? "text-success" : rounded > 0 ? "text-warning" : "text-destructive",
        className,
      )}
    >
      {rounded > 0 ? "+" : ""}
      {formatCurrency(rounded)}
    </span>
  );
}

export function CloseCashDialog({
  open,
  onOpenChange,
  summary,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  summary: CashSummary;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        {open && <CloseCashForm summary={summary} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function CloseCashForm({ summary, onDone }: { summary: CashSummary; onDone: () => void }) {
  const queryClient = useQueryClient();
  const [counted, setCounted] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      RECONCILED_METHODS.map((m) => [m, m === "Dinheiro" ? "" : moneyInput(summary.expectedByMethod[m])]),
    ),
  );
  const [notes, setNotes] = useState("");

  const countedValues: CountedByMethod = Object.fromEntries(
    RECONCILED_METHODS.map((m) => {
      const v = parseMoney(counted[m] ?? "");
      return [m, Number.isNaN(v) ? 0 : v];
    }),
  );
  const totalExpected = round2(RECONCILED_METHODS.reduce((s, m) => s + summary.expectedByMethod[m], 0));
  const totalCounted = round2(RECONCILED_METHODS.reduce((s, m) => s + (countedValues[m] ?? 0), 0));
  const difference = round2(totalCounted - totalExpected);
  const cashMissing = !counted.Dinheiro?.trim();
  const needsNote = difference !== 0 && !notes.trim();

  const mutation = useMutation({
    mutationFn: () => closeCashSession({ id: summary.session._id, counted: countedValues, notes }),
    onSuccess: (result) => {
      toast.success(`Caixa #${result.session.number} fechado`, {
        description:
          result.difference === 0
            ? "Sem diferenças na conferência."
            : `Diferença de ${formatCurrency(result.difference)} registrada.`,
      });
      invalidateCash(queryClient);
      onDone();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!cashMissing && !needsNote) mutation.mutate();
      }}
    >
      <DialogHeader>
        <DialogTitle>Fechar caixa #{summary.session.number}</DialogTitle>
        <DialogDescription>
          Aberto em {formatDateTime(summary.session.openedAt)} por {summary.session.operatorName}. Conte a gaveta e
          confira os comprovantes de cada meio.
        </DialogDescription>
      </DialogHeader>

      <div className="grid grid-cols-2 gap-3 rounded-lg bg-muted/50 p-3 text-sm sm:grid-cols-4">
        <Mini label="Fundo inicial" value={formatCurrency(summary.session.openingAmount)} />
        <Mini label="Vendas" value={`${formatCurrency(summary.totalSales)} (${summary.salesCount})`} />
        <Mini label="Suprimentos" value={`+${formatCurrency(summary.suprimentos)}`} />
        <Mini label="Sangrias" value={`−${formatCurrency(summary.retiradas)}`} />
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Meio</TableHead>
              <TableHead className="text-right">Esperado</TableHead>
              <TableHead className="w-40 text-right">Contado</TableHead>
              <TableHead className="text-right">Diferença</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {RECONCILED_METHODS.map((m, i) => {
              const Icon = PAYMENT_ICON[m];
              const raw = counted[m] ?? "";
              const diff = raw.trim() ? round2((countedValues[m] ?? 0) - summary.expectedByMethod[m]) : null;
              return (
                <TableRow key={m}>
                  <TableCell>
                    <span className="flex items-center gap-2">
                      <Icon className="size-4 text-muted-foreground" />
                      {m}
                    </span>
                  </TableCell>
                  <TableCell className="tabular text-right">{formatCurrency(summary.expectedByMethod[m])}</TableCell>
                  <TableCell className="py-1.5">
                    <InputGroup className="h-8">
                      <InputGroupAddon>R$</InputGroupAddon>
                      <InputGroupInput
                        autoFocus={i === 0}
                        inputMode="decimal"
                        placeholder="0,00"
                        aria-label={`Contado em ${m}`}
                        value={raw}
                        onChange={(e) => setCounted((prev) => ({ ...prev, [m]: e.target.value }))}
                        className="tabular text-right"
                      />
                    </InputGroup>
                  </TableCell>
                  <TableCell className="text-right">
                    <DifferenceValue value={diff} />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell className="font-medium">Total</TableCell>
              <TableCell className="tabular text-right font-medium">{formatCurrency(totalExpected)}</TableCell>
              <TableCell className="tabular text-right font-medium">{formatCurrency(totalCounted)}</TableCell>
              <TableCell className="text-right">
                <DifferenceValue value={cashMissing ? null : difference} />
              </TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      </div>
      {summary.byMethod["Crediário"] > 0 && (
        <p className="text-xs text-muted-foreground">
          Vendas no crediário ({formatCurrency(summary.byMethod["Crediário"])}) não entram na conferência — viram
          contas a receber.
        </p>
      )}

      <Separator />
      <Field data-invalid={needsNote && !cashMissing ? true : undefined}>
        <FieldLabel htmlFor="close-notes">Observação {difference !== 0 && !cashMissing && "(obrigatória com diferença)"}</FieldLabel>
        <Textarea
          id="close-notes"
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Justifique eventuais diferenças"
        />
      </Field>

      <DialogFooter>
        <Button type="submit" disabled={cashMissing || needsNote || mutation.isPending}>
          {mutation.isPending ? <Spinner /> : <LockKeyhole />}
          Confirmar fechamento
        </Button>
      </DialogFooter>
    </form>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="tabular truncate font-medium">{value}</p>
    </div>
  );
}
