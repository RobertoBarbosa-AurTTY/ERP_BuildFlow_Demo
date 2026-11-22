"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useMutation } from "@tanstack/react-query";
import {
  Layers,
  MapPinned,
  MoreHorizontal,
  Plus,
  Power,
  PowerOff,
  Search,
  SearchX,
  Tags,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { PageHeader } from "@/components/page-header";
import { EmptyState, ErrorState } from "@/components/query-state";
import { StatusBadge } from "@/components/status-badge";
import { FormField } from "@/components/inventory/form-field";
import { useAddresses, useInvalidateInventory } from "@/components/inventory/queries";
import { TablePagination } from "@/components/inventory/table-tools";
import { errorMessage } from "@/lib/errors";
import { formatNumber } from "@/lib/format";
import {
  createAddress,
  createAddressBatch,
  deleteAddress,
  locationCode,
  setAddressActive,
  type AddressWithProducts,
} from "@/lib/services/products";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 20;

export function NewAddressView() {
  return (
    <>
      <PageHeader
        title="Endereços do depósito"
        description="Cadastre posições individuais ou gere corredores inteiros de uma vez."
        actions={
          <>
            <Button variant="outline" asChild>
              <Link href="/address">
                <MapPinned /> Endereçar produtos
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/shelf-label">
                <Tags /> Placas de prateleira
              </Link>
            </Button>
          </>
        }
      />
      <Card>
        <CardContent>
          <Tabs defaultValue="single" className="gap-5">
            <TabsList>
              <TabsTrigger value="single">
                <Plus /> Endereço único
              </TabsTrigger>
              <TabsTrigger value="batch">
                <Layers /> Criar em lote
              </TabsTrigger>
            </TabsList>
            <TabsContent value="single">
              <SingleForm />
            </TabsContent>
            <TabsContent value="batch">
              <BatchForm />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
      <AddressTable />
    </>
  );
}

function pad(value: string) {
  const v = value.trim().toUpperCase();
  return /^\d+$/.test(v) ? v.padStart(2, "0") : v;
}

type SingleErrors = Partial<Record<"aisle" | "shelf" | "level" | "slot" | "capacity", string>>;

function SingleForm() {
  const invalidate = useInvalidateInventory();
  const [form, setForm] = useState({ deposit: "DEPÓSITO 01", aisle: "", shelf: "", level: "", slot: "", description: "", capacity: "" });
  const [errors, setErrors] = useState<SingleErrors>({});
  const set = (key: keyof typeof form, value: string) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  };
  const code = locationCode({
    deposit: form.deposit,
    aisle: form.aisle.toUpperCase(),
    shelf: pad(form.shelf),
    level: pad(form.level),
    slot: pad(form.slot),
  });

  const mutation = useMutation({
    mutationFn: () =>
      createAddress({
        ...form,
        capacity: form.capacity ? Number(form.capacity) : undefined,
      }),
    onSuccess: async (address) => {
      await invalidate();
      toast.success("Endereço criado", { description: address.code });
      // Avança a posição para agilizar o cadastro sequencial.
      setForm((f) => ({ ...f, slot: /^\d+$/.test(f.slot) ? pad(String(Number(f.slot) + 1)) : f.slot, description: "" }));
    },
    onError: (error) => toast.error("Não foi possível criar", { description: errorMessage(error) }),
  });

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const found: SingleErrors = {};
    if (!form.aisle.trim()) found.aisle = "Obrigatório";
    if (!form.shelf.trim()) found.shelf = "Obrigatório";
    if (!form.level.trim()) found.level = "Obrigatório";
    if (!form.slot.trim()) found.slot = "Obrigatório";
    if (form.capacity && !(Number(form.capacity) > 0)) found.capacity = "Valor inválido";
    setErrors(found);
    if (!Object.keys(found).length) mutation.mutate();
  };

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
        <FormField label="Depósito" htmlFor="na-deposit" className="col-span-2 md:col-span-1">
          <Input id="na-deposit" value={form.deposit} onChange={(e) => set("deposit", e.target.value)} />
        </FormField>
        {(
          [
            ["aisle", "Corredor", "A"],
            ["shelf", "Prateleira", "01"],
            ["level", "Nível", "01"],
            ["slot", "Posição", "01"],
          ] as const
        ).map(([key, label, ph]) => (
          <FormField key={key} label={label} htmlFor={`na-${key}`} required error={errors[key]}>
            <Input
              id={`na-${key}`}
              value={form[key]}
              onChange={(e) => set(key, e.target.value.toUpperCase())}
              aria-invalid={!!errors[key]}
              placeholder={ph}
              maxLength={4}
              className="font-mono uppercase"
            />
          </FormField>
        ))}
        <FormField label="Descrição / setor" htmlFor="na-desc" className="col-span-2 md:col-span-3">
          <Input id="na-desc" value={form.description} onChange={(e) => set("description", e.target.value)} placeholder="Ex.: Setor hidráulica" />
        </FormField>
        <FormField label="Capacidade" htmlFor="na-cap" error={errors.capacity} className="col-span-2 md:col-span-2">
          <Input
            id="na-cap"
            value={form.capacity}
            onChange={(e) => set("capacity", e.target.value.replace(/\D/g, ""))}
            aria-invalid={!!errors.capacity}
            inputMode="numeric"
            placeholder="Unidades (opcional)"
          />
        </FormField>
      </div>
      <div className="flex flex-col gap-3 rounded-lg bg-muted/50 p-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          Código gerado:{" "}
          <span className="font-mono font-medium text-foreground">{form.aisle ? code : "—"}</span>
        </p>
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending && <Spinner />}
          <Plus /> Criar endereço
        </Button>
      </div>
    </form>
  );
}

/** "A-D" → [A,B,C,D]; "A,C,F" → [A,C,F]; "1-3" → [01,02,03]. */
function parseAisles(value: string): string[] | null {
  const parts = value
    .toUpperCase()
    .split(/[,;\s]+/)
    .filter(Boolean);
  const out: string[] = [];
  for (const part of parts) {
    const range = part.match(/^([A-Z]|\d+)-([A-Z]|\d+)$/);
    if (range) {
      const [, a, b] = range;
      if (/^\d+$/.test(a) && /^\d+$/.test(b)) {
        for (let i = Number(a); i <= Number(b); i++) out.push(String(i).padStart(2, "0"));
      } else if (/^[A-Z]$/.test(a) && /^[A-Z]$/.test(b)) {
        for (let c = a.charCodeAt(0); c <= b.charCodeAt(0); c++) out.push(String.fromCharCode(c));
      } else return null;
    } else if (/^[A-Z0-9]{1,4}$/.test(part)) out.push(part);
    else return null;
  }
  return out.length ? [...new Set(out)] : null;
}

type BatchErrors = Partial<Record<"aisles" | "shelves" | "levels" | "slots", string>>;

function BatchForm() {
  const invalidate = useInvalidateInventory();
  const [form, setForm] = useState({ deposit: "DEPÓSITO 01", aisles: "G-H", shelves: "2", levels: "3", slots: "4", capacity: "" });
  const [errors, setErrors] = useState<BatchErrors>({});
  const set = (key: keyof typeof form, value: string) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  };
  const aisles = parseAisles(form.aisles);
  const counts = { shelves: Number(form.shelves) || 0, levels: Number(form.levels) || 0, slots: Number(form.slots) || 0 };
  const total = (aisles?.length ?? 0) * counts.shelves * counts.levels * counts.slots;
  const first = aisles && total ? locationCode({ deposit: form.deposit, aisle: aisles[0], shelf: "01", level: "01", slot: "01" }) : "";
  const last =
    aisles && total
      ? locationCode({
          deposit: form.deposit,
          aisle: aisles[aisles.length - 1],
          shelf: pad(String(counts.shelves)),
          level: pad(String(counts.levels)),
          slot: pad(String(counts.slots)),
        })
      : "";

  const mutation = useMutation({
    mutationFn: () =>
      createAddressBatch({
        deposit: form.deposit,
        aisles: aisles ?? [],
        ...counts,
        capacity: form.capacity ? Number(form.capacity) : undefined,
      }),
    onSuccess: async ({ created, skipped }) => {
      await invalidate();
      toast.success(`${formatNumber(created)} endereços criados`, {
        description: skipped ? `${formatNumber(skipped)} já existiam e foram mantidos.` : undefined,
      });
    },
    onError: (error) => toast.error("Não foi possível gerar o lote", { description: errorMessage(error) }),
  });

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const found: BatchErrors = {};
    if (!aisles) found.aisles = "Use letras/números, ex.: A-D ou A,B,F";
    (["shelves", "levels", "slots"] as const).forEach((k) => {
      if (!(counts[k] >= 1 && counts[k] <= 99)) found[k] = "Entre 1 e 99";
    });
    if (!found.aisles && total > 2000) found.aisles = "Máximo de 2.000 endereços por lote";
    setErrors(found);
    if (!Object.keys(found).length) mutation.mutate();
  };

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-6">
        <FormField label="Depósito" htmlFor="nb-deposit" className="col-span-2 md:col-span-1">
          <Input id="nb-deposit" value={form.deposit} onChange={(e) => set("deposit", e.target.value)} />
        </FormField>
        <FormField label="Corredores" htmlFor="nb-aisles" required error={errors.aisles} description="Ex.: A-D ou A,C,F" className="col-span-2 md:col-span-1">
          <Input
            id="nb-aisles"
            value={form.aisles}
            onChange={(e) => set("aisles", e.target.value.toUpperCase())}
            aria-invalid={!!errors.aisles}
            className="font-mono uppercase"
          />
        </FormField>
        {(
          [
            ["shelves", "Prateleiras"],
            ["levels", "Níveis"],
            ["slots", "Posições/nível"],
          ] as const
        ).map(([key, label]) => (
          <FormField key={key} label={label} htmlFor={`nb-${key}`} required error={errors[key]}>
            <Input
              id={`nb-${key}`}
              value={form[key]}
              onChange={(e) => set(key, e.target.value.replace(/\D/g, ""))}
              aria-invalid={!!errors[key]}
              inputMode="numeric"
              className="tabular"
            />
          </FormField>
        ))}
        <FormField label="Capacidade" htmlFor="nb-cap">
          <Input
            id="nb-cap"
            value={form.capacity}
            onChange={(e) => set("capacity", e.target.value.replace(/\D/g, ""))}
            inputMode="numeric"
            placeholder="Opcional"
          />
        </FormField>
      </div>
      <div className="flex flex-col gap-3 rounded-lg bg-muted/50 p-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          {total ? (
            <>
              <span className="tabular font-medium text-foreground">{formatNumber(total)}</span> endereços — de{" "}
              <span className="font-mono text-foreground">{first}</span> até <span className="font-mono text-foreground">{last}</span>.
              Existentes são ignorados.
            </>
          ) : (
            "Preencha o intervalo para ver a prévia."
          )}
        </p>
        <Button type="submit" disabled={mutation.isPending || !total}>
          {mutation.isPending && <Spinner />}
          <Layers /> Gerar endereços
        </Button>
      </div>
    </form>
  );
}

type StatusFilter = "all" | "free" | "occupied" | "inactive";

function AddressTable() {
  const { data = [], isLoading, error, refetch } = useAddresses();
  const invalidate = useInvalidateInventory();
  const [search, setSearch] = useState("");
  const [aisle, setAisle] = useState("all");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [page, setPage] = useState(1);
  const [deleting, setDeleting] = useState<AddressWithProducts | null>(null);

  const aisles = useMemo(() => [...new Set(data.map((a) => a.aisle))].sort(), [data]);
  const filtered = useMemo(() => {
    const term = search.trim().toUpperCase();
    return data.filter((a) => {
      if (term && !a.code.includes(term) && !(a.description ?? "").toUpperCase().includes(term) && !a.products.some((p) => p.name.toUpperCase().includes(term)))
        return false;
      if (aisle !== "all" && a.aisle !== aisle) return false;
      if (status === "inactive") return !a.active;
      if (status === "free") return a.active && !a.products.length;
      if (status === "occupied") return a.products.length > 0;
      return true;
    });
  }, [data, search, aisle, status]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, pages);
  const visible = filtered.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);

  const toggle = useMutation({
    mutationFn: (a: AddressWithProducts) => setAddressActive(a._id, !a.active),
    onSuccess: async (a) => {
      await invalidate();
      toast.success(a.active ? "Endereço reativado" : "Endereço desativado", { description: a.code });
    },
    onError: (e) => toast.error("Não foi possível alterar", { description: errorMessage(e) }),
  });

  const remove = useMutation({
    mutationFn: (a: AddressWithProducts) => deleteAddress(a._id),
    onSuccess: async (_, a) => {
      await invalidate();
      toast.success("Endereço excluído", { description: a.code });
    },
    onError: (e) => toast.error("Não foi possível excluir", { description: errorMessage(e) }),
  });

  return (
    <Card className="gap-0 py-0">
      <CardHeader className="border-b py-4">
        <CardTitle>Endereços cadastrados</CardTitle>
        <CardDescription>{isLoading ? "Carregando…" : `${formatNumber(data.length)} posições no total`}</CardDescription>
      </CardHeader>
      <div className="flex flex-col gap-3 border-b p-4 md:flex-row md:items-center">
        <InputGroup className="md:max-w-xs">
          <InputGroupAddon>
            <Search />
          </InputGroupAddon>
          <InputGroupInput
            placeholder="Código, descrição ou produto"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </InputGroup>
        <div className="flex gap-2">
          <Select
            value={aisle}
            onValueChange={(v) => {
              setAisle(v);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-40" aria-label="Corredor">
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper">
              <SelectItem value="all">Todos os corredores</SelectItem>
              {aisles.map((a) => (
                <SelectItem key={a} value={a}>
                  Corredor {a}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={status}
            onValueChange={(v) => {
              setStatus(v as StatusFilter);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-36" aria-label="Situação">
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper">
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="free">Livres</SelectItem>
              <SelectItem value="occupied">Ocupados</SelectItem>
              <SelectItem value="inactive">Inativos</SelectItem>
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
      ) : !filtered.length ? (
        <div className="p-4">
          <EmptyState icon={SearchX} title="Nenhum endereço encontrado" description="Ajuste os filtros ou crie novos endereços acima." />
        </div>
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-4">Código</TableHead>
                <TableHead className="hidden md:table-cell">Corredor</TableHead>
                <TableHead className="hidden md:table-cell">Prateleira</TableHead>
                <TableHead className="hidden md:table-cell">Nível</TableHead>
                <TableHead className="hidden md:table-cell">Posição</TableHead>
                <TableHead>Produtos</TableHead>
                <TableHead>Situação</TableHead>
                <TableHead className="w-12 pr-4" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((a) => (
                <TableRow key={a._id} className={cn(!a.active && "opacity-60")}>
                  <TableCell className="pl-4">
                    <p className="font-mono font-medium">{a.code}</p>
                    {a.description && <p className="text-xs text-muted-foreground">{a.description}</p>}
                  </TableCell>
                  <TableCell className="hidden font-mono md:table-cell">{a.aisle}</TableCell>
                  <TableCell className="hidden font-mono md:table-cell">{a.shelf}</TableCell>
                  <TableCell className="hidden font-mono md:table-cell">{a.level}</TableCell>
                  <TableCell className="hidden font-mono md:table-cell">{a.slot}</TableCell>
                  <TableCell className="max-w-56">
                    {a.products.length ? (
                      <span className="block truncate text-sm" title={a.products.map((p) => p.name).join(", ")}>
                        {a.products.map((p) => p.name).join(", ")}
                      </span>
                    ) : (
                      <span className="text-sm text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {!a.active ? (
                      <StatusBadge>Inativo</StatusBadge>
                    ) : a.products.length ? (
                      <StatusBadge tone="info">Ocupado</StatusBadge>
                    ) : (
                      <StatusBadge tone="success">Livre</StatusBadge>
                    )}
                  </TableCell>
                  <TableCell className="pr-4">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon-sm" aria-label={`Ações de ${a.code}`}>
                          <MoreHorizontal />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-44">
                        <DropdownMenuItem asChild>
                          <Link href={`/shelf-label?address=${a._id}`}>
                            <Tags /> Imprimir placa
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => toggle.mutate(a)}>
                          {a.active ? <PowerOff /> : <Power />}
                          {a.active ? "Desativar" : "Reativar"}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(a)}>
                          <Trash2 /> Excluir
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="border-t p-3">
            <TablePagination page={current} pageSize={PAGE_SIZE} total={filtered.length} onPageChange={setPage} />
          </div>
        </>
      )}
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Excluir endereço?"
        description={
          deleting?.products.length
            ? `${deleting.code} contém ${deleting.products.length} produto(s). Mova-os antes de excluir.`
            : `O endereço ${deleting?.code ?? ""} será removido permanentemente.`
        }
        confirmLabel="Excluir"
        destructive
        onConfirm={() => {
          if (deleting) remove.mutate(deleting);
          setDeleting(null);
        }}
      />
    </Card>
  );
}
