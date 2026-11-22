"use client";

import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

export type SortDir = "asc" | "desc";

export function SortButton<K extends string>({
  column,
  label,
  sort,
  onSort,
  className,
}: {
  column: K;
  label: string;
  sort: { key: K; dir: SortDir };
  onSort: (key: K) => void;
  className?: string;
}) {
  const active = sort.key === column;
  const Icon = !active ? ArrowUpDown : sort.dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <button
      type="button"
      onClick={() => onSort(column)}
      className={cn(
        "-mx-1 inline-flex items-center gap-1 rounded px-1 py-0.5 hover:text-foreground",
        active && "text-foreground",
        className,
      )}
    >
      {label}
      <Icon className={cn("size-3.5", !active && "opacity-40")} />
    </button>
  );
}

export function TablePagination({
  page,
  pageSize,
  total,
  onPageChange,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total ? (page - 1) * pageSize + 1 : 0;
  const to = Math.min(total, page * pageSize);
  return (
    <div className="flex items-center justify-between gap-4 px-1 text-sm text-muted-foreground">
      <span className="tabular">
        {formatNumber(from)}–{formatNumber(to)} de {formatNumber(total)}
      </span>
      <div className="flex items-center gap-2">
        <span className="tabular hidden sm:inline">
          Página {page} de {pages}
        </span>
        <Button
          variant="outline"
          size="icon-sm"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          aria-label="Página anterior"
        >
          <ChevronLeft />
        </Button>
        <Button
          variant="outline"
          size="icon-sm"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= pages}
          aria-label="Próxima página"
        >
          <ChevronRight />
        </Button>
      </div>
    </div>
  );
}

/** Ordena uma lista por uma chave textual ou numérica. */
export function sortBy<T>(list: T[], get: (item: T) => string | number, dir: SortDir) {
  const factor = dir === "asc" ? 1 : -1;
  return [...list].sort((a, b) => {
    const va = get(a);
    const vb = get(b);
    if (typeof va === "number" && typeof vb === "number") return (va - vb) * factor;
    return String(va).localeCompare(String(vb), "pt-BR", { numeric: true }) * factor;
  });
}
