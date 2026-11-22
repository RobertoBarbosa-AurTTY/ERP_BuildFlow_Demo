"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Database, Download, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { errorMessage } from "@/lib/errors";
import { formatNumber, toDateInput } from "@/lib/format";
import { exportMockData, restoreDemoData } from "@/lib/services/settings";

const LABELS: Record<string, string> = {
  products: "Produtos",
  categories: "Categorias",
  stock_movements: "Movimentações de estoque",
  warehouse_addresses: "Endereços do depósito",
  customers: "Clientes",
  sales: "Vendas",
  accounts_payable: "Contas a pagar",
  accounts_receivable: "Contas a receber",
  cash_sessions: "Sessões de caixa",
  cash_movements: "Sangrias e suprimentos",
  settings: "Configurações",
};

export function DataTab() {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const snapshot = useQuery({ queryKey: ["settings", "data-snapshot"], queryFn: exportMockData });

  const download = useMutation({
    mutationFn: exportMockData,
    onSuccess: (data) => {
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `buildflow-dados-${toDateInput()}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      toast.success("Backup exportado", { description: link.download });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const restore = useMutation({
    mutationFn: restoreDemoData,
    onSuccess: () => {
      toast.success("Dados de demonstração restaurados", { description: "Recarregando…" });
      setTimeout(() => window.location.reload(), 600);
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const entries = Object.entries(snapshot.data?.data ?? {});

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="size-4 text-muted-foreground" />
            Exportar dados
          </CardTitle>
          <CardDescription>
            Baixe um arquivo JSON com todos os registros salvos neste navegador.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {snapshot.isPending ? (
            <div className="grid grid-cols-2 gap-2">
              {Array.from({ length: 8 }, (_, i) => (
                <Skeleton key={i} className="h-9" />
              ))}
            </div>
          ) : (
            <dl className="grid grid-cols-2 gap-2 text-sm">
              {entries.map(([name, items]) => (
                <div key={name} className="flex items-center justify-between rounded-md bg-muted/40 px-3 py-2">
                  <dt className="truncate text-muted-foreground">{LABELS[name] ?? name}</dt>
                  <dd className="tabular font-medium">{formatNumber(items.length)}</dd>
                </div>
              ))}
            </dl>
          )}
        </CardContent>
        <CardFooter className="border-t">
          <Button onClick={() => download.mutate()} disabled={download.isPending}>
            {download.isPending ? <Spinner /> : <Download />}
            Exportar JSON
          </Button>
        </CardFooter>
      </Card>

      <Card className="ring-destructive/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <RotateCcw className="size-4" />
            Restaurar dados de demonstração
          </CardTitle>
          <CardDescription>
            Apaga tudo o que foi criado ou alterado neste navegador (vendas, contas, clientes, estoque e configurações)
            e volta ao conjunto de dados original.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Dica: exporte um backup antes, caso queira consultar os registros depois. Sua sessão de login é mantida.
        </CardContent>
        <CardFooter className="border-t">
          <Button variant="destructive" onClick={() => setConfirmOpen(true)} disabled={restore.isPending}>
            {restore.isPending ? <Spinner /> : <RotateCcw />}
            Restaurar dados
          </Button>
        </CardFooter>
      </Card>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        destructive
        title="Restaurar dados de demonstração?"
        description="Todas as alterações feitas neste navegador serão perdidas. Esta ação não pode ser desfeita."
        confirmLabel="Restaurar e recarregar"
        onConfirm={() => restore.mutate()}
      />
    </div>
  );
}
