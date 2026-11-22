import { StatusBadge, type StatusTone } from "@/components/status-badge";
import { STOCK_STATUS_LABEL } from "@/lib/domain/calc";
import type { StockMovementType, StockStatus } from "@/lib/domain/types";

const STATUS_TONE: Record<StockStatus, StatusTone> = {
  ok: "success",
  low: "warning",
  out: "destructive",
  over: "info",
};

export function StockStatusBadge({ status }: { status: StockStatus }) {
  return <StatusBadge tone={STATUS_TONE[status]}>{STOCK_STATUS_LABEL[status]}</StatusBadge>;
}

export const MOVEMENT_LABEL: Record<StockMovementType, string> = {
  ENTRADA: "Entrada",
  SAIDA: "Saída",
  VENDA: "Venda",
  AJUSTE: "Ajuste",
  ESTORNO: "Estorno",
};

const MOVEMENT_TONE: Record<StockMovementType, StatusTone> = {
  ENTRADA: "success",
  SAIDA: "destructive",
  VENDA: "info",
  AJUSTE: "warning",
  ESTORNO: "neutral",
};

export function MovementTypeBadge({ type }: { type: StockMovementType }) {
  return <StatusBadge tone={MOVEMENT_TONE[type]}>{MOVEMENT_LABEL[type]}</StatusBadge>;
}
