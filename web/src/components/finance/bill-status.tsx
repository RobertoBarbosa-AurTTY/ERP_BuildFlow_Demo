import { CheckCircle2, CircleDashed, CircleX, Clock } from "lucide-react";
import { StatusBadge, type StatusTone } from "@/components/status-badge";
import { BILL_STATUS_LABEL, billStatus } from "@/lib/domain/calc";
import type { BillStatus } from "@/lib/domain/types";
import { cn } from "@/lib/utils";
import { dueInLabel, type BillBase } from "./bill-utils";

const TONE: Record<BillStatus, StatusTone> = {
  pending: "info",
  overdue: "destructive",
  paid: "success",
  cancelled: "neutral",
};

const ICON: Record<BillStatus, React.ComponentType<{ className?: string }>> = {
  pending: Clock,
  overdue: CircleDashed,
  paid: CheckCircle2,
  cancelled: CircleX,
};

export function BillStatusBadge({
  bill,
  paidLabel,
}: {
  bill: { status: BillStatus; dueDate: string };
  /** Ex.: "Recebido" em contas a receber. */
  paidLabel?: string;
}) {
  const status = billStatus(bill);
  const Icon = ICON[status];
  return (
    <StatusBadge tone={TONE[status]}>
      <Icon />
      {status === "paid" && paidLabel ? paidLabel : BILL_STATUS_LABEL[status]}
    </StatusBadge>
  );
}

export function DueIn({ bill, className }: { bill: BillBase; className?: string }) {
  const { text, tone } = dueInLabel(bill);
  return (
    <span
      className={cn(
        "text-xs whitespace-nowrap",
        tone === "muted" && "text-muted-foreground",
        tone === "warning" && "font-medium text-warning",
        tone === "destructive" && "font-medium text-destructive",
        className,
      )}
    >
      {text}
    </span>
  );
}
