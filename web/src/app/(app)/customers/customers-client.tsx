"use client";

import { useDeferredValue, useMemo, useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Eye, HandCoins, MoreHorizontal, Pencil, Plus, Search, ShoppingBag, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { PageHeader } from "@/components/page-header";
import { EmptyState, ErrorState } from "@/components/query-state";
import { StatCard } from "@/components/stat-card";
import { StatusBadge } from "@/components/status-badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { hasRole, useSession } from "@/lib/auth";
import type { Customer } from "@/lib/domain/types";
import { errorMessage } from "@/lib/errors";
import { formatCurrency, formatDate, formatDocument, formatPhone, initials } from "@/lib/format";
import {
  createCustomer,
  deleteCustomer,
  documentError,
  documentKind,
  getCustomerStats,
  listCustomers,
  updateCustomer,
  type CustomerInput,
} from "@/lib/services/customers";
import { CustomerDetailSheet } from "./customer-detail-sheet";
import { CustomerFormSheet } from "./customer-form-sheet";

export function CustomersClient() {
  const session = useSession();
  const canEdit = hasRole(session, ["Gerente"]);
  const canDelete = hasRole(session, []);
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search.trim());
  const list = useQuery({
    queryKey: ["customers", "list", deferredSearch],
    queryFn: () => listCustomers(deferredSearch),
    placeholderData: keepPreviousData,
  });
  const statsQuery = useQuery({ queryKey: ["customers", "stats"], queryFn: getCustomerStats });
  const stats = useMemo(() => statsQuery.data ?? {}, [statsQuery.data]);
  const customers = list.data ?? [];

  const [form, setForm] = useState<{ open: boolean; customer: Customer | null; key: number }>({
    open: false,
    customer: null,
    key: 0,
  });
  const [detail, setDetail] = useState<{ id: string | null; open: boolean }>({ id: null, open: false });
  const [toDelete, setToDelete] = useState<Customer | null>(null);

  const totals = useMemo(() => {
    const values = Object.values(stats);
    return {
      buyers: values.filter((s) => s.purchaseCount > 0).length,
      open: values.reduce((s, v) => s + v.openReceivables, 0),
      overdue: values.reduce((s, v) => s + v.overdueReceivables, 0),
    };
  }, [stats]);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["customers"] });

  const save = useMutation({
    mutationFn: (input: CustomerInput) =>
      form.customer ? updateCustomer(form.customer._id, input) : createCustomer(input),
    onSuccess: (customer) => {
      toast.success(form.customer ? "Cliente atualizado" : `${customer.name} cadastrado`);
      setForm((f) => ({ ...f, open: false }));
      invalidate();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const remove = useMutation({
    mutationFn: (customer: Customer) => deleteCustomer(customer._id).then(() => customer),
    onSuccess: (customer) => {
      toast.success(`${customer.name} excluído`);
      invalidate();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const openCreate = () => setForm((f) => ({ open: true, customer: null, key: f.key + 1 }));
  const openEdit = (customer: Customer) => setForm((f) => ({ open: true, customer, key: f.key + 1 }));
  const openDetail = (id: string) => setDetail({ id, open: true });

  return (
    <>
      <PageHeader
        title="Clientes"
        description="Cadastro de clientes, histórico de compras e crediário."
        actions={
          canEdit && (
            <Button onClick={openCreate}>
              <Plus />
              Novo cliente
            </Button>
          )
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label={deferredSearch ? "Clientes encontrados" : "Clientes cadastrados"}
          icon={Users}
          loading={list.isPending}
          value={customers.length}
          hint={`${totals.buyers} com compras registradas no total`}
        />
        <StatCard
          label="A receber de clientes"
          icon={HandCoins}
          loading={statsQuery.isPending}
          value={formatCurrency(totals.open)}
          hint="Contas pendentes e vencidas"
        />
        <StatCard
          label="Em atraso"
          icon={AlertTriangle}
          tone={totals.overdue > 0 ? "destructive" : "success"}
          loading={statsQuery.isPending}
          value={formatCurrency(totals.overdue)}
          hint={totals.overdue > 0 ? "Acompanhe em Contas a receber" : "Nenhum cliente inadimplente"}
        />
      </div>

      <Card className="gap-0 py-0">
        <CardContent className="border-b p-4">
          <InputGroup className="sm:max-w-sm">
            <InputGroupAddon>
              <Search />
            </InputGroupAddon>
            <InputGroupInput
              placeholder="Buscar por nome, CPF/CNPJ, e-mail ou telefone"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Buscar clientes"
            />
          </InputGroup>
        </CardContent>
        <CardContent className="p-0">
          {list.isPending ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 6 }, (_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : list.isError ? (
            <div className="p-4">
              <ErrorState error={list.error} onRetry={() => list.refetch()} />
            </div>
          ) : customers.length === 0 ? (
            <div className="p-4">
              <EmptyState
                icon={Users}
                title={deferredSearch ? "Nenhum cliente encontrado" : "Nenhum cliente cadastrado"}
                description={deferredSearch ? `Nada corresponde a "${deferredSearch}".` : "Cadastre clientes para vincular vendas e crediário."}
              />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Cliente</TableHead>
                  <TableHead>Documento</TableHead>
                  <TableHead>Telefone</TableHead>
                  <TableHead className="text-right">Total gasto</TableHead>
                  <TableHead>Última compra</TableHead>
                  <TableHead className="text-right">Em aberto</TableHead>
                  <TableHead className="w-0">
                    <span className="sr-only">Ações</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {customers.map((c) => {
                  const s = stats[c._id];
                  const kind = documentKind(c.cpfCnpj);
                  const docInvalid = Boolean(c.cpfCnpj && documentError(c.cpfCnpj));
                  return (
                    <TableRow key={c._id} className="cursor-pointer" onClick={() => openDetail(c._id)}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar className="size-8">
                            <AvatarFallback className="bg-primary/10 text-xs font-medium text-primary">
                              {initials(c.name)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <p className="truncate font-medium">{c.name}</p>
                            <p className="truncate text-xs text-muted-foreground">{c.email ?? "Sem e-mail"}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        {c.cpfCnpj ? (
                          <div className="flex items-center gap-2 whitespace-nowrap">
                            <span className="tabular">{formatDocument(c.cpfCnpj)}</span>
                            {kind && <StatusBadge tone={kind === "PJ" ? "info" : "neutral"}>{kind}</StatusBadge>}
                            {docInvalid && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <AlertTriangle className="size-3.5 text-warning" aria-label="Documento inválido" />
                                </TooltipTrigger>
                                <TooltipContent>Dígitos verificadores não conferem</TooltipContent>
                              </Tooltip>
                            )}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">{c.phone ? formatPhone(c.phone) : "—"}</TableCell>
                      <TableCell className="text-right">
                        <div className="tabular font-medium">{formatCurrency(s?.totalSpent ?? 0)}</div>
                        <div className="text-xs text-muted-foreground">
                          {s?.purchaseCount ?? 0} {s?.purchaseCount === 1 ? "compra" : "compras"}
                        </div>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {s?.lastPurchase ? formatDate(s.lastPurchase) : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        {s?.openReceivables ? (
                          <span className={s.overdueReceivables ? "tabular font-medium text-destructive" : "tabular"}>
                            {formatCurrency(s.openReceivables)}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon-sm" aria-label="Ações do cliente">
                              <MoreHorizontal />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onSelect={() => openDetail(c._id)}>
                              <Eye />
                              Ver detalhes
                            </DropdownMenuItem>
                            {canEdit && (
                              <DropdownMenuItem onSelect={() => openEdit(c)}>
                                <Pencil />
                                Editar
                              </DropdownMenuItem>
                            )}
                            {canDelete && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem variant="destructive" onSelect={() => setToDelete(c)}>
                                  <Trash2 />
                                  Excluir
                                </DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {!canEdit && session && (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <ShoppingBag className="size-3.5" />
          Seu perfil pode consultar clientes; cadastro e edição são feitos por gerentes e administradores.
        </p>
      )}

      <CustomerFormSheet
        key={form.key}
        open={form.open}
        onOpenChange={(open) => setForm((f) => ({ ...f, open }))}
        customer={form.customer}
        pending={save.isPending}
        onSubmit={(input) => save.mutate(input)}
      />

      <CustomerDetailSheet
        key={detail.id ?? "none"}
        customerId={detail.id}
        open={detail.open}
        onOpenChange={(open) => setDetail((d) => ({ ...d, open }))}
        canEdit={canEdit}
        onEdit={() => {
          const customer = customers.find((c) => c._id === detail.id);
          if (!customer) return;
          setDetail((d) => ({ ...d, open: false }));
          openEdit(customer);
        }}
      />

      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(open) => !open && setToDelete(null)}
        destructive
        title="Excluir cliente?"
        description={
          toDelete
            ? `${toDelete.name} será removido do cadastro. Vendas antigas mantêm o nome do cliente no histórico.`
            : undefined
        }
        confirmLabel="Excluir"
        onConfirm={() => toDelete && remove.mutate(toDelete)}
      />
    </>
  );
}
