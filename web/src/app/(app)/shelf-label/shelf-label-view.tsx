"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { MapPinned, Minus, Plus, Printer, Tag, Tags, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/page-header";
import { EmptyState, ErrorState } from "@/components/query-state";
import { AddressPicker } from "@/components/inventory/address-picker";
import { FormField } from "@/components/inventory/form-field";
import {
  SHELF_LABEL_COLORS,
  SHELF_LABEL_SIZES,
  ShelfLabel,
  type ShelfLabelColor,
  type ShelfLabelData,
  type ShelfLabelSize,
} from "@/components/inventory/labels";
import { PrintPortal } from "@/components/inventory/print-portal";
import { ProductPicker } from "@/components/inventory/product-picker";
import { useAddresses } from "@/components/inventory/queries";
import type { Product } from "@/lib/domain/types";
import { formatNumber } from "@/lib/format";
import { locationCode } from "@/lib/services/products";

interface Entry {
  key: string;
  data: ShelfLabelData;
  copies: number;
}

const MAX_COPIES = 20;

function pad(value: string) {
  const v = value.trim().toUpperCase();
  return /^\d+$/.test(v) ? v.padStart(2, "0") : v;
}

export function ShelfLabelView() {
  const params = useSearchParams();
  const addresses = useAddresses();
  const all = useMemo(() => addresses.data ?? [], [addresses.data]);

  const [manual, setManual] = useState<Entry[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>(() => {
    const id = params.get("address");
    return id ? [id] : [];
  });
  const [copies, setCopiesMap] = useState<Record<string, number>>({});
  const [size, setSize] = useState<ShelfLabelSize>("standard");
  const [color, setColor] = useState<ShelfLabelColor>("yellow");
  const [showBarcode, setShowBarcode] = useState(true);

  const entries: Entry[] = useMemo(() => {
    const fromAddresses = selectedIds
      .map((id) => all.find((a) => a._id === id))
      .filter((a): a is NonNullable<typeof a> => !!a)
      .map((a) => ({
        key: a._id,
        data: { deposit: a.deposit, aisle: a.aisle, shelf: a.shelf, level: a.level, slot: a.slot, code: a.code, description: a.description },
        copies: copies[a._id] ?? 1,
      }));
    return [...fromAddresses, ...manual.map((m) => ({ ...m, copies: copies[m.key] ?? 1 }))];
  }, [selectedIds, all, manual, copies]);
  const totalLabels = entries.reduce((s, e) => s + e.copies, 0);

  const addAddress = (id: string) =>
    setSelectedIds((current) => (current.includes(id) ? current : [...current, id]));

  const addAisle = (aisle: string) => {
    const list = all.filter((a) => a.active && a.aisle === aisle);
    setSelectedIds((current) => [...current, ...list.map((a) => a._id).filter((id) => !current.includes(id))]);
    toast.success(`${list.length} endereços do corredor ${aisle} adicionados`);
  };

  const addManual = (data: ShelfLabelData) => {
    const key = `manual-${data.code}`;
    if (entries.some((e) => e.data.code === data.code)) {
      toast.info("Endereço já está na lista", { description: data.code });
      return;
    }
    setManual((m) => [...m, { key, data, copies: 1 }]);
  };

  const addFromProduct = (p: Product) => {
    if (!p.location?.aisle) {
      toast.error("Produto sem endereço", { description: "Endereçe o produto antes de imprimir a placa." });
      return;
    }
    const code = locationCode(p.location);
    const address = all.find((a) => a.code === code);
    if (address) addAddress(address._id);
    else addManual({ ...p.location, code, description: p.name });
  };

  const remove = (key: string) => {
    setSelectedIds((ids) => ids.filter((id) => id !== key));
    setManual((m) => m.filter((e) => e.key !== key));
  };

  const setCopies = (key: string, value: number) =>
    setCopiesMap((c) => ({ ...c, [key]: Math.max(1, Math.min(MAX_COPIES, value || 1)) }));

  const aisles = [...new Set(all.filter((a) => a.active).map((a) => a.aisle))].sort();

  const print = () => {
    if (!totalLabels) {
      toast.error("Adicione ao menos um endereço");
      return;
    }
    window.print();
  };

  return (
    <>
      <PageHeader
        title="Placas de prateleira"
        description="Etiquetas de endereço físico para corredores, prateleiras e posições."
        actions={
          <>
            <Button variant="outline" asChild>
              <Link href="/price-tag">
                <Tag /> Etiquetas de preço
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/new-address">
                <MapPinned /> Endereços
              </Link>
            </Button>
            <Button onClick={print} disabled={!totalLabels}>
              <Printer /> Imprimir {totalLabels ? `(${totalLabels})` : ""}
            </Button>
          </>
        }
      />

      {addresses.error ? (
        <ErrorState error={addresses.error} onRetry={() => addresses.refetch()} />
      ) : (
        <div className="grid gap-4 xl:grid-cols-[24rem_minmax(0,1fr)]">
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Endereços</CardTitle>
                <CardDescription>Escolha endereços cadastrados, um corredor inteiro ou preencha manualmente.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Tabs defaultValue="registered" className="gap-3">
                  <TabsList className="w-full">
                    <TabsTrigger value="registered">Cadastrado</TabsTrigger>
                    <TabsTrigger value="product">Produto</TabsTrigger>
                    <TabsTrigger value="manual">Manual</TabsTrigger>
                  </TabsList>
                  <TabsContent value="registered" className="space-y-3">
                    <AddressPicker addresses={all} onSelect={(a) => addAddress(a._id)} resetOnSelect placeholder="Adicionar endereço…" />
                    <Select value="" onValueChange={addAisle}>
                      <SelectTrigger className="w-full" aria-label="Adicionar corredor inteiro">
                        <SelectValue placeholder="Adicionar corredor inteiro…" />
                      </SelectTrigger>
                      <SelectContent position="popper">
                        {aisles.map((a) => (
                          <SelectItem key={a} value={a}>
                            Corredor {a}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TabsContent>
                  <TabsContent value="product">
                    <ProductPicker onSelect={addFromProduct} resetOnSelect placeholder="Usar endereço do produto…" />
                  </TabsContent>
                  <TabsContent value="manual">
                    <ManualForm onAdd={addManual} />
                  </TabsContent>
                </Tabs>

                {entries.length ? (
                  <>
                    <ul className="max-h-72 divide-y overflow-y-auto rounded-lg border">
                      {entries.map((e) => (
                        <li key={e.key} className="flex items-center gap-2 p-2">
                          <div className="min-w-0 flex-1">
                            <p className="font-mono text-sm font-medium">{e.data.code}</p>
                            {e.data.description && <p className="truncate text-xs text-muted-foreground">{e.data.description}</p>}
                          </div>
                          <div className="flex items-center">
                            <Button variant="ghost" size="icon-xs" aria-label="Menos cópias" onClick={() => setCopies(e.key, e.copies - 1)}>
                              <Minus />
                            </Button>
                            <Input
                              value={e.copies}
                              onChange={(ev) => setCopies(e.key, Number(ev.target.value.replace(/\D/g, "")))}
                              aria-label={`Cópias de ${e.data.code}`}
                              className="tabular h-7 w-10 px-1 text-center"
                              inputMode="numeric"
                            />
                            <Button variant="ghost" size="icon-xs" aria-label="Mais cópias" onClick={() => setCopies(e.key, e.copies + 1)}>
                              <Plus />
                            </Button>
                          </div>
                          <Button variant="ghost" size="icon-sm" aria-label={`Remover ${e.data.code}`} onClick={() => remove(e.key)}>
                            <Trash2 />
                          </Button>
                        </li>
                      ))}
                    </ul>
                    <div className="flex items-center justify-between text-sm text-muted-foreground">
                      <span className="tabular">
                        {formatNumber(entries.length)} endereços · {formatNumber(totalLabels)} placas
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setSelectedIds([]);
                          setManual([]);
                        }}
                      >
                        Limpar
                      </Button>
                    </div>
                  </>
                ) : (
                  <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
                    Nenhum endereço selecionado.
                  </p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Layout</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4">
                <FormField label="Tamanho" htmlFor="sl-size">
                  <Select value={size} onValueChange={(v) => setSize(v as ShelfLabelSize)}>
                    <SelectTrigger id="sl-size" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent position="popper">
                      {Object.entries(SHELF_LABEL_SIZES).map(([key, s]) => (
                        <SelectItem key={key} value={key}>
                          {s.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormField>
                <FormField label="Cor da placa" htmlFor="sl-color">
                  <Select value={color} onValueChange={(v) => setColor(v as ShelfLabelColor)}>
                    <SelectTrigger id="sl-color" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent position="popper">
                      {Object.entries(SHELF_LABEL_COLORS).map(([key, c]) => (
                        <SelectItem key={key} value={key}>
                          {c.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormField>
                <div className="flex items-center gap-2">
                  <Checkbox id="sl-barcode" checked={showBarcode} onCheckedChange={(v) => setShowBarcode(v === true)} />
                  <Label htmlFor="sl-barcode" className="font-normal">
                    Código de barras do endereço (Code 128)
                  </Label>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card className="min-w-0">
            <CardHeader>
              <CardTitle>Prévia</CardTitle>
              <CardDescription>Tamanho real aproximado das placas.</CardDescription>
            </CardHeader>
            <CardContent>
              {!entries.length ? (
                <EmptyState icon={Tags} title="Sem placas para mostrar" description="Adicione endereços para ver a prévia." />
              ) : (
                <div className="flex flex-wrap content-start gap-3 overflow-x-auto rounded-lg bg-muted/50 p-4">
                  {entries.map((e) => (
                    <div key={e.key} className="relative">
                      <ShelfLabel data={e.data} size={size} color={color} showBarcode={showBarcode} />
                      {e.copies > 1 && (
                        <span className="tabular absolute -top-2 -right-2 rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-medium text-primary-foreground shadow">
                          ×{e.copies}
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
        <div className="flex flex-wrap content-start gap-[3mm]">
          {entries.flatMap((e) =>
            Array.from({ length: e.copies }, (_, i) => (
              <ShelfLabel key={`${e.key}-${i}`} data={e.data} size={size} color={color} showBarcode={showBarcode} />
            )),
          )}
        </div>
      </PrintPortal>
    </>
  );
}

function ManualForm({ onAdd }: { onAdd: (data: ShelfLabelData) => void }) {
  const [form, setForm] = useState({ deposit: "DEPÓSITO 01", aisle: "", shelf: "", level: "", slot: "", description: "" });
  const [error, setError] = useState<string | null>(null);
  const set = (key: keyof typeof form, value: string) => {
    setForm((f) => ({ ...f, [key]: value }));
    setError(null);
  };
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.aisle.trim() || !form.shelf.trim()) {
      setError("Informe ao menos corredor e prateleira");
      return;
    }
    const loc = {
      deposit: form.deposit.trim().toUpperCase() || "DEPÓSITO 01",
      aisle: form.aisle.trim().toUpperCase(),
      shelf: pad(form.shelf),
      level: pad(form.level),
      slot: pad(form.slot),
    };
    onAdd({ ...loc, code: locationCode(loc), description: form.description.trim() || undefined });
    setForm((f) => ({ ...f, slot: "", description: "" }));
  };
  return (
    <form onSubmit={submit} noValidate className="grid grid-cols-4 gap-2">
      {(
        [
          ["aisle", "Corredor", "A"],
          ["shelf", "Prat.", "01"],
          ["level", "Nível", "01"],
          ["slot", "Posição", "01"],
        ] as const
      ).map(([key, label, ph]) => (
        <FormField key={key} label={label} htmlFor={`sm-${key}`} required={key === "aisle" || key === "shelf"}>
          <Input
            id={`sm-${key}`}
            value={form[key]}
            onChange={(e) => set(key, e.target.value.toUpperCase())}
            aria-invalid={!!error && (key === "aisle" || key === "shelf")}
            placeholder={ph}
            maxLength={4}
            className="font-mono uppercase"
          />
        </FormField>
      ))}
      <FormField label="Descrição" htmlFor="sm-desc" className="col-span-4">
        <Input id="sm-desc" value={form.description} onChange={(e) => set("description", e.target.value)} placeholder="Ex.: Setor materiais" />
      </FormField>
      {error && <p className="col-span-4 text-sm text-destructive">{error}</p>}
      <Button type="submit" variant="secondary" className="col-span-4">
        <Plus /> Adicionar
      </Button>
    </form>
  );
}
