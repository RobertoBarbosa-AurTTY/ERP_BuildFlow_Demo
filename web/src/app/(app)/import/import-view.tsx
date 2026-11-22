"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useMutation } from "@tanstack/react-query";
import {
  AlertTriangle,
  Boxes,
  CheckCircle2,
  FileCode2,
  FileDown,
  FileUp,
  Link2,
  PackagePlus,
  Sparkles,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { FormField } from "@/components/inventory/form-field";
import { parseNfeXml, SAMPLE_NFE_XML, type NfeDocument, type NfeItem } from "@/components/inventory/nfe";
import { ProductPicker } from "@/components/inventory/product-picker";
import { useCategories, useInvalidateInventory, useProducts, useReceivings } from "@/components/inventory/queries";
import { decimalInput, parseDecimal, toUnit } from "@/components/inventory/utils";
import { round2 } from "@/lib/domain/calc";
import type { Product } from "@/lib/domain/types";
import { errorMessage } from "@/lib/errors";
import { formatCurrency, formatDate, formatDocument, formatNumber } from "@/lib/format";
import { registerReceiving, type ReceivingResult } from "@/lib/services/products";
import { cn } from "@/lib/utils";

type Action = "link" | "new" | "ignore";

interface Row {
  item: NfeItem;
  action: Action;
  productId?: string;
  matchedBy?: "ean" | "sku";
  sku: string;
  name: string;
  category: string;
  /** Preço de venda digitado; vazio = calculado pela margem. */
  price: string;
}

const CATEGORY_RULES: [RegExp, string][] = [
  [/TUBO|JOELHO|REGISTRO|CONEX|LUVA|CAIXA SIFON|SIFAO|ADESIVO.*PVC|TORNEIRA|VALVULA|CAIXA D.?AGUA/, "Hidráulica"],
  [/FIO|CABO|DISJUNTOR|TOMADA|INTERRUPTOR|LAMPADA|LED/, "Elétrica"],
  [/TINTA|MASSA CORRIDA|VERNIZ|ESMALTE|ROLO|PINCEL|SELADOR/, "Tintas"],
  [/CIMENTO|ARGAMASSA|\bCAL\b|REJUNTE/, "Materiais"],
  [/AREIA|BRITA|PEDRISCO/, "Agregados"],
  [/TIJOLO|BLOCO|TELHA/, "Alvenaria"],
  [/PREGO|PARAFUSO|VERGALH|ARAME|BUCHA/, "Ferragens"],
  [/PISO|PORCELANATO|REVEST|AZULEJO/, "Revestimentos"],
  [/FURADEIRA|TRENA|MARTELO|SERRA|CHAVE|ALICATE/, "Ferramentas"],
];

function stripAccents(value: string) {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();
}

function inferCategory(description: string, fallback: string) {
  const name = stripAccents(description);
  return CATEGORY_RULES.find(([re]) => re.test(name))?.[1] ?? fallback;
}

function titleCase(value: string) {
  const keepUpper = /^(PVC|LED|CP|AC|[0-9].*|[A-Z]{1,2}\d.*|\d+X\d+.*)$/;
  return value
    .toLowerCase()
    .split(" ")
    .map((w, i) => {
      if (keepUpper.test(w.toUpperCase())) return w.toUpperCase();
      if (i > 0 && ["de", "da", "do", "para", "com", "e"].includes(w)) return w;
      return w.charAt(0).toUpperCase() + w.slice(1);
    })
    .join(" ");
}

function buildRows(doc: NfeDocument, products: Product[], fallbackCategory: string): Row[] {
  return doc.items.map((item) => {
    const byEan = item.ean ? products.find((p) => p.barcode === item.ean) : undefined;
    const bySku = byEan ? undefined : products.find((p) => p.sku.toLowerCase() === item.code.toLowerCase());
    const match = byEan ?? bySku;
    return {
      item,
      action: match ? "link" : "new",
      productId: match?._id,
      matchedBy: byEan ? "ean" : bySku ? "sku" : undefined,
      sku: item.code.toUpperCase(),
      name: titleCase(item.description),
      category: inferCategory(item.description, fallbackCategory),
      price: "",
    };
  });
}

export function ImportView() {
  const { data: products = [], isLoading: loadingProducts } = useProducts();
  const { data: categories = [] } = useCategories();
  const { data: receivings = [] } = useReceivings();
  const invalidate = useInvalidateInventory();
  const fileInput = useRef<HTMLInputElement>(null);

  const [doc, setDoc] = useState<NfeDocument | null>(null);
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [marginPct, setMarginPct] = useState("30");
  const [updateCost, setUpdateCost] = useState(true);
  const [dragging, setDragging] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [rowErrors, setRowErrors] = useState<Record<number, string>>({});
  const [discardOpen, setDiscardOpen] = useState(false);
  const [result, setResult] = useState<ReceivingResult | null>(null);

  const fallbackCategory = categories.some((c) => c.name === "Materiais") ? "Materiais" : (categories[0]?.name ?? "Geral");
  const marginValue = parseDecimal(marginPct);

  const load = (xml: string, name: string) => {
    try {
      const parsed = parseNfeXml(xml);
      setDoc(parsed);
      setFileName(name);
      setRows(buildRows(parsed, products, fallbackCategory));
      setParseError(null);
      setRowErrors({});
      setResult(null);
      toast.success("NF-e carregada", { description: `${parsed.items.length} itens de ${parsed.supplier.name}` });
    } catch (error) {
      setParseError(errorMessage(error));
    }
  };

  const readFile = async (file: File | undefined) => {
    if (!file) return;
    if (!/\.xml$/i.test(file.name) && file.type !== "text/xml" && file.type !== "application/xml") {
      setParseError("Selecione um arquivo .xml de NF-e.");
      return;
    }
    load(await file.text(), file.name);
  };

  const updateRow = (index: number, patch: Partial<Row>) => {
    setRows((current) => current.map((r) => (r.item.index === index ? { ...r, ...patch } : r)));
    setRowErrors((e) => {
      const next = { ...e };
      delete next[index];
      return next;
    });
  };

  const priceFor = (row: Row) => {
    const typed = parseDecimal(row.price);
    if (row.price && !Number.isNaN(typed)) return typed;
    return round2(row.item.unitPrice * (1 + (Number.isNaN(marginValue) ? 0 : marginValue) / 100));
  };

  const counts = useMemo(
    () => ({
      link: rows.filter((r) => r.action === "link").length,
      new: rows.filter((r) => r.action === "new").length,
      ignore: rows.filter((r) => r.action === "ignore").length,
      total: rows.filter((r) => r.action !== "ignore").reduce((s, r) => s + r.item.total, 0),
    }),
    [rows],
  );

  const duplicate = doc ? receivings.some((r) => r.reference === `NF ${doc.number}`) : false;

  const mutation = useMutation({
    mutationFn: () => {
      const supplierName = doc!.supplier.tradeName || titleCase(doc!.supplier.name);
      return registerReceiving({
        document: doc!.number,
        supplier: supplierName,
        issueDate: doc!.issueDate,
        updateCost,
        items: rows
          .filter((r) => r.action !== "ignore")
          .map((r) =>
            r.action === "link"
              ? { productId: r.productId, quantity: r.item.quantity, unitCost: r.item.unitPrice }
              : {
                  quantity: r.item.quantity,
                  unitCost: r.item.unitPrice,
                  newProduct: {
                    name: r.name.trim(),
                    sku: r.sku.trim().toUpperCase(),
                    barcode: r.item.ean || undefined,
                    category: r.category,
                    brand: supplierName,
                    supplier: supplierName,
                    unit: toUnit(r.item.unit),
                    quantity: 0,
                    minStock: 0,
                    maxStock: 0,
                    price: priceFor(r),
                    costPrice: r.item.unitPrice,
                    perishable: false,
                    active: true,
                  },
                },
          ),
      });
    },
    onSuccess: async (res) => {
      await invalidate();
      setResult(res);
      toast.success(`Entrada ${res.reference} registrada`, {
        description: `${res.movements.length} itens · ${res.createdProducts} produtos novos`,
      });
    },
    onError: (error) => toast.error("Não foi possível confirmar a entrada", { description: errorMessage(error) }),
  });

  const confirm = () => {
    const errors: Record<number, string> = {};
    const skus = new Map<string, number>();
    for (const r of rows) {
      if (r.action === "link" && !r.productId) errors[r.item.index] = "Selecione o produto";
      if (r.action === "new") {
        const sku = r.sku.trim().toUpperCase();
        if (!r.name.trim()) errors[r.item.index] = "Informe o nome";
        else if (!sku) errors[r.item.index] = "Informe o SKU";
        else if (products.some((p) => p.sku.toUpperCase() === sku) || skus.has(sku))
          errors[r.item.index] = `SKU ${sku} já existe`;
        else if (!(priceFor(r) > 0)) errors[r.item.index] = "Preço de venda inválido";
        skus.set(sku, r.item.index);
      }
    }
    setRowErrors(errors);
    if (Object.keys(errors).length) {
      toast.error("Revise os itens destacados");
      return;
    }
    if (!counts.link && !counts.new) {
      toast.error("Todos os itens estão marcados para ignorar");
      return;
    }
    mutation.mutate();
  };

  const reset = () => {
    setDoc(null);
    setRows([]);
    setFileName("");
    setResult(null);
    setRowErrors({});
    if (fileInput.current) fileInput.current.value = "";
  };

  const header = (
    <PageHeader
      title="Importar NF-e"
      description="Leia o XML da nota do fornecedor, confira os itens e dê entrada no estoque."
      actions={
        <>
          <Button variant="outline" asChild>
            <Link href="/receiving">
              <FileDown /> Entrada manual
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/stock">
              <Boxes /> Estoque
            </Link>
          </Button>
        </>
      }
    />
  );

  if (result && doc) {
    return (
      <>
        {header}
        <Card className="mx-auto w-full max-w-xl text-center">
          <CardContent className="flex flex-col items-center gap-4 py-6">
            <div className="flex size-12 items-center justify-center rounded-full bg-success/12 text-success">
              <CheckCircle2 className="size-6" />
            </div>
            <div className="space-y-1">
              <h2 className="text-lg font-semibold">Entrada {result.reference} registrada</h2>
              <p className="text-sm text-muted-foreground">
                {formatNumber(result.movements.length)} itens lançados · {formatNumber(result.createdProducts)} produtos
                cadastrados · {formatCurrency(result.total)}
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              <Button variant="outline" onClick={reset}>
                <FileUp /> Importar outra nota
              </Button>
              <Button variant="outline" asChild>
                <Link href="/price-tag">Imprimir etiquetas</Link>
              </Button>
              <Button asChild>
                <Link href="/stock">Ver estoque</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </>
    );
  }

  if (!doc) {
    return (
      <>
        {header}
        <Card>
          <CardContent>
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                void readFile(e.dataTransfer.files[0]);
              }}
              className={cn(
                "flex flex-col items-center gap-4 rounded-xl border-2 border-dashed px-6 py-12 text-center transition-colors",
                dragging ? "border-primary bg-primary/5" : "border-border",
              )}
            >
              <div className="flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <FileCode2 className="size-6" />
              </div>
              <div className="space-y-1">
                <p className="font-medium">Arraste o XML da NF-e aqui</p>
                <p className="text-sm text-muted-foreground">
                  O arquivo é lido no navegador. Os itens são vinculados aos produtos pelo código de barras (EAN) ou SKU.
                </p>
              </div>
              <div className="flex flex-wrap justify-center gap-2">
                <Button onClick={() => fileInput.current?.click()} disabled={loadingProducts}>
                  <Upload /> Selecionar arquivo
                </Button>
                <Button
                  variant="outline"
                  onClick={() => load(SAMPLE_NFE_XML, "nfe-exemplo-58723.xml")}
                  disabled={loadingProducts}
                >
                  <Sparkles /> Carregar XML de exemplo
                </Button>
              </div>
              <input
                ref={fileInput}
                type="file"
                accept=".xml,text/xml,application/xml"
                className="hidden"
                onChange={(e) => void readFile(e.target.files?.[0])}
              />
            </div>
            {parseError && (
              <Alert variant="destructive" className="mt-4">
                <AlertTriangle />
                <AlertTitle>Não foi possível ler o arquivo</AlertTitle>
                <AlertDescription>{parseError}</AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      </>
    );
  }

  return (
    <>
      {header}

      {duplicate && (
        <Alert>
          <AlertTriangle />
          <AlertTitle>Nota já lançada</AlertTitle>
          <AlertDescription>
            Já existe uma entrada com a referência NF {doc.number}. Confirme apenas se for um lançamento complementar.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <Card>
          <CardHeader>
            <CardTitle className="flex flex-wrap items-center gap-2">
              NF-e {doc.number}
              {doc.series && <span className="text-sm font-normal text-muted-foreground">série {doc.series}</span>}
            </CardTitle>
            <CardDescription className="font-mono text-xs">{fileName}</CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
              <div className="col-span-2">
                <dt className="text-xs text-muted-foreground">Fornecedor (emitente)</dt>
                <dd className="font-medium">{doc.supplier.tradeName ?? doc.supplier.name}</dd>
                <dd className="text-xs text-muted-foreground">
                  {doc.supplier.name}
                  {doc.supplier.cnpj ? ` · ${formatDocument(doc.supplier.cnpj)}` : ""}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Emissão</dt>
                <dd className="font-medium">{formatDate(doc.issueDate)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Valor da nota</dt>
                <dd className="tabular font-medium">{formatCurrency(doc.totalValue)}</dd>
              </div>
            </dl>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-4">
            <FormField label="Margem para produtos novos (%)" htmlFor="imp-margin" description="Define o preço de venda sugerido.">
              <Input
                id="imp-margin"
                value={marginPct}
                onChange={(e) => setMarginPct(e.target.value)}
                inputMode="decimal"
                className="tabular"
              />
            </FormField>
            <label className="flex cursor-pointer items-center justify-between gap-3">
              <span className="text-sm">Atualizar custo dos produtos vinculados</span>
              <Switch checked={updateCost} onCheckedChange={setUpdateCost} />
            </label>
          </CardContent>
        </Card>
      </div>

      <Card className="gap-0 py-0">
        <div className="flex flex-wrap items-center gap-2 border-b p-4">
          <h2 className="mr-auto font-medium">Itens da nota</h2>
          <StatusBadge tone="info">
            <Link2 className="size-3" /> {counts.link} vinculados
          </StatusBadge>
          <StatusBadge tone="success">
            <PackagePlus className="size-3" /> {counts.new} novos
          </StatusBadge>
          {counts.ignore > 0 && <StatusBadge>{counts.ignore} ignorados</StatusBadge>}
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-10 pl-4">#</TableHead>
                <TableHead>Item da nota</TableHead>
                <TableHead className="text-right">Qtd. × custo</TableHead>
                <TableHead className="w-40">Ação</TableHead>
                <TableHead className="min-w-80 pr-4">Produto no estoque</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => {
                const err = rowErrors[row.item.index];
                const linked = row.productId ? products.find((p) => p._id === row.productId) : undefined;
                return (
                  <TableRow key={row.item.index} className={cn("align-top", row.action === "ignore" && "opacity-50")}>
                    <TableCell className="tabular pl-4 text-muted-foreground">{row.item.index}</TableCell>
                    <TableCell className="max-w-72">
                      <p className="truncate font-medium" title={row.item.description}>
                        {row.item.description}
                      </p>
                      <p className="font-mono text-xs text-muted-foreground">
                        {row.item.code}
                        {row.item.ean ? ` · EAN ${row.item.ean}` : " · sem GTIN"}
                      </p>
                    </TableCell>
                    <TableCell className="tabular text-right whitespace-nowrap">
                      <p className="font-medium">
                        {formatNumber(row.item.quantity)} {row.item.unit}
                      </p>
                      <p className="text-xs text-muted-foreground">× {formatCurrency(row.item.unitPrice)}</p>
                    </TableCell>
                    <TableCell>
                      <Select value={row.action} onValueChange={(v) => updateRow(row.item.index, { action: v as Action })}>
                        <SelectTrigger className="w-full" aria-label={`Ação do item ${row.item.index}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent position="popper">
                          <SelectItem value="link">Vincular</SelectItem>
                          <SelectItem value="new">Cadastrar novo</SelectItem>
                          <SelectItem value="ignore">Ignorar</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="pr-4">
                      {row.action === "link" && (
                        <div className="space-y-1">
                          <ProductPicker
                            value={row.productId}
                            onSelect={(p) => updateRow(row.item.index, { productId: p._id, matchedBy: undefined })}
                            invalid={!!err}
                          />
                          {linked && (
                            <p className="text-xs text-muted-foreground">
                              {row.matchedBy && (
                                <span className="text-success">Encontrado por {row.matchedBy === "ean" ? "EAN" : "SKU"} · </span>
                              )}
                              saldo {formatNumber(linked.quantity)} {linked.unit} · custo atual{" "}
                              {formatCurrency(linked.costPrice)}
                            </p>
                          )}
                        </div>
                      )}
                      {row.action === "new" && (
                        <div className="grid gap-2 sm:grid-cols-[1fr_7rem]">
                          <Input
                            value={row.name}
                            onChange={(e) => updateRow(row.item.index, { name: e.target.value })}
                            aria-label="Nome do novo produto"
                            aria-invalid={!!err && /nome/i.test(err)}
                            placeholder="Nome"
                          />
                          <Input
                            value={row.sku}
                            onChange={(e) => updateRow(row.item.index, { sku: e.target.value.toUpperCase() })}
                            aria-label="SKU do novo produto"
                            aria-invalid={!!err && /SKU/.test(err)}
                            className="font-mono"
                            placeholder="SKU"
                          />
                          <Select value={row.category} onValueChange={(v) => updateRow(row.item.index, { category: v })}>
                            <SelectTrigger className="w-full" aria-label="Categoria do novo produto">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent position="popper">
                              {categories.map((c) => (
                                <SelectItem key={c._id} value={c.name}>
                                  {c.name}
                                </SelectItem>
                              ))}
                              {!categories.some((c) => c.name === row.category) && (
                                <SelectItem value={row.category}>{row.category}</SelectItem>
                              )}
                            </SelectContent>
                          </Select>
                          <Input
                            value={row.price}
                            onChange={(e) => updateRow(row.item.index, { price: e.target.value })}
                            placeholder={decimalInput(priceFor({ ...row, price: "" }))}
                            aria-label="Preço de venda"
                            aria-invalid={!!err && /Preço/.test(err)}
                            inputMode="decimal"
                            className="tabular"
                          />
                        </div>
                      )}
                      {row.action === "ignore" && (
                        <p className="py-1.5 text-sm text-muted-foreground">Item não será lançado.</p>
                      )}
                      {err && <p className="mt-1 text-xs text-destructive">{err}</p>}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
        <div className="flex flex-col gap-3 border-t p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            Total a lançar: <span className="tabular font-semibold text-foreground">{formatCurrency(counts.total)}</span>
          </p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setDiscardOpen(true)} disabled={mutation.isPending}>
              Descartar
            </Button>
            <Button onClick={confirm} disabled={mutation.isPending}>
              {mutation.isPending && <Spinner />}
              Confirmar entrada
            </Button>
          </div>
        </div>
      </Card>

      <ConfirmDialog
        open={discardOpen}
        onOpenChange={setDiscardOpen}
        title="Descartar importação?"
        description="Os vínculos e ajustes feitos nesta conferência serão perdidos."
        confirmLabel="Descartar"
        destructive
        onConfirm={reset}
      />
    </>
  );
}
