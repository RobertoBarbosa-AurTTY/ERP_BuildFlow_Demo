"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { ArrowRight, Boxes, MapPin, MapPinOff, MapPinned, PackageX, Plus, Tags, Warehouse } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { PageHeader } from "@/components/page-header";
import { EmptyState, ErrorState } from "@/components/query-state";
import { StatCard } from "@/components/stat-card";
import { StatusBadge } from "@/components/status-badge";
import { AddressPicker } from "@/components/inventory/address-picker";
import { FormField } from "@/components/inventory/form-field";
import { ProductPicker } from "@/components/inventory/product-picker";
import { useAddresses, useInvalidateInventory, useProducts } from "@/components/inventory/queries";
import { aisleKeyOf, WarehouseMap } from "@/components/inventory/warehouse-map";
import type { Product } from "@/lib/domain/types";
import { errorMessage } from "@/lib/errors";
import { formatNumber } from "@/lib/format";
import { assignProductAddress, locationCode, type AddressWithProducts } from "@/lib/services/products";

export function AddressView() {
  const params = useSearchParams();
  const products = useProducts();
  const addresses = useAddresses();
  const invalidate = useInvalidateInventory();

  const [productId, setProductId] = useState<string | null>(() => params.get("product"));
  const [targetId, setTargetId] = useState<string | null>(null);
  const [aisleKey, setAisleKey] = useState<string | undefined>(undefined);
  const [removing, setRemoving] = useState(false);

  const allAddresses = useMemo(() => addresses.data ?? [], [addresses.data]);
  const product = productId ? (products.data?.find((p) => p._id === productId) ?? null) : null;
  const currentAddress = product?.location?.aisle
    ? allAddresses.find((a) => a.code === locationCode(product.location))
    : undefined;
  const target = targetId ? allAddresses.find((a) => a._id === targetId) : undefined;
  const unaddressed = (products.data ?? []).filter((p) => !p.location?.aisle);

  const stats = useMemo(() => {
    const active = allAddresses.filter((a) => a.active);
    const occupied = active.filter((a) => a.products.length).length;
    return { total: active.length, occupied, free: active.length - occupied };
  }, [allAddresses]);

  const selectProduct = (p: Product) => {
    setProductId(p._id);
    setTargetId(null);
    const addr = p.location?.aisle ? allAddresses.find((a) => a.code === locationCode(p.location)) : undefined;
    if (addr) setAisleKey(aisleKeyOf(addr));
  };

  const selectTarget = (a: AddressWithProducts) => {
    if (!a.active) {
      toast.info("Endereço inativo", { description: "Reative-o em Gerenciar endereços para usá-lo." });
      return;
    }
    setTargetId(a._id);
    setAisleKey(aisleKeyOf(a));
  };

  const assign = useMutation({
    mutationFn: (addressId: string | null) => assignProductAddress(productId!, addressId),
    onSuccess: async (p) => {
      await invalidate();
      setTargetId(null);
      toast.success(p.location ? "Produto endereçado" : "Endereço removido", {
        description: p.location ? `${p.name} → ${locationCode(p.location)}` : p.name,
      });
    },
    onError: (error) => toast.error("Não foi possível endereçar", { description: errorMessage(error) }),
  });

  const loading = products.isLoading || addresses.isLoading;
  const error = products.error ?? addresses.error;

  return (
    <>
      <PageHeader
        title="Endereçar produtos"
        description="Defina a posição física de cada produto no depósito."
        actions={
          <>
            <Button variant="outline" asChild>
              <Link href="/shelf-label">
                <Tags /> Placas de prateleira
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/new-address">
                <Plus /> Criar endereços
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

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Endereços ativos" icon={Warehouse} loading={loading} value={formatNumber(stats.total)} />
        <StatCard label="Ocupados" icon={MapPinned} loading={loading} value={formatNumber(stats.occupied)}
          hint={stats.total ? `${Math.round((stats.occupied / stats.total) * 100)}% de ocupação` : undefined} />
        <StatCard label="Livres" icon={MapPin} tone="success" loading={loading} value={formatNumber(stats.free)} />
        <StatCard label="Produtos sem endereço" icon={MapPinOff} tone="warning" loading={loading} value={formatNumber(unaddressed.length)} />
      </div>

      {error ? (
        <ErrorState
          error={error}
          onRetry={() => {
            void products.refetch();
            void addresses.refetch();
          }}
        />
      ) : (
        <div className="grid gap-4 xl:grid-cols-[22rem_minmax(0,1fr)]">
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Endereçamento</CardTitle>
                <CardDescription>Escolha o produto e o novo endereço — pela lista ou clicando no mapa.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <FormField label="Produto" htmlFor="addr-product">
                  <ProductPicker id="addr-product" value={productId} onSelect={selectProduct} />
                </FormField>

                {product && (
                  <div className="rounded-lg border bg-muted/30 p-3 text-sm">
                    <p className="font-medium">{product.name}</p>
                    <p className="font-mono text-xs text-muted-foreground">
                      {product.sku} · {formatNumber(product.quantity)} {product.unit}
                    </p>
                    <div className="mt-3 flex items-center gap-2 text-xs">
                      <span className="text-muted-foreground">Atual</span>
                      {product.location?.aisle ? (
                        <StatusBadge tone="success" className="font-mono">
                          {locationCode(product.location)}
                        </StatusBadge>
                      ) : (
                        <StatusBadge tone="warning">Sem endereço</StatusBadge>
                      )}
                      {target && (
                        <>
                          <ArrowRight className="size-3.5 text-muted-foreground" />
                          <StatusBadge tone="info" className="font-mono">
                            {target.code}
                          </StatusBadge>
                        </>
                      )}
                    </div>
                  </div>
                )}

                <FormField label="Novo endereço" htmlFor="addr-target">
                  <AddressPicker id="addr-target" addresses={allAddresses} value={targetId} onSelect={selectTarget} />
                </FormField>

                {target && target.products.filter((p) => p._id !== productId).length > 0 && (
                  <p className="rounded-md bg-warning/15 px-3 py-2 text-xs text-warning">
                    Este endereço já contém: {target.products.filter((p) => p._id !== productId).map((p) => p.name).join(", ")}.
                  </p>
                )}

                <div className="flex flex-col gap-2 sm:flex-row xl:flex-col">
                  <Button
                    className="flex-1"
                    disabled={!product || !target || target._id === currentAddress?._id || assign.isPending}
                    onClick={() => target && assign.mutate(target._id)}
                  >
                    {assign.isPending && <Spinner />}
                    <MapPinned /> Endereçar produto
                  </Button>
                  {product?.location?.aisle && (
                    <Button variant="outline" className="flex-1" onClick={() => setRemoving(true)} disabled={assign.isPending}>
                      <MapPinOff /> Remover endereço
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card className="gap-3">
              <CardHeader>
                <CardTitle className="text-sm">Sem endereço</CardTitle>
                <CardDescription>Produtos ativos sem posição definida.</CardDescription>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <Skeleton className="h-24 w-full" />
                ) : !unaddressed.length ? (
                  <p className="text-sm text-muted-foreground">Todos os produtos estão endereçados.</p>
                ) : (
                  <ul className="max-h-64 divide-y overflow-y-auto">
                    {unaddressed.map((p) => (
                      <li key={p._id} className="flex items-center justify-between gap-2 py-2">
                        <span className="min-w-0">
                          <span className="block truncate text-sm">{p.name}</span>
                          <span className="font-mono text-xs text-muted-foreground">{p.sku}</span>
                        </span>
                        <Button size="xs" variant="outline" onClick={() => selectProduct(p)}>
                          Selecionar
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>

          <Card className="min-w-0">
            <CardHeader>
              <CardTitle>Mapa do depósito</CardTitle>
              <CardDescription>Clique em uma posição para selecioná-la como destino.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {loading ? (
                <Skeleton className="h-72 w-full" />
              ) : !allAddresses.length ? (
                <EmptyState icon={PackageX} title="Nenhum endereço cadastrado" description="Crie os endereços do depósito para começar.">
                  <Button asChild>
                    <Link href="/new-address">
                      <Plus /> Criar endereços
                    </Link>
                  </Button>
                </EmptyState>
              ) : (
                <>
                  <WarehouseMap
                    addresses={allAddresses}
                    selectedId={targetId}
                    highlightId={currentAddress?._id}
                    onSelect={selectTarget}
                    aisleKey={aisleKey ?? (currentAddress ? aisleKeyOf(currentAddress) : undefined)}
                    onAisleChange={setAisleKey}
                  />
                  {target && (
                    <div className="rounded-lg border p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-mono text-sm font-medium">{target.code}</p>
                        <span className="text-xs text-muted-foreground">
                          {target.description ?? `Capacidade ${target.capacity ?? "—"}`}
                        </span>
                      </div>
                      {target.products.length ? (
                        <ul className="mt-2 space-y-1 text-sm">
                          {target.products.map((p) => (
                            <li key={p._id} className="flex justify-between gap-2">
                              <span className="truncate">{p.name}</span>
                              <span className="tabular shrink-0 text-muted-foreground">
                                {formatNumber(p.quantity)} {p.unit}
                              </span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="mt-1 text-sm text-muted-foreground">Posição livre.</p>
                      )}
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      <ConfirmDialog
        open={removing}
        onOpenChange={setRemoving}
        title="Remover endereço do produto?"
        description={product ? `${product.name} ficará sem posição definida no depósito.` : undefined}
        confirmLabel="Remover"
        destructive
        onConfirm={() => {
          assign.mutate(null);
          setRemoving(false);
        }}
      />
    </>
  );
}
