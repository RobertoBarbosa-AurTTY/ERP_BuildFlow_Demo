import { Banknote, CreditCard, FileText, NotebookPen, QrCode, Wallet, type LucideIcon } from "lucide-react";
import type { PaymentMethod } from "@/lib/domain/types";

export const PAYMENT_ICON: Record<PaymentMethod, LucideIcon> = {
  Dinheiro: Banknote,
  PIX: QrCode,
  "Cartão de Crédito": CreditCard,
  "Cartão de Débito": Wallet,
  Boleto: FileText,
  Crediário: NotebookPen,
};

export const PAYMENT_SHORT: Record<PaymentMethod, string> = {
  Dinheiro: "Dinheiro",
  PIX: "PIX",
  "Cartão de Crédito": "Crédito",
  "Cartão de Débito": "Débito",
  Boleto: "Boleto",
  Crediário: "Crediário",
};
