"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Boxes, Info, Minus, Plus, Printer, Tag, Tags, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/page-header";
import { EmptyState, ErrorState } from "@/components/query-state";
import type { BarcodeFormat } from "@/components/inventory/barcode";
import { normalizeEan13 } from "@/components/inventory/barcode";
import { FormField } from "@/components/inventory/form-field";
import {
  barcodeValue,
  PRICE_LABEL_COLORS,
  PRICE_LABEL_SIZES,
  PriceLabel,
  type BarcodeSource,
  type PriceLabelColor,
  type PriceLabelOptions,
  type PriceLabelSize,
} from "@/components/inventory/labels";
import { PrintPortal } from "@/components/inventory/print-portal";
import { ProductPicker } from "@/components/inventory/product-picker";
import { useCategories, useLabelSettings, useProducts } from "@/components/inventory/queries";
import { formatCurrency, formatNumber } from "@/lib/format";

interface Selection {
  productId: string;
  copies: number;
}

const MAX_COPIES = 99;

export function PriceTagView() {
  const params = useSearchParams();
  const products = useProducts();
  const { data: categories = [] } = useCategories();
  const { data: settings } = useLabelSettings();

  const [selection, setSelection] = useState<Selection[]>(() => {
    const id = params.get("product");
    return id ? [{ productId: id, copies: 1 }] : [];
  });
  const [options, setOptions] = useState<PriceLabelOptions>({
    size: "gondola",
    color: "white",
    barcodeSource: "barcode",
    barcodeFormat: "auto",
    showStore: true,
    showSku: true,
    showUnit: true,
  });
  const setOption = <K extends keyof PriceLabelOptions>(key: K, value: PriceLabelOptions[K]) =>
    setOptions((o) => ({ ...o, [key]: value }));

  const byId = useMemo(() => new Map((products.data ?? []).map((p) => [p._id, p])), [products.data]);
  const items = selection
    .map((s) => ({ ...s, product: byId.get(s.productId) }))
    .filter((s): s is Selection & { product: NonNullable<typeof s.product> } => !!s.product);
  const totalLabels = items.reduce((sum, i) => sum + i.copies, 0);
  const storeName = settings?.storeName ?? "";

  const invalidEan =
    options.barcodeSource !== "none" && options.barcodeFormat === "ean13"
      ? items.filter((i) => !normalizeEan13(barcodeValue(i.product, options.barcodeSource))).length
      : 0;

  const add = (productId: string) =>
    setSelection((current) =>
      current.some((s) => s.productId === productId)
        ? current.map((s) => (s.productId === productId ? { ...s, copies: Math.min(MAX_COPIES, s.copies + 1) } : s))
        : [...current, { productId, copies: 1 }],
    );

  const addCategory = (category: string) => {
    const list = (products.data ?? []).filter((p) => p.category === category);
    setSelection((current) => {
      const ids = new Set(current.map((s) => s.productId));
      return [...current, ...list.filter((p) => !ids.has(p._id)).map((p) => ({ productId: p._id, copies: 1 }))];
    });
    toast.success(`${list.length} produtos de ${category} adicionados`);
  };

  const setCopies = (productId: string, copies: number) =>
    setSelection((current) =>
      current.map((s) => (s.productId === productId ? { ...s, copies: Math.max(1, Math.min(MAX_COPIES, copies || 1)) } : s)),
    );

  const print = () => {
    if (!totalLabels) {
      toast.error("Selecione ao menos um produto");
      return;
    }
    window.print();
  };

  return (
    <>
      <PageHeader
        title="Etiquetas de preço"
        description="Monte etiquetas de gôndola com preço e código de barras e imprima em lote."
        actions={
          <>
            <Button variant="outline" asChild>
              <Link href="/shelf-label">
                <Tags /> Placas de prateleira
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/stock">
                <Boxes /> Estoque
              </Link>
            </Button>
            <Button onClick={print} disabled={!totalLabels}>
              <Printer /> Imprimir {totalLabels ? `(${totalLabels})` : ""}
            </Button>
          </>
        }
      />

      {products.error ? (
        <ErrorState error={products.error} onRetry={() => products.refetch()} />
      ) : (
        <div className="grid gap-4 xl:grid-cols-[24rem_minmax(0,1fr)]">
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Produtos</CardTitle>
                <CardDescription>Adicione itens e defina quantas cópias imprimir.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <ProductPicker onSelect={(p) => add(p._id)} resetOnSelect placeholder="Adicionar produto…" />
                <Select value="" onValueChange={addCategory}>
                  <SelectTrigger className="w-full" aria-label="Adicionar categoria inteira">
                    <SelectValue placeholder="Adicionar categoria inteira…" />
                  </SelectTrigger>
                  <SelectContent position="popper">
                    {categories.map((c) => (
                      <SelectItem key={c._id} value={c.name}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {products.isLoading && selection.length > 0 ? (
                  <Skeleton className="h-16 w-full" />
                ) : items.length ? (
                  <>
                    <ul className="max-h-80 divide-y overflow-y-auto rounded-lg border">
                      {items.map(({ product, copies }) => (
                        <li key={product._id} className="flex items-center gap-2 p-2">
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">{product.name}</p>
                            <p className="text-xs text-muted-foreground">
                              <span className="font-mono">{product.sku}</span> · {formatCurrency(product.price)}
                            </p>
                          </div>
                          <div className="flex items-center">
                            <Button variant="ghost" size="icon-xs" aria-label="Menos cópias" onClick={() => setCopies(product._id, copies - 1)}>
                              <Minus />
                            </Button>
                            <Input
                              value={copies}
                              onChange={(e) => setCopies(product._id, Number(e.target.value.replace(/\D/g, "")))}
                              aria-label={`Cópias de ${product.name}`}
                              className="tabular h-7 w-10 px-1 text-center"
                              inputMode="numeric"
                            />
                            <Button variant="ghost" size="icon-xs" aria-label="Mais cópias" onClick={() => setCopies(product._id, copies + 1)}>
                              <Plus />
                            </Button>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`Remover ${product.name}`}
                            onClick={() => setSelection((c) => c.filter((s) => s.productId !== product._id))}
                          >
                            <Trash2 />
                          </Button>
                        </li>
                      ))}
                    </ul>
                    <div className="flex items-center justify-between text-sm text-muted-foreground">
                      <span className="tabular">
                        {formatNumber(items.length)} produtos · {formatNumber(totalLabels)} etiquetas
                      </span>
                      <Button variant="ghost" size="sm" onClick={() => setSelection([])}>
                        Limpar
                      </Button>
                    </div>
                  </>
                ) : (
                  <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
                    Nenhum produto selecionado.
                  </p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Layout</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4">
                <div className="grid grid-cols-2 gap-3">
                  <FormField label="Tamanho" htmlFor="pt-size" className="col-span-2 sm:col-span-1 xl:col-span-2">
                    <Select value={options.size} onValueChange={(v) => setOption("size", v as PriceLabelSize)}>
                      <SelectTrigger id="pt-size" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent position="popper">
                        {Object.entries(PRICE_LABEL_SIZES).map(([key, s]) => (
                          <SelectItem key={key} value={key}>
                            {s.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormField>
                  <FormField label="Cor" htmlFor="pt-color" className="col-span-2 sm:col-span-1 xl:col-span-2">
                    <Select value={options.color} onValueChange={(v) => setOption("color", v as PriceLabelColor)}>
                      <SelectTrigger id="pt-color" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent position="popper">
                        {Object.entries(PRICE_LABEL_COLORS).map(([key, c]) => (
                          <SelectItem key={key} value={key}>
                            {c.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormField>
                  <FormField label="Código de barras" htmlFor="pt-source">
                    <Select value={options.barcodeSource} onValueChange={(v) => setOption("barcodeSource", v as BarcodeSource)}>
                      <SelectTrigger id="pt-source" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent position="popper">
                        <SelectItem value="barcode">EAN do produto</SelectItem>
                        <SelectItem value="sku">SKU</SelectItem>
                        <SelectItem value="none">Não imprimir</SelectItem>
                      </SelectContent>
                    </Select>
                  </FormField>
                  <FormField label="Simbologia" htmlFor="pt-format">
                    <Select
                      value={options.barcodeFormat}
                      onValueChange={(v) => setOption("barcodeFormat", v as BarcodeFormat)}
                      disabled={options.barcodeSource === "none"}
                    >
                      <SelectTrigger id="pt-format" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent position="popper">
                        <SelectItem value="auto">Automática</SelectItem>
                        <SelectItem value="ean13">EAN-13</SelectItem>
                        <SelectItem value="code128">Code 128</SelectItem>
                      </SelectContent>
                    </Select>
                  </FormField>
                </div>
                {invalidEan > 0 && (
                  <p className="flex gap-2 rounded-md bg-warning/15 px-3 py-2 text-xs text-warning">
                    <Info className="mt-0.5 size-3.5 shrink-0" />
                    {invalidEan} produto(s) sem EAN-13 válido serão impressos em Code 128.
                  </p>
                )}
                <div className="grid gap-2.5">
                  {(
                    [
                      ["showStore", "Nome da loja"],
                      ["showSku", "SKU"],
                      ["showUnit", "Unidade de venda"],
                    ] as const
                  ).map(([key, label]) => (
                    <div key={key} className="flex items-center gap-2">
                      <Checkbox id={`pt-${key}`} checked={options[key]} onCheckedChange={(v) => setOption(key, v === true)} />
                      <Label htmlFor={`pt-${key}`} className="font-normal">
                        {label}
                      </Label>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          <Card className="min-w-0">
            <CardHeader>
              <CardTitle>Prévia</CardTitle>
              <CardDescription>Tamanho real aproximado. A impressão usa as mesmas medidas em milímetros.</CardDescription>
            </CardHeader>
            <CardContent>
              {!items.length ? (
                <EmptyState icon={Tag} title="Sem etiquetas para mostrar" description="Adicione produtos para ver a prévia." />
              ) : (
                <div className="flex flex-wrap content-start gap-3 rounded-lg bg-muted/50 p-4">
                  {items.map(({ product, copies }) => (
                    <div key={product._id} className="relative">
                      <PriceLabel product={product} options={options} storeName={storeName} />
                      {copies > 1 && (
                        <span className="tabular absolute -top-2 -right-2 rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-medium text-primary-foreground shadow">
                          ×{copies}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      <PrintPortal>
        <div className="flex flex-wrap content-start gap-[2mm]">
          {items.flatMap(({ product, copies }) =>
            Array.from({ length: copies }, (_, i) => (
              <PriceLabel key={`${product._id}-${i}`} product={product} options={options} storeName={storeName} />
            )),
          )}
        </div>
      </PrintPortal>
    </>
  );
}
