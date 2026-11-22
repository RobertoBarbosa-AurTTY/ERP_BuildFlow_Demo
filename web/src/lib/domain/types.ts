// Tipos de domínio do BuildFlow, espelhando os documentos do MongoDB
// usados pelas Netlify Functions (netlify/functions/*.js).

export type ISODate = string;

export interface WarehouseLocation {
  deposit: string;
  aisle: string;
  shelf: string;
  level: string;
  slot: string;
}

export type ProductUnit = "UN" | "KG" | "M" | "M2" | "M3" | "L" | "CX" | "SC" | "PC";

export interface Product {
  _id: string;
  name: string;
  sku: string;
  barcode?: string;
  category: string;
  brand?: string;
  supplier?: string;
  unit: ProductUnit;
  quantity: number;
  minStock: number;
  maxStock: number;
  price: number;
  costPrice: number;
  perishable: boolean;
  expiryDate?: ISODate;
  location?: WarehouseLocation;
  active: boolean;
  createdAt: ISODate;
  updatedAt?: ISODate;
}

export type StockStatus = "ok" | "low" | "out" | "over";

export type StockMovementType = "ENTRADA" | "SAIDA" | "VENDA" | "AJUSTE" | "ESTORNO";

export interface StockMovement {
  _id: string;
  productId: string;
  sku: string;
  productName: string;
  type: StockMovementType;
  quantity: number;
  previousQuantity: number;
  newQuantity: number;
  reason?: string;
  reference?: string;
  userName?: string;
  timestamp: ISODate;
}

export interface Customer {
  _id: string;
  name: string;
  cpfCnpj?: string;
  email?: string;
  phone?: string;
  address?: string;
  notes?: string;
  active: boolean;
  createdAt: ISODate;
}

export type PaymentMethod = "Dinheiro" | "PIX" | "Cartão de Crédito" | "Cartão de Débito" | "Boleto" | "Crediário";

export const PAYMENT_METHODS: PaymentMethod[] = [
  "Dinheiro",
  "PIX",
  "Cartão de Crédito",
  "Cartão de Débito",
  "Boleto",
  "Crediário",
];

export type DiscountType = "percent" | "value";

export interface SaleItem {
  id: string; // productId ou "custom-*" para item avulso
  sku: string;
  name: string;
  unit: ProductUnit;
  qty: number;
  price: number;
  discount: number;
  discountType: DiscountType;
}

export type SaleStatus = "FINALIZED" | "QUOTE" | "CANCELLED";

export interface SplitPayment {
  cash: number;
  method: PaymentMethod;
  rest: number;
}

export interface Sale {
  _id: string;
  saleNumber: number;
  items: SaleItem[];
  grossSubtotal: number;
  itemsDiscountTotal: number;
  globalDiscount: number;
  globalDiscountType: DiscountType;
  globalDiscountAmount: number;
  totalDiscount: number;
  total: number;
  status: SaleStatus;
  paymentMethod: PaymentMethod;
  splitPayment?: SplitPayment | null;
  amountPaid?: number | null;
  change?: number | null;
  customerId?: string | null;
  customerName?: string | null;
  caixaId?: string | null;
  userName: string;
  createdAt: ISODate;
  cancelledAt?: ISODate;
  cancelReason?: string;
}

export type BillStatus = "pending" | "paid" | "overdue" | "cancelled";

export interface InstallmentInfo {
  installmentGroupId?: string;
  installmentNumber?: number;
  totalInstallments?: number;
}

export interface AccountPayable extends InstallmentInfo {
  _id: string;
  description: string;
  supplier: string;
  category: string;
  amount: number;
  dueDate: ISODate;
  paidDate?: ISODate;
  paymentMethod?: PaymentMethod;
  documentNumber?: string;
  barcode?: string;
  status: BillStatus;
  recurring?: boolean;
  notes?: string;
  createdAt: ISODate;
}

export interface AccountReceivable extends InstallmentInfo {
  _id: string;
  description: string;
  customerId?: string;
  customerName: string;
  category: string;
  amount: number;
  dueDate: ISODate;
  receivedDate?: ISODate;
  paymentMethod?: PaymentMethod;
  documentNumber?: string;
  saleId?: string;
  status: BillStatus;
  recurring?: boolean;
  notes?: string;
  createdAt: ISODate;
}

export type CashSessionStatus = "aberto" | "fechado";

export type CashMovementType = "retirada" | "suprimento";

export interface CashMovement {
  _id: string;
  caixaId: string;
  type: CashMovementType;
  amount: number;
  reason: string;
  userName: string;
  timestamp: ISODate;
}

export interface CashSession {
  _id: string;
  number: number;
  status: CashSessionStatus;
  operatorName: string;
  openedAt: ISODate;
  closedAt?: ISODate;
  openingAmount: number;
  /** Valor contado no fechamento. */
  closingAmount?: number;
  notes?: string;
}

export interface Category {
  _id: string;
  name: string;
  color?: string;
}

export interface WarehouseAddress extends WarehouseLocation {
  _id: string;
  code: string; // ex.: "D01-A-01-01-05"
  description?: string;
  capacity?: number;
  active: boolean;
  createdAt: ISODate;
}

export interface CompanySettings {
  companyName: string;
  tradeName: string;
  cnpj: string;
  stateRegistration?: string;
  phone?: string;
  email?: string;
  address?: string;
  receiptFooter?: string;
  lowStockAlert: boolean;
  expiryAlertDays: number;
  defaultPaymentMethod: PaymentMethod;
}
