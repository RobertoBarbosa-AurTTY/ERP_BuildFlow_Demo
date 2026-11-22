"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useMutation } from "@tanstack/react-query";
import {
  Boxes,
  FileUp,
  PackagePlus,
  PackageSearch,
  Receipt,
  ScanBarcode,
  Search,
  Trash2,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/page-header";
import { EmptyState, ErrorState } from "@/components/query-state";
import { FormField } from "@/components/inventory/form-field";
import { ProductFormDialog } from "@/components/inventory/product-form-dialog";
import { ProductPicker } from "@/components/inventory/product-picker";
import { useInvalidateInventory, useProducts, useReceivings, useStockMovements } from "@/components/inventory/queries";
import { MOVEMENT_LABEL, MovementTypeBadge } from "@/components/inventory/stock-badges";
import { TablePagination } from "@/components/inventory/table-tools";
import { decimalInput, parseDecimal } from "@/components/inventory/utils";
import { round2 } from "@/lib/domain/calc";
import type { Product, StockMovementType } from "@/lib/domain/types";
import { errorMessage } from "@/lib/errors";
import { formatCurrency, formatDateTime, formatNumber, toDateInput } from "@/lib/format";
import { registerReceiving } from "@/lib/services/products";
import { cn } from "@/lib/utils";

interface Line {
  key: string;
  product: Product;
  quantity: string;
  unitCost: string;
}

type HeaderErrors = { document?: string; supplier?: string; items?: string };
type LineErrors = Record<string, { quantity?: string; unitCost?: string }>;

export function ReceivingView() {
  return (
    <>
      <PageHeader
        title="Entradas de mercadoria"
        description="Registre notas de compra: o saldo aumenta e o custo dos produtos é atualizado."
        actions={
          <>
            <Button variant="outline" asChild>
              <Link href="/stock">
                <Boxes /> Estoque
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/import">
                <FileUp /> Importar XML da NF-e
              </Link>
            </Button>
          </>
        }
      />
      <ReceivingForm />
      <Tabs defaultValue="notes" className="gap-4">
        <TabsList>
          <TabsTrigger value="notes">Notas recebidas</TabsTrigger>
          <TabsTrigger value="movements">Movimentações</TabsTrigger>
        </TabsList>
        <TabsContent value="notes">
          <ReceivingsTable />
        </TabsContent>
        <TabsContent value="movements">
          <MovementsTable />
        </TabsContent>
      </Tabs>
    </>
  );
}

function ReceivingForm() {
  const { data: products = [] } = useProducts();
  const invalidate = useInvalidateInventory();
  const [document, setDocument] = useState("");
  const [supplier, setSupplier] = useState("");
  const [issueDate, setIssueDate] = useState(() => toDateInput());
  const [updateCost, setUpdateCost] = useState(true);
  const [lines, setLines] = useState<Line[]>([]);
  const [scan, setScan] = useState("");
  const [errors, setErrors] = useState<HeaderErrors>({});
  const [lineErrors, setLineErrors] = useState<LineErrors>({});
  const [creating, setCreating] = useState(false);

  const suppliers = useMemo(
    () => [...new Set(products.map((p) => p.supplier).filter(Boolean) as string[])].sort((a, b) => a.localeCompare(b, "pt-BR")),
    [products],
  );

  const addProduct = (product: Product) => {
    setErrors((e) => ({ ...e, items: undefined }));
    setLines((current) => {
      const existing = current.find((l) => l.product._id === product._id);
      if (existing) {
        toast.info("Produto já está na nota", { description: "Quantidade somada em +1." });
        return current.map((l) =>
          l.key === existing.key ? { ...l, quantity: decimalInput((parseDecimal(l.quantity) || 0) + 1) } : l,
        );
      }
      return [...current, { key: product._id, product, quantity: "1", unitCost: decimalInput(product.costPrice) }];
    });
    if (!supplier && product.supplier) setSupplier(product.supplier);
  };

  const onScan = (event: React.FormEvent) => {
    event.preventDefault();
    const code = scan.trim().toLowerCase();
    if (!code) return;
    const product = products.find((p) => p.sku.toLowerCase() === code || p.barcode === code);
    if (product) {
      addProduct(product);
      setScan("");
    } else {
      toast.error("Produto não encontrado", { description: `Nenhum produto com SKU ou código ${scan}.` });
    }
  };

  const updateLine = (key: string, patch: Partial<Line>) => {
    setLines((current) => current.map((l) => (l.key === key ? { ...l, ...patch } : l)));
    setLineErrors((e) => ({ ...e, [key]: {} }));
  };

  const totals = lines.reduce(
    (acc, l) => {
      const q = parseDecimal(l.quantity) || 0;
      const c = parseDecimal(l.unitCost) || 0;
      return { units: acc.units + q, value: acc.value + q * c };
    },
    { units: 0, value: 0 },
  );

  const reset = () => {
    setDocument("");
    setSupplier("");
    setIssueDate(toDateInput());
    setLines([]);
    setErrors({});
    setLineErrors({});
  };

  const mutation = useMutation({
    mutationFn: () =>
      registerReceiving({
        document,
        supplier,
        issueDate,
        updateCost,
        items: lines.map((l) => ({
          productId: l.product._id,
          quantity: parseDecimal(l.quantity),
          unitCost: parseDecimal(l.unitCost),
        })),
      }),
    onSuccess: async (result) => {
      await invalidate();
      toast.success(`Entrada ${result.reference} registrada`, {
        description: `${formatNumber(result.movements.length)} itens · ${formatCurrency(result.total)}`,
      });
      reset();
    },
    onError: (error) => toast.error("Não foi possível registrar a entrada", { description: errorMessage(error) }),
  });

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const found: HeaderErrors = {};
    if (!document.trim()) found.document = "Informe o número da nota";
    if (!supplier.trim()) found.supplier = "Informe o fornecedor";
    if (!lines.length) found.items = "Adicione ao menos um produto";
    const foundLines: LineErrors = {};
    for (const l of lines) {
      const q = parseDecimal(l.quantity);
      const c = parseDecimal(l.unitCost);
      const e: LineErrors[string] = {};
      if (!(q > 0)) e.quantity = "Qtd. inválida";
      if (Number.isNaN(c) || c < 0) e.unitCost = "Custo inválido";
      if (e.quantity || e.unitCost) foundLines[l.key] = e;
    }
    setErrors(found);
    setLineErrors(foundLines);
    if (Object.keys(found).length || Object.keys(foundLines).length) {
      toast.error("Revise os campos destacados");
      return;
    }
    mutation.mutate();
  };

  return (
    <>
    <form onSubmit={submit} noValidate className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
      <Card className="min-w-0">
        <CardHeader>
          <CardTitle>Itens da nota</CardTitle>
          <CardDescription>Leia o código de barras, busque pelo nome ou cadastre um produto novo.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-2 md:flex-row">
            <InputGroup className="md:max-w-64">
              <InputGroupAddon>
                <ScanBarcode />
              </InputGroupAddon>
              <InputGroupInput
                placeholder="Código de barras ou SKU + Enter"
                value={scan}
                onChange={(e) => setScan(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") onScan(e);
                }}
                className="font-mono"
                aria-label="Ler código"
              />
            </InputGroup>
            <ProductPicker
              onSelect={addProduct}
              resetOnSelect
              placeholder="Buscar produto para adicionar…"
              className="md:max-w-sm"
            />
            <Button type="button" variant="outline" onClick={() => setCreating(true)}>
              <PackagePlus /> Cadastrar produto
            </Button>
          </div>

          {!lines.length ? (
            <div className={cn(errors.items && "[&>div]:border-destructive")}>
              <EmptyState
                icon={PackageSearch}
                title="Nenhum item adicionado"
                description={errors.items ?? "Os produtos da nota aparecem aqui com quantidade e custo."}
              />
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Produto</TableHead>
                    <TableHead className="text-right">Saldo</TableHead>
                    <TableHead className="w-28">Qtd.</TableHead>
                    <TableHead className="w-36">Custo unit.</TableHead>
                    <TableHead className="text-right">Subtotal</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lines.map((l) => {
                    const q = parseDecimal(l.quantity) || 0;
                    const c = parseDecimal(l.unitCost);
                    const diff = !Number.isNaN(c) && l.product.costPrice > 0 ? c / l.product.costPrice - 1 : 0;
                    const err = lineErrors[l.key] ?? {};
                    return (
                      <TableRow key={l.key} className="align-top">
                        <TableCell className="max-w-64">
                          <p className="truncate font-medium">{l.product.name}</p>
                          <p className="font-mono text-xs text-muted-foreground">{l.product.sku}</p>
                        </TableCell>
                        <TableCell className="tabular text-right text-muted-foreground">
                          {formatNumber(l.product.quantity)} {l.product.unit}
                        </TableCell>
                        <TableCell>
                          <Input
                            value={l.quantity}
                            onChange={(e) => updateLine(l.key, { quantity: e.target.value })}
                            aria-invalid={!!err.quantity}
                            aria-label={`Quantidade de ${l.product.name}`}
                            inputMode="decimal"
                            className="tabular h-8"
                          />
                          {err.quantity && <p className="mt-1 text-xs text-destructive">{err.quantity}</p>}
                        </TableCell>
                        <TableCell>
                          <Input
                            value={l.unitCost}
                            onChange={(e) => updateLine(l.key, { unitCost: e.target.value })}
                            aria-invalid={!!err.unitCost}
                            aria-label={`Custo de ${l.product.name}`}
                            inputMode="decimal"
                            className="tabular h-8"
                          />
                          {err.unitCost ? (
                            <p className="mt-1 text-xs text-destructive">{err.unitCost}</p>
                          ) : Math.abs(diff) >= 0.005 ? (
                            <p
                              className={cn(
                                "mt-1 flex items-center gap-1 text-xs",
                                diff > 0 ? "text-warning" : "text-success",
                              )}
                            >
                              {diff > 0 ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
                              {diff > 0 ? "+" : ""}
                              {(diff * 100).toFixed(1).replace(".", ",")}% vs {formatCurrency(l.product.costPrice)}
                            </p>
                          ) : null}
                        </TableCell>
                        <TableCell className="tabular text-right font-medium">
                          {formatCurrency(q * (Number.isNaN(c) ? 0 : c))}
                        </TableCell>
                        <TableCell>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`Remover ${l.product.name}`}
                            onClick={() => setLines((current) => current.filter((x) => x.key !== l.key))}
                          >
                            <Trash2 />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell colSpan={2}>
                      {formatNumber(lines.length)} {lines.length === 1 ? "item" : "itens"}
                    </TableCell>
                    <TableCell className="tabular">{formatNumber(round2(totals.units))}</TableCell>
                    <TableCell />
                    <TableCell className="tabular text-right">{formatCurrency(totals.value)}</TableCell>
                    <TableCell />
                  </TableRow>
                </TableFooter>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="h-fit">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Receipt className="size-4 text-muted-foreground" /> Dados da nota
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <FormField label="Número da nota" htmlFor="rc-doc" required error={errors.document}>
            <Input
              id="rc-doc"
              value={document}
              onChange={(e) => {
                setDocument(e.target.value);
                setErrors((x) => ({ ...x, document: undefined }));
              }}
              aria-invalid={!!errors.document}
              placeholder="Ex.: 45871"
              className="font-mono"
            />
          </FormField>
          <FormField label="Fornecedor" htmlFor="rc-supplier" required error={errors.supplier}>
            <Input
              id="rc-supplier"
              list="rc-suppliers"
              value={supplier}
              onChange={(e) => {
                setSupplier(e.target.value);
                setErrors((x) => ({ ...x, supplier: undefined }));
              }}
              aria-invalid={!!errors.supplier}
              placeholder="Nome do fornecedor"
            />
            <datalist id="rc-suppliers">
              {suppliers.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </FormField>
          <FormField label="Data de emissão" htmlFor="rc-date">
            <Input id="rc-date" type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
          </FormField>
          <label className="flex cursor-pointer items-start justify-between gap-3 rounded-lg border p-3">
            <span>
              <span className="block text-sm font-medium">Atualizar custo</span>
              <span className="block text-xs text-muted-foreground">
                Grava o custo unitário da nota no cadastro dos produtos.
              </span>
            </span>
            <Switch checked={updateCost} onCheckedChange={setUpdateCost} />
          </label>
          <div className="space-y-1.5 rounded-lg bg-muted/50 p-3 text-sm">
            <div className="flex justify-between text-muted-foreground">
              <span>Itens</span>
              <span className="tabular">{formatNumber(lines.length)}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Unidades</span>
              <span className="tabular">{formatNumber(round2(totals.units))}</span>
            </div>
            <div className="flex justify-between pt-1 text-base font-semibold">
              <span>Total</span>
              <span className="tabular">{formatCurrency(totals.value)}</span>
            </div>
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={reset} disabled={mutation.isPending} className="flex-1">
              Limpar
            </Button>
            <Button type="submit" disabled={mutation.isPending} className="flex-1">
              {mutation.isPending && <Spinner />}
              Registrar entrada
            </Button>
          </div>
        </CardContent>
      </Card>
    </form>

      <ProductFormDialog
        open={creating}
        onOpenChange={setCreating}
        defaults={{ supplier: supplier || undefined, quantity: 0 }}
        onSaved={addProduct}
      />
    </>
  );
}

function ReceivingsTable() {
  const { data, isLoading, error, refetch } = useReceivings();
  if (error) return <ErrorState error={error} onRetry={() => refetch()} />;
  return (
    <Card className="py-0">
      {isLoading ? (
        <div className="space-y-2 p-4">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : !data?.length ? (
        <div className="p-4">
          <EmptyState title="Nenhuma nota recebida" description="As entradas registradas aparecerão aqui." />
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="pl-4">Nota</TableHead>
              <TableHead>Fornecedor</TableHead>
              <TableHead className="hidden md:table-cell">Data</TableHead>
              <TableHead className="text-right">Itens</TableHead>
              <TableHead className="text-right">Unidades</TableHead>
              <TableHead className="hidden pr-4 lg:table-cell">Responsável</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((r) => (
              <TableRow key={r.reference}>
                <TableCell className="pl-4 font-mono font-medium">{r.reference}</TableCell>
                <TableCell>{r.supplier}</TableCell>
                <TableCell className="hidden text-muted-foreground md:table-cell">{formatDateTime(r.timestamp)}</TableCell>
                <TableCell className="tabular text-right">{formatNumber(r.items)}</TableCell>
                <TableCell className="tabular text-right">{formatNumber(r.units)}</TableCell>
                <TableCell className="hidden pr-4 text-muted-foreground lg:table-cell">{r.userName ?? "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Card>
  );
}

const MOVEMENTS_PAGE = 15;

function MovementsTable() {
  const [type, setType] = useState<StockMovementType | "all">("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const { data = [], isLoading, error, refetch } = useStockMovements({ type, search });
  const pages = Math.max(1, Math.ceil(data.length / MOVEMENTS_PAGE));
  const current = Math.min(page, pages);
  const visible = data.slice((current - 1) * MOVEMENTS_PAGE, current * MOVEMENTS_PAGE);

  return (
    <Card className="gap-0 py-0">
      <div className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center">
        <InputGroup className="sm:max-w-xs">
          <InputGroupAddon>
            <Search />
          </InputGroupAddon>
          <InputGroupInput
            placeholder="Produto, SKU ou nota"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </InputGroup>
        <div className="flex items-center gap-2">
          <Select
            value={type}
            onValueChange={(v) => {
              setType(v as StockMovementType | "all");
              setPage(1);
            }}
          >
            <SelectTrigger className="w-40" aria-label="Tipo de movimentação">
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper">
              <SelectItem value="all">Todos os tipos</SelectItem>
              {(Object.keys(MOVEMENT_LABEL) as StockMovementType[]).map((t) => (
                <SelectItem key={t} value={t}>
                  {MOVEMENT_LABEL[t]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      {error ? (
        <div className="p-4">
          <ErrorState error={error} onRetry={() => refetch()} />
        </div>
      ) : isLoading ? (
        <div className="space-y-2 p-4">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : !data.length ? (
        <div className="p-4">
          <EmptyState title="Nenhuma movimentação" description="Nada corresponde aos filtros." />
        </div>
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-4">Data</TableHead>
                <TableHead>Produto</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead className="text-right">Qtd.</TableHead>
                <TableHead className="hidden text-right md:table-cell">Saldo</TableHead>
                <TableHead className="hidden lg:table-cell">Referência / motivo</TableHead>
                <TableHead className="hidden pr-4 xl:table-cell">Usuário</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((m) => (
                <TableRow key={m._id}>
                  <TableCell className="pl-4 whitespace-nowrap text-muted-foreground">{formatDateTime(m.timestamp)}</TableCell>
                  <TableCell className="max-w-64">
                    <p className="truncate font-medium">{m.productName}</p>
                    <p className="font-mono text-xs text-muted-foreground">{m.sku}</p>
                  </TableCell>
                  <TableCell>
                    <MovementTypeBadge type={m.type} />
                  </TableCell>
                  <TableCell
                    className={cn("tabular text-right font-medium", m.quantity >= 0 ? "text-success" : "text-destructive")}
                  >
                    {m.quantity > 0 ? "+" : ""}
                    {formatNumber(m.quantity)}
                  </TableCell>
                  <TableCell className="tabular hidden text-right text-muted-foreground md:table-cell">
                    {formatNumber(m.previousQuantity)} → {formatNumber(m.newQuantity)}
                  </TableCell>
                  <TableCell className="hidden max-w-64 truncate text-muted-foreground lg:table-cell">
                    {[m.reference, m.reason].filter(Boolean).join(" · ") || "—"}
                  </TableCell>
                  <TableCell className="hidden pr-4 text-muted-foreground xl:table-cell">{m.userName ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="border-t p-3">
            <TablePagination page={current} pageSize={MOVEMENTS_PAGE} total={data.length} onPageChange={setPage} />
          </div>
        </>
      )}
    </Card>
  );
}
