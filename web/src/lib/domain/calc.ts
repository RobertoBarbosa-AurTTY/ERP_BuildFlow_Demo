import type { BillStatus, DiscountType, Product, SaleItem, StockStatus } from "./types";

export function discountAmount(base: number, discount: number, type: DiscountType) {
  if (!discount || discount <= 0) return 0;
  return type === "value" ? Math.min(discount, base) : base * (Math.min(discount, 100) / 100);
}

export function lineTotals(item: Pick<SaleItem, "qty" | "price" | "discount" | "discountType">) {
  const gross = item.qty * item.price;
  const discount = discountAmount(gross, item.discount, item.discountType);
  return { gross, discount, total: Math.max(0, gross - discount) };
}

/** Mesmo cálculo do PDV legado (normalizeSaleRecord em public/js/main.js). */
export function saleTotals(items: SaleItem[], globalDiscount = 0, globalDiscountType: DiscountType = "percent") {
  const lines = items.map(lineTotals);
  const grossSubtotal = lines.reduce((sum, l) => sum + l.gross, 0);
  const itemsDiscountTotal = lines.reduce((sum, l) => sum + l.discount, 0);
  const subtotal = grossSubtotal - itemsDiscountTotal;
  const globalDiscountAmount = discountAmount(subtotal, globalDiscount, globalDiscountType);
  const total = round2(Math.max(0, subtotal - globalDiscountAmount));
  return {
    grossSubtotal: round2(grossSubtotal),
    itemsDiscountTotal: round2(itemsDiscountTotal),
    subtotal: round2(subtotal),
    globalDiscountAmount: round2(globalDiscountAmount),
    totalDiscount: round2(itemsDiscountTotal + globalDiscountAmount),
    total,
  };
}

export function round2(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function stockStatus(product: Pick<Product, "quantity" | "minStock" | "maxStock">): StockStatus {
  if (product.quantity <= 0) return "out";
  if (product.quantity <= product.minStock) return "low";
  if (product.maxStock > 0 && product.quantity > product.maxStock) return "over";
  return "ok";
}

export const STOCK_STATUS_LABEL: Record<StockStatus, string> = {
  ok: "Em estoque",
  low: "Estoque baixo",
  out: "Sem estoque",
  over: "Acima do máximo",
};

export function margin(product: Pick<Product, "price" | "costPrice">) {
  if (!product.price) return 0;
  return (product.price - product.costPrice) / product.price;
}

export function daysUntil(date: string | undefined) {
  if (!date) return Infinity;
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - start.getTime()) / 86_400_000);
}

/** Status efetivo: pendente com vencimento passado vira "overdue". */
export function billStatus(bill: { status: BillStatus; dueDate: string }): BillStatus {
  if (bill.status === "pending" && daysUntil(bill.dueDate) < 0) return "overdue";
  return bill.status;
}

export const BILL_STATUS_LABEL: Record<BillStatus, string> = {
  pending: "Pendente",
  paid: "Pago",
  overdue: "Vencido",
  cancelled: "Cancelado",
};
