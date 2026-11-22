import type { SaleStatus } from "@/lib/domain/types";
import { SALE_STATUS_LABEL } from "@/lib/services/sales";
import { StatusBadge, type StatusTone } from "@/components/status-badge";

const TONE: Record<SaleStatus, StatusTone> = {
  FINALIZED: "success",
  QUOTE: "info",
  CANCELLED: "destructive",
};

export function SaleStatusBadge({ status }: { status: SaleStatus }) {
  return <StatusBadge tone={TONE[status]}>{SALE_STATUS_LABEL[status]}</StatusBadge>;
}
