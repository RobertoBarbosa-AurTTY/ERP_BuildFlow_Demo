// Coleções compartilhadas do "banco" simulado. Importe daqui nos services.
import type {
  AccountPayable,
  AccountReceivable,
  CashMovement,
  CashSession,
  Category,
  CompanySettings,
  Customer,
  Product,
  Sale,
  StockMovement,
  WarehouseAddress,
} from "@/lib/domain/types";
import { collection } from "./db";
import {
  seedCashMovements,
  seedCashSessions,
  seedCategories,
  seedCustomers,
  seedPayables,
  seedProducts,
  seedReceivables,
  seedSales,
  seedStockMovements,
  seedWarehouseAddresses,
} from "./seed";

export const products = collection<Product>("products", seedProducts);
export const categories = collection<Category>("categories", seedCategories);
export const stockMovements = collection<StockMovement>("stock_movements", seedStockMovements);
export const warehouseAddresses = collection<WarehouseAddress>("warehouse_addresses", seedWarehouseAddresses);
export const customers = collection<Customer>("customers", seedCustomers);
export const sales = collection<Sale>("sales", seedSales);
export const payables = collection<AccountPayable>("accounts_payable", seedPayables);
export const receivables = collection<AccountReceivable>("accounts_receivable", seedReceivables);
export const cashSessions = collection<CashSession>("cash_sessions", seedCashSessions);
export const cashMovements = collection<CashMovement>("cash_movements", seedCashMovements);

export const DEFAULT_SETTINGS: CompanySettings = {
  companyName: "BuildFlow Materiais de Construção Ltda",
  tradeName: "BuildFlow Home",
  cnpj: "11222333000181",
  stateRegistration: "240000000",
  phone: "8232001000",
  email: "contato@buildflow.com.br",
  address: "Av. Durval de Góes Monteiro, 5000 - Tabuleiro, Maceió/AL",
  receiptFooter: "Obrigado pela preferência! Trocas em até 7 dias com o cupom.",
  lowStockAlert: true,
  expiryAlertDays: 30,
  defaultPaymentMethod: "PIX",
};

export const settings = collection<CompanySettings & { _id: string }>("settings", () => [
  { _id: "company", ...DEFAULT_SETTINGS },
]);
