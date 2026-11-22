"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Barcode, Eraser, FileText, PackagePlus, Percent, Search, ShoppingCart } from "lucide-react";
import type { CashMovementType, Product, Sale, SaleItem } from "@/lib/domain/types";
import { saleTotals } from "@/lib/domain/calc";
import { useSession } from "@/lib/auth";
import { errorMessage } from "@/lib/errors";
import { formatCurrency, formatNumber } from "@/lib/format";
import { createSale, isCustomItem, type PaymentInput } from "@/lib/services/sales";
import { cn } from "@/lib/utils";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { ErrorState } from "@/components/query-state";
import { Button } from "@/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";
import { Kbd } from "@/components/ui/kbd";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { CartTable } from "@/components/pos/cart-table";
import { CashMovementDialog, CloseCashDialog, OpenCashCard } from "@/components/pos/cash-dialogs";
import { CashSessionBar } from "@/components/pos/cash-session-bar";
import { CheckoutDialog } from "@/components/pos/checkout-dialog";
import { CustomItemDialog } from "@/components/pos/custom-item-dialog";
import { CustomerPicker } from "@/components/pos/customer-picker";
import { DiscountDialog, type DiscountValue } from "@/components/pos/discount-dialog";
import { findExactProduct, parseQuery, ProductSearchDialog } from "@/components/pos/product-search-dialog";
import {
  invalidateAfterSale,
  useOpenCashSession,
  usePosProducts,
  useReceiptSettings,
  useSaleCustomers,
} from "@/components/pos/queries";
import { ReceiptDialog } from "@/components/pos/receipt-dialog";

/** Há algum diálogo/popover aberto? Atalhos globais ficam suspensos. */
function overlayOpen() {
  return Boolean(
    document.querySelector(
      '[data-slot="dialog-content"],[data-slot="alert-dialog-content"],[data-slot="sheet-content"],[data-slot="popover-content"],[data-slot="select-content"]',
    ),
  );
}

function isTyping(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
}

export function PosClient() {
  const cash = useOpenCashSession();

  return (
    <div className="flex flex-1 flex-col gap-4 lg:h-[calc(100svh-3.5rem-3rem)] lg:min-h-[560px]">
      <h1 className="sr-only">PDV / Vendas</h1>
      {cash.isPending ? (
        <div className="grid flex-1 gap-4">
          <Skeleton className="h-16 w-full rounded-xl" />
          <div className="grid flex-1 gap-4 lg:grid-cols-[1fr_360px]">
            <Skeleton className="h-full min-h-80 rounded-xl" />
            <Skeleton className="h-full min-h-80 rounded-xl" />
          </div>
        </div>
      ) : cash.isError ? (
        <ErrorState error={cash.error} onRetry={() => cash.refetch()} />
      ) : !cash.data ? (
        <OpenCashCard />
      ) : (
        <PosTerminal summary={cash.data} />
      )}
    </div>
  );
}

type Summary = NonNullable<ReturnType<typeof useOpenCashSession>["data"]>;

function PosTerminal({ summary }: { summary: Summary }) {
  const user = useSession();
  const queryClient = useQueryClient();
  const productsQuery = usePosProducts();
  const customersQuery = useSaleCustomers();
  const { data: company } = useReceiptSettings();

  const [items, setItems] = useState<SaleItem[]>([]);
  const [selected, setSelected] = useState(0);
  const [globalDiscount, setGlobalDiscount] = useState<DiscountValue>({ discount: 0, discountType: "percent" });
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [scan, setScan] = useState("");

  const [search, setSearch] = useState<{ open: boolean; query: string }>({ open: false, query: "" });
  const [customerOpen, setCustomerOpen] = useState(false);
  const [globalDiscountOpen, setGlobalDiscountOpen] = useState(false);
  const [itemDiscountIndex, setItemDiscountIndex] = useState<number | null>(null);
  const [customOpen, setCustomOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);
  const [quoteOpen, setQuoteOpen] = useState(false);
  const [cashMove, setCashMove] = useState<CashMovementType | null>(null);
  const [closeOpen, setCloseOpen] = useState(false);
  const [receipt, setReceipt] = useState<{ sale: Sale | null; open: boolean }>({ sale: null, open: false });

  const scanRef = useRef<HTMLInputElement>(null);
  const focusScan = useCallback(() => requestAnimationFrame(() => scanRef.current?.focus()), []);

  const products = useMemo(() => productsQuery.data ?? [], [productsQuery.data]);
  const productMap = useMemo(() => new Map(products.map((p) => [p._id, p])), [products]);
  const customers = useMemo(() => customersQuery.data ?? [], [customersQuery.data]);
  const customer = customers.find((c) => c._id === customerId) ?? null;

  const inCart = useMemo(() => {
    const map = new Map<string, number>();
    for (const it of items) if (!isCustomItem(it)) map.set(it.id, (map.get(it.id) ?? 0) + it.qty);
    return map;
  }, [items]);

  const totals = useMemo(
    () => saleTotals(items, globalDiscount.discount, globalDiscount.discountType),
    [items, globalDiscount],
  );
  const itemCount = items.length;
  const unitsCount = items.reduce((s, i) => s + i.qty, 0);

  // ----- carrinho --------------------------------------------------------

  const addProduct = useCallback(
    (product: Product, qty = 1) => {
      const existingIndex = items.findIndex((i) => i.id === product._id);
      const current = inCart.get(product._id) ?? 0;
      const available = product.quantity - current;
      if (available <= 0) {
        toast.error(`Sem saldo de "${product.name}"`, { description: `Estoque: ${formatNumber(product.quantity)} ${product.unit}` });
        return;
      }
      if (qty > available) {
        toast.error("Quantidade acima do estoque", {
          description: `${product.name}: disponível ${formatNumber(available)} ${product.unit}.`,
        });
        return;
      }
      if (existingIndex >= 0) {
        setItems((prev) => prev.map((it, i) => (i === existingIndex ? { ...it, qty: it.qty + qty } : it)));
        setSelected(existingIndex);
      } else {
        setItems((prev) => [
          ...prev,
          {
            id: product._id,
            sku: product.sku,
            name: product.name,
            unit: product.unit,
            qty,
            price: product.price,
            discount: 0,
            discountType: "percent",
          },
        ]);
        setSelected(items.length);
      }
    },
    [items, inCart],
  );

  const changeQty = useCallback(
    (index: number, qty: number) => {
      const item = items[index];
      if (!item) return;
      if (!isCustomItem(item)) {
        const product = productMap.get(item.id);
        if (product && qty > product.quantity) {
          toast.error("Quantidade acima do estoque", {
            description: `${product.name}: disponível ${formatNumber(product.quantity)} ${product.unit}.`,
          });
          qty = product.quantity;
        }
      }
      if (qty <= 0) return;
      setItems((prev) => prev.map((it, i) => (i === index ? { ...it, qty } : it)));
    },
    [items, productMap],
  );

  const removeItem = useCallback((index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
    setSelected((s) => Math.max(0, s >= index ? s - 1 : s));
  }, []);

  const resetSale = useCallback(() => {
    setItems([]);
    setSelected(0);
    setGlobalDiscount({ discount: 0, discountType: "percent" });
    setCustomerId(null);
    setScan("");
  }, []);

  const submitScan = () => {
    const { qty, term } = parseQuery(scan);
    if (!term) {
      setSearch({ open: true, query: "" });
      return;
    }
    const exact = findExactProduct(products, term);
    if (exact) {
      addProduct(exact, qty);
      setScan("");
    } else {
      setSearch({ open: true, query: scan });
      setScan("");
    }
  };

  // ----- venda -----------------------------------------------------------

  const saleMutation = useMutation({
    mutationFn: (args: { status: "FINALIZED" | "QUOTE"; payment?: PaymentInput }) =>
      createSale({
        items,
        globalDiscount: globalDiscount.discount,
        globalDiscountType: globalDiscount.discountType,
        status: args.status,
        payment: args.payment,
        customerId,
        userName: user?.name ?? "Operador",
      }),
    onSuccess: (sale) => {
      setCheckoutOpen(false);
      setQuoteOpen(false);
      resetSale();
      setReceipt({ sale, open: true });
      invalidateAfterSale(queryClient);
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const startCheckout = useCallback(() => {
    if (!items.length) {
      toast.info("Adicione itens ao carrinho para finalizar.");
      return;
    }
    setCheckoutOpen(true);
  }, [items.length]);

  const startQuote = useCallback(() => {
    if (!items.length) {
      toast.info("Adicione itens para salvar um orçamento.");
      return;
    }
    setQuoteOpen(true);
  }, [items.length]);

  // ----- atalhos ---------------------------------------------------------

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (overlayOpen()) return;
      const typing = isTyping(e.target);
      const typingElsewhere = typing && e.target !== scanRef.current;
      switch (e.key) {
        case "F2":
          e.preventDefault();
          setSearch({ open: true, query: "" });
          return;
        case "F3":
          e.preventDefault();
          setCustomerOpen(true);
          return;
        case "F4":
          e.preventDefault();
          if (items.length) setGlobalDiscountOpen(true);
          return;
        case "F6":
          e.preventDefault();
          setCustomOpen(true);
          return;
        case "F7":
          e.preventDefault();
          startQuote();
          return;
        case "F8":
          e.preventDefault();
          setCashMove("suprimento");
          return;
        case "F9":
          e.preventDefault();
          startCheckout();
          return;
        case "F10":
          e.preventDefault();
          setCashMove("retirada");
          return;
        case "Escape":
          if (e.target === scanRef.current && scan) {
            e.preventDefault();
            setScan("");
            return;
          }
          if (items.length) {
            e.preventDefault();
            setClearOpen(true);
          }
          return;
      }
      if (typingElsewhere || !items.length) return;
      // Navegação no carrinho (fora de campos de texto, ou no campo de leitura vazio).
      if (typing && scan) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelected((s) => Math.min(items.length - 1, s + 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelected((s) => Math.max(0, s - 1));
      } else if (e.key === "+" || e.key === "=") {
        e.preventDefault();
        const it = items[selected];
        if (it) changeQty(selected, it.qty + 1);
      } else if (e.key === "-") {
        e.preventDefault();
        const it = items[selected];
        if (it && it.qty > 1) changeQty(selected, it.qty - 1);
      } else if (e.key === "Delete") {
        e.preventDefault();
        removeItem(selected);
      } else if (e.key === "*" || (e.key.toLowerCase() === "d" && !typing)) {
        e.preventDefault();
        setItemDiscountIndex(selected);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [items, selected, scan, changeQty, removeItem, startCheckout, startQuote]);

  // Mantém o foco no campo de leitura (leitor de código de barras).
  useEffect(() => {
    focusScan();
  }, [focusScan]);

  const discountItem = itemDiscountIndex !== null ? items[itemDiscountIndex] : undefined;

  return (
    <>
      <CashSessionBar
        summary={summary}
        onSupply={() => setCashMove("suprimento")}
        onWithdraw={() => setCashMove("retirada")}
        onClose={() => {
          if (items.length) {
            toast.warning("Finalize ou limpe a venda em andamento antes de fechar o caixa.");
            return;
          }
          setCloseOpen(true);
        }}
      />

      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        {/* Carrinho */}
        <section className="flex min-h-[420px] flex-col overflow-hidden rounded-xl border bg-card lg:min-h-0">
          <div className="flex flex-col gap-3 border-b p-3 sm:flex-row sm:items-center">
            <form
              className="flex-1"
              onSubmit={(e) => {
                e.preventDefault();
                submitScan();
              }}
            >
              <InputGroup className="h-11 bg-background">
                <InputGroupAddon>
                  <Barcode className="size-5" />
                </InputGroupAddon>
                <InputGroupInput
                  ref={scanRef}
                  value={scan}
                  onChange={(e) => setScan(e.target.value)}
                  placeholder="Leia o código de barras ou digite SKU / nome e Enter"
                  aria-label="Código de barras, SKU ou nome do produto"
                  className="text-base"
                  autoComplete="off"
                />
                <InputGroupAddon align="inline-end">
                  <InputGroupButton size="sm" variant="ghost" onClick={() => setSearch({ open: true, query: scan })}>
                    <Search />
                    Buscar
                    <Kbd>F2</Kbd>
                  </InputGroupButton>
                </InputGroupAddon>
              </InputGroup>
            </form>
            <Button variant="outline" className="h-11" onClick={() => setCustomOpen(true)}>
              <PackagePlus />
              Item avulso
              <Kbd>F6</Kbd>
            </Button>
          </div>

          <div className="flex items-center justify-between px-4 py-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5 font-medium">
              <ShoppingCart className="size-3.5" />
              {itemCount} {itemCount === 1 ? "item" : "itens"} · {formatNumber(unitsCount)} un.
            </span>
            {itemCount > 0 && (
              <span className="hidden items-center gap-2 md:flex">
                <Kbd>↑↓</Kbd> selecionar <Kbd>+</Kbd>
                <Kbd>−</Kbd> qtd. <Kbd>*</Kbd> desconto <Kbd>Del</Kbd> remover
              </span>
            )}
          </div>
          <Separator />

          <ScrollArea className="min-h-0 flex-1">
            {productsQuery.isPending ? (
              <div className="space-y-2 p-4">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : (
              <CartTable
                items={items}
                selected={selected}
                onSelect={setSelected}
                stockOf={(item) => (isCustomItem(item) ? undefined : productMap.get(item.id)?.quantity)}
                onQtyChange={changeQty}
                onDiscount={setItemDiscountIndex}
                onRemove={removeItem}
              />
            )}
          </ScrollArea>
        </section>

        {/* Resumo */}
        <aside className="flex flex-col gap-4 rounded-xl border bg-card p-4">
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">Cliente</p>
            <CustomerPicker
              customers={customers}
              value={customerId}
              onChange={setCustomerId}
              open={customerOpen}
              onOpenChange={(open) => {
                setCustomerOpen(open);
                if (!open) focusScan();
              }}
              loading={customersQuery.isPending}
            />
          </div>

          <Separator />

          <dl className="space-y-2 text-sm">
            <TotalRow label="Subtotal" value={formatCurrency(totals.grossSubtotal)} />
            <TotalRow
              label="Desconto nos itens"
              value={totals.itemsDiscountTotal ? `−${formatCurrency(totals.itemsDiscountTotal)}` : formatCurrency(0)}
              muted={!totals.itemsDiscountTotal}
            />
            <div className="flex items-center justify-between gap-2">
              <dt className="flex items-center gap-2 text-muted-foreground">
                Desconto geral
                {globalDiscount.discount > 0 && globalDiscount.discountType === "percent" && (
                  <span className="tabular text-xs">({formatNumber(globalDiscount.discount)}%)</span>
                )}
              </dt>
              <dd className="flex items-center gap-1">
                <span className={cn("tabular", !totals.globalDiscountAmount && "text-muted-foreground")}>
                  {totals.globalDiscountAmount ? `−${formatCurrency(totals.globalDiscountAmount)}` : formatCurrency(0)}
                </span>
                <Button
                  size="xs"
                  variant="ghost"
                  disabled={!items.length}
                  onClick={() => setGlobalDiscountOpen(true)}
                  aria-label="Aplicar desconto geral"
                >
                  <Percent />
                  <Kbd>F4</Kbd>
                </Button>
              </dd>
            </div>
          </dl>

          <div className="rounded-xl bg-primary/8 px-4 py-4">
            <p className="text-xs font-medium text-muted-foreground">Total</p>
            <p className="tabular text-4xl font-semibold tracking-tight text-primary">{formatCurrency(totals.total)}</p>
            {totals.totalDiscount > 0 && (
              <p className="tabular mt-1 text-xs text-success">Economia de {formatCurrency(totals.totalDiscount)}</p>
            )}
          </div>

          <div className="mt-auto grid gap-2">
            <Button size="lg" className="h-12 text-base" disabled={!items.length} onClick={startCheckout}>
              Finalizar venda
              <Kbd className="ml-1 bg-primary-foreground/20 text-primary-foreground">F9</Kbd>
            </Button>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" disabled={!items.length || saleMutation.isPending} onClick={startQuote}>
                <FileText />
                Orçamento
                <Kbd>F7</Kbd>
              </Button>
              <Button variant="ghost" disabled={!items.length} onClick={() => setClearOpen(true)}>
                <Eraser />
                Limpar
                <Kbd>Esc</Kbd>
              </Button>
            </div>
          </div>
        </aside>
      </div>

      {/* Diálogos */}
      <ProductSearchDialog
        open={search.open}
        onOpenChange={(open) => {
          setSearch((s) => ({ ...s, open }));
          if (!open) focusScan();
        }}
        products={products}
        inCart={inCart}
        initialQuery={search.query}
        onSelect={addProduct}
      />

      <CustomItemDialog
        open={customOpen}
        onOpenChange={(open) => {
          setCustomOpen(open);
          if (!open) focusScan();
        }}
        onAdd={(item) => {
          setItems((prev) => [...prev, item]);
          setSelected(items.length);
        }}
      />

      <DiscountDialog
        open={globalDiscountOpen}
        onOpenChange={(open) => {
          setGlobalDiscountOpen(open);
          if (!open) focusScan();
        }}
        title="Desconto geral"
        description={`Aplicado sobre ${formatCurrency(totals.subtotal)} (subtotal com descontos dos itens).`}
        base={totals.subtotal}
        value={globalDiscount}
        onApply={setGlobalDiscount}
      />

      <DiscountDialog
        open={itemDiscountIndex !== null && !!discountItem}
        onOpenChange={(open) => {
          if (!open) {
            setItemDiscountIndex(null);
            focusScan();
          }
        }}
        title={discountItem ? `Desconto · ${discountItem.name}` : "Desconto no item"}
        description={
          discountItem
            ? `${formatNumber(discountItem.qty)} ${discountItem.unit} × ${formatCurrency(discountItem.price)} = ${formatCurrency(discountItem.qty * discountItem.price)}`
            : undefined
        }
        base={discountItem ? discountItem.qty * discountItem.price : 0}
        value={discountItem ? { discount: discountItem.discount, discountType: discountItem.discountType } : globalDiscount}
        onApply={(value) => {
          const index = itemDiscountIndex;
          if (index === null) return;
          setItems((prev) => prev.map((it, i) => (i === index ? { ...it, ...value } : it)));
        }}
      />

      <CheckoutDialog
        open={checkoutOpen}
        onOpenChange={(open) => {
          setCheckoutOpen(open);
          if (!open) focusScan();
        }}
        total={totals.total}
        itemCount={itemCount}
        customerName={customer?.name}
        defaultMethod={company?.defaultPaymentMethod === "Crediário" ? "Dinheiro" : company?.defaultPaymentMethod}
        pending={saleMutation.isPending}
        onConfirm={(payment) => saleMutation.mutate({ status: "FINALIZED", payment })}
      />

      <ConfirmDialog
        open={quoteOpen}
        onOpenChange={setQuoteOpen}
        title="Salvar como orçamento?"
        description={
          <>
            O orçamento de <strong>{formatCurrency(totals.total)}</strong>
            {customer ? ` para ${customer.name}` : ""} fica registrado no histórico e pode ser convertido em venda
            depois. O estoque não é movimentado.
          </>
        }
        confirmLabel={saleMutation.isPending ? "Salvando…" : "Salvar orçamento"}
        onConfirm={() => saleMutation.mutate({ status: "QUOTE" })}
      />

      <ConfirmDialog
        open={clearOpen}
        onOpenChange={(open) => {
          setClearOpen(open);
          if (!open) focusScan();
        }}
        title="Limpar venda?"
        description="Todos os itens, descontos e o cliente selecionado serão removidos."
        confirmLabel="Limpar"
        destructive
        onConfirm={resetSale}
      />

      <CashMovementDialog
        type={cashMove}
        summary={summary}
        onOpenChange={(open) => {
          if (!open) {
            setCashMove(null);
            focusScan();
          }
        }}
      />

      <CloseCashDialog open={closeOpen} onOpenChange={setCloseOpen} summary={summary} />

      <ReceiptDialog
        sale={receipt.sale}
        open={receipt.open}
        success
        onOpenChange={(open) => {
          setReceipt((r) => ({ ...r, open }));
          if (!open) focusScan();
        }}
        onNewSale={() => {
          setReceipt((r) => ({ ...r, open: false }));
          focusScan();
        }}
      />

      {saleMutation.isPending && !checkoutOpen && (
        <div className="fixed right-6 bottom-6 z-50 flex items-center gap-2 rounded-lg border bg-popover px-3 py-2 text-sm shadow-md">
          <Spinner /> Processando…
        </div>
      )}
    </>
  );
}

function TotalRow({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={cn("tabular", muted && "text-muted-foreground")}>{value}</dd>
    </div>
  );
}
