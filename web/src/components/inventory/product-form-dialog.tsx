"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { MapPin, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { FieldSeparator } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { margin } from "@/lib/domain/calc";
import type { Product, ProductUnit } from "@/lib/domain/types";
import { errorMessage } from "@/lib/errors";
import { formatPercent, toDateInput } from "@/lib/format";
import {
  createCategory,
  createProduct,
  locationCode,
  updateProduct,
  type ProductInput,
} from "@/lib/services/products";
import { cn } from "@/lib/utils";
import { FormField } from "./form-field";
import { useCategories, useInvalidateInventory } from "./queries";
import { decimalInput, parseDecimal, UNITS } from "./utils";

interface ProductFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Produto a editar; ausente = cadastro. */
  product?: Product | null;
  /** Valores iniciais para um novo cadastro. */
  defaults?: Partial<ProductInput>;
  onSaved?: (product: Product) => void;
}

export function ProductFormDialog({ open, onOpenChange, product, defaults, onSaved }: ProductFormDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] flex-col gap-0 p-0 sm:max-w-2xl">
        <DialogHeader className="gap-1.5 border-b p-5 pr-12">
          <DialogTitle>{product ? "Editar produto" : "Novo produto"}</DialogTitle>
          <DialogDescription>
            {product ? `${product.name} · ${product.sku}` : "Cadastre um item no catálogo e no estoque."}
          </DialogDescription>
        </DialogHeader>
        {open && (
          <ProductForm
            key={product?._id ?? "new"}
            product={product}
            defaults={defaults}
            onCancel={() => onOpenChange(false)}
            onSaved={(saved) => {
              onOpenChange(false);
              onSaved?.(saved);
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

type FormState = {
  name: string;
  sku: string;
  barcode: string;
  category: string;
  newCategory: string;
  brand: string;
  supplier: string;
  unit: ProductUnit;
  quantity: string;
  minStock: string;
  maxStock: string;
  price: string;
  costPrice: string;
  perishable: boolean;
  expiryDate: string;
  deposit: string;
  aisle: string;
  shelf: string;
  level: string;
  slot: string;
};

type Errors = Partial<Record<keyof FormState, string>>;

const NEW_CATEGORY = "__new__";

function initialState(product?: Product | null, defaults?: Partial<ProductInput>): FormState {
  const source = product ?? defaults ?? {};
  return {
    name: source.name ?? "",
    sku: source.sku ?? "",
    barcode: source.barcode ?? "",
    category: source.category ?? "",
    newCategory: "",
    brand: source.brand ?? "",
    supplier: source.supplier ?? "",
    unit: source.unit ?? "UN",
    quantity: decimalInput(product ? product.quantity : (defaults?.quantity ?? 0)),
    minStock: decimalInput(source.minStock ?? 0),
    maxStock: decimalInput(source.maxStock ?? 0),
    price: decimalInput(source.price),
    costPrice: decimalInput(source.costPrice),
    perishable: source.perishable ?? false,
    expiryDate: source.expiryDate ? toDateInput(new Date(source.expiryDate)) : "",
    deposit: source.location?.deposit ?? "DEPÓSITO 01",
    aisle: source.location?.aisle ?? "",
    shelf: source.location?.shelf ?? "",
    level: source.location?.level ?? "",
    slot: source.location?.slot ?? "",
  };
}

function validate(form: FormState, isNew: boolean): Errors {
  const errors: Errors = {};
  if (!form.name.trim()) errors.name = "Informe o nome";
  if (!form.sku.trim()) errors.sku = "Informe o SKU";
  if (form.barcode && !/^\d{8,14}$/.test(form.barcode.trim())) errors.barcode = "Use de 8 a 14 dígitos";
  if (form.category === NEW_CATEGORY ? !form.newCategory.trim() : !form.category)
    errors[form.category === NEW_CATEGORY ? "newCategory" : "category"] = "Informe a categoria";
  const price = parseDecimal(form.price);
  if (!(price > 0)) errors.price = "Informe um preço maior que zero";
  const cost = parseDecimal(form.costPrice || "0");
  if (Number.isNaN(cost) || cost < 0) errors.costPrice = "Custo inválido";
  if (isNew) {
    const qty = parseDecimal(form.quantity || "0");
    if (Number.isNaN(qty) || qty < 0) errors.quantity = "Quantidade inválida";
  }
  const min = parseDecimal(form.minStock || "0");
  const max = parseDecimal(form.maxStock || "0");
  if (Number.isNaN(min) || min < 0) errors.minStock = "Valor inválido";
  if (Number.isNaN(max) || max < 0) errors.maxStock = "Valor inválido";
  else if (max > 0 && max < min) errors.maxStock = "Deve ser maior que o mínimo";
  if (form.perishable && !form.expiryDate) errors.expiryDate = "Informe a validade";
  const loc = [form.aisle, form.shelf, form.level, form.slot].map((v) => v.trim());
  if (loc.some(Boolean) && !loc.every(Boolean)) errors.aisle = "Preencha todos os campos do endereço ou nenhum";
  return errors;
}

function ProductForm({
  product,
  defaults,
  onCancel,
  onSaved,
}: {
  product?: Product | null;
  defaults?: Partial<ProductInput>;
  onCancel: () => void;
  onSaved: (product: Product) => void;
}) {
  const [form, setForm] = useState<FormState>(() => initialState(product, defaults));
  const [errors, setErrors] = useState<Errors>({});
  const { data: categories = [] } = useCategories();
  const invalidate = useInvalidateInventory();
  const isNew = !product;

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }));
  };

  const mutation = useMutation({
    mutationFn: async () => {
      let category = form.category;
      if (category === NEW_CATEGORY) category = (await createCategory(form.newCategory)).name;
      const hasLocation = !!form.aisle.trim();
      const input: ProductInput = {
        name: form.name.trim(),
        sku: form.sku.trim().toUpperCase(),
        barcode: form.barcode.trim() || undefined,
        category,
        brand: form.brand.trim() || undefined,
        supplier: form.supplier.trim() || undefined,
        unit: form.unit,
        quantity: isNew ? parseDecimal(form.quantity || "0") : product.quantity,
        minStock: parseDecimal(form.minStock || "0"),
        maxStock: parseDecimal(form.maxStock || "0"),
        price: parseDecimal(form.price),
        costPrice: parseDecimal(form.costPrice || "0"),
        perishable: form.perishable,
        expiryDate: form.perishable && form.expiryDate ? new Date(`${form.expiryDate}T12:00:00`).toISOString() : undefined,
        location: hasLocation
          ? {
              deposit: form.deposit.trim().toUpperCase() || "DEPÓSITO 01",
              aisle: form.aisle.trim().toUpperCase(),
              shelf: form.shelf.trim().padStart(2, "0"),
              level: form.level.trim().padStart(2, "0"),
              slot: form.slot.trim().padStart(2, "0"),
            }
          : undefined,
        active: product?.active ?? true,
      };
      return isNew ? createProduct(input) : updateProduct(product._id, input);
    },
    onSuccess: async (saved) => {
      await invalidate();
      toast.success(isNew ? "Produto cadastrado" : "Produto atualizado", { description: saved.name });
      onSaved(saved);
    },
    onError: (error) => {
      const message = errorMessage(error);
      if (/SKU/i.test(message)) setErrors((e) => ({ ...e, sku: message }));
      else if (/barras/i.test(message)) setErrors((e) => ({ ...e, barcode: message }));
      toast.error("Não foi possível salvar", { description: message });
    },
  });

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const found = validate(form, isNew);
    setErrors(found);
    if (Object.keys(found).length) {
      toast.error("Revise os campos destacados");
      return;
    }
    mutation.mutate();
  };

  const price = parseDecimal(form.price);
  const cost = parseDecimal(form.costPrice);
  const currentMargin = price > 0 && cost >= 0 ? margin({ price, costPrice: cost }) : null;
  const code = locationCode({
    deposit: form.deposit,
    aisle: form.aisle.toUpperCase(),
    shelf: form.shelf.padStart(2, "0"),
    level: form.level.padStart(2, "0"),
    slot: form.slot.padStart(2, "0"),
  });

  return (
    <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col" noValidate>
      <div className="flex-1 space-y-6 overflow-y-auto p-5">
        <section className="grid gap-4 sm:grid-cols-2">
          <FormField label="Nome do produto" htmlFor="pf-name" required error={errors.name} className="sm:col-span-2">
            <Input
              id="pf-name"
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              aria-invalid={!!errors.name}
              placeholder="Ex.: Cimento CP-II 50kg"
              autoFocus
            />
          </FormField>
          <FormField label="SKU" htmlFor="pf-sku" required error={errors.sku}>
            <Input
              id="pf-sku"
              value={form.sku}
              onChange={(e) => set("sku", e.target.value)}
              aria-invalid={!!errors.sku}
              className="font-mono uppercase"
              placeholder="MAT-001"
            />
          </FormField>
          <FormField label="Código de barras (EAN)" htmlFor="pf-barcode" error={errors.barcode}>
            <Input
              id="pf-barcode"
              value={form.barcode}
              onChange={(e) => set("barcode", e.target.value.replace(/\D/g, ""))}
              aria-invalid={!!errors.barcode}
              inputMode="numeric"
              className="font-mono"
              placeholder="7891234567890"
            />
          </FormField>
          <FormField
            label="Categoria"
            htmlFor="pf-category"
            required
            error={errors.category ?? errors.newCategory}
          >
            <Select value={form.category} onValueChange={(v) => set("category", v)}>
              <SelectTrigger id="pf-category" className="w-full" aria-invalid={!!errors.category}>
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent position="popper">
                {categories.map((c) => (
                  <SelectItem key={c._id} value={c.name}>
                    {c.name}
                  </SelectItem>
                ))}
                {form.category && !categories.some((c) => c.name === form.category) && form.category !== NEW_CATEGORY && (
                  <SelectItem value={form.category}>{form.category}</SelectItem>
                )}
                <SelectItem value={NEW_CATEGORY}>
                  <Plus /> Nova categoria…
                </SelectItem>
              </SelectContent>
            </Select>
            {form.category === NEW_CATEGORY && (
              <Input
                value={form.newCategory}
                onChange={(e) => set("newCategory", e.target.value)}
                aria-invalid={!!errors.newCategory}
                placeholder="Nome da nova categoria"
                autoFocus
              />
            )}
          </FormField>
          <FormField label="Unidade" htmlFor="pf-unit" required>
            <Select value={form.unit} onValueChange={(v) => set("unit", v as ProductUnit)}>
              <SelectTrigger id="pf-unit" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper">
                {UNITS.map((u) => (
                  <SelectItem key={u.value} value={u.value}>
                    {u.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
          <FormField label="Marca" htmlFor="pf-brand">
            <Input id="pf-brand" value={form.brand} onChange={(e) => set("brand", e.target.value)} />
          </FormField>
          <FormField label="Fornecedor" htmlFor="pf-supplier">
            <Input id="pf-supplier" value={form.supplier} onChange={(e) => set("supplier", e.target.value)} />
          </FormField>
        </section>

        <FieldSeparator>Preço e estoque</FieldSeparator>

        <section className="grid gap-4 sm:grid-cols-2">
          <FormField label="Preço de venda (R$)" htmlFor="pf-price" required error={errors.price}>
            <Input
              id="pf-price"
              value={form.price}
              onChange={(e) => set("price", e.target.value)}
              aria-invalid={!!errors.price}
              inputMode="decimal"
              placeholder="0,00"
              className="tabular"
            />
          </FormField>
          <FormField
            label="Custo unitário (R$)"
            htmlFor="pf-cost"
            error={errors.costPrice}
            description={
              currentMargin !== null ? (
                <span className={cn(currentMargin < 0 ? "text-destructive" : currentMargin < 0.15 ? "text-warning" : "text-success")}>
                  Margem de {formatPercent(currentMargin)}
                </span>
              ) : undefined
            }
          >
            <Input
              id="pf-cost"
              value={form.costPrice}
              onChange={(e) => set("costPrice", e.target.value)}
              aria-invalid={!!errors.costPrice}
              inputMode="decimal"
              placeholder="0,00"
              className="tabular"
            />
          </FormField>
          <FormField
            label={isNew ? "Estoque inicial" : "Saldo atual"}
            htmlFor="pf-qty"
            error={errors.quantity}
            description={isNew ? "Gera uma movimentação de entrada." : "Use “Ajustar estoque” para alterar o saldo."}
          >
            <Input
              id="pf-qty"
              value={form.quantity}
              onChange={(e) => set("quantity", e.target.value)}
              aria-invalid={!!errors.quantity}
              inputMode="decimal"
              disabled={!isNew}
              className="tabular"
            />
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Mínimo" htmlFor="pf-min" error={errors.minStock}>
              <Input
                id="pf-min"
                value={form.minStock}
                onChange={(e) => set("minStock", e.target.value)}
                aria-invalid={!!errors.minStock}
                inputMode="decimal"
                className="tabular"
              />
            </FormField>
            <FormField label="Máximo" htmlFor="pf-max" error={errors.maxStock}>
              <Input
                id="pf-max"
                value={form.maxStock}
                onChange={(e) => set("maxStock", e.target.value)}
                aria-invalid={!!errors.maxStock}
                inputMode="decimal"
                className="tabular"
              />
            </FormField>
          </div>
        </section>

        <div className="rounded-lg border p-3">
          <label className="flex cursor-pointer items-center justify-between gap-4">
            <span>
              <span className="block text-sm font-medium">Produto perecível</span>
              <span className="block text-xs text-muted-foreground">Controla a data de validade e alerta o vencimento.</span>
            </span>
            <Switch checked={form.perishable} onCheckedChange={(v) => set("perishable", v)} />
          </label>
          {form.perishable && (
            <FormField label="Data de validade" htmlFor="pf-expiry" required error={errors.expiryDate} className="mt-3">
              <Input
                id="pf-expiry"
                type="date"
                value={form.expiryDate}
                onChange={(e) => set("expiryDate", e.target.value)}
                aria-invalid={!!errors.expiryDate}
                className="w-full sm:w-52"
              />
            </FormField>
          )}
        </div>

        <FieldSeparator>Endereço no depósito</FieldSeparator>

        <section className="space-y-3">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <FormField label="Depósito" htmlFor="pf-deposit" className="col-span-2 sm:col-span-1">
              <Input id="pf-deposit" value={form.deposit} onChange={(e) => set("deposit", e.target.value)} />
            </FormField>
            {(
              [
                ["aisle", "Corredor", "A"],
                ["shelf", "Prateleira", "01"],
                ["level", "Nível", "01"],
                ["slot", "Posição", "01"],
              ] as const
            ).map(([key, label, ph]) => (
              <FormField key={key} label={label} htmlFor={`pf-${key}`}>
                <Input
                  id={`pf-${key}`}
                  value={form[key]}
                  onChange={(e) => set(key, e.target.value.toUpperCase())}
                  aria-invalid={key === "aisle" && !!errors.aisle}
                  placeholder={ph}
                  maxLength={4}
                  className="font-mono uppercase"
                />
              </FormField>
            ))}
          </div>
          {errors.aisle ? (
            <p className="text-sm text-destructive">{errors.aisle}</p>
          ) : (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <MapPin className="size-3.5" />
              {code ? <span className="font-mono text-foreground">{code}</span> : "Sem endereço definido"}
            </p>
          )}
        </section>
      </div>
      <DialogFooter className="m-0 rounded-b-xl">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancelar
        </Button>
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending && <Spinner />}
          {isNew ? "Cadastrar produto" : "Salvar alterações"}
        </Button>
      </DialogFooter>
    </form>
  );
}
