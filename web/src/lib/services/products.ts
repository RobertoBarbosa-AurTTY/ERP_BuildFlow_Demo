// Serviços de estoque: produtos, categorias, movimentações e endereços do depósito.
// As telas só falam com estas funções (via React Query); nunca com as coleções.
import { round2, stockStatus } from "@/lib/domain/calc";
import type {
  Category,
  Product,
  StockMovement,
  StockMovementType,
  StockStatus,
  WarehouseAddress,
  WarehouseLocation,
} from "@/lib/domain/types";
import { categories, products, settings, stockMovements, warehouseAddresses } from "@/lib/mock/collections";
import { delay, MockError } from "@/lib/mock/db";

// ---------------------------------------------------------------------------
// Helpers

function currentUserName() {
  if (typeof window === "undefined") return "Sistema";
  try {
    const raw = window.localStorage.getItem("buildflow:session");
    return raw ? ((JSON.parse(raw) as { name?: string }).name ?? "Sistema") : "Sistema";
  } catch {
    return "Sistema";
  }
}

function normalize(value: string | undefined | null) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

function now() {
  return new Date().toISOString();
}

export function locationCode(location?: WarehouseLocation | null) {
  if (!location || !location.aisle) return "";
  const deposit = location.deposit?.match(/\d+/)?.[0]?.padStart(2, "0") ?? "01";
  return [`D${deposit}`, location.aisle, location.shelf, location.level, location.slot].filter(Boolean).join("-");
}

function recordMovement(
  product: Product,
  type: StockMovementType,
  delta: number,
  extra: { reason?: string; reference?: string; userName?: string } = {},
) {
  const previousQuantity = product.quantity;
  const newQuantity = round2(previousQuantity + delta);
  products.update(product._id, { quantity: newQuantity, updatedAt: now() });
  return stockMovements.insert({
    productId: product._id,
    sku: product.sku,
    productName: product.name,
    type,
    quantity: round2(delta),
    previousQuantity,
    newQuantity,
    reason: extra.reason,
    reference: extra.reference,
    userName: extra.userName ?? currentUserName(),
    timestamp: now(),
  });
}

// ---------------------------------------------------------------------------
// Produtos

export interface ListProductsParams {
  search?: string;
  category?: string;
  status?: StockStatus | "all";
  includeInactive?: boolean;
}

export function matchesSearch(product: Product, search: string) {
  const term = normalize(search);
  if (!term) return true;
  return (
    normalize(product.name).includes(term) ||
    normalize(product.sku).includes(term) ||
    normalize(product.barcode).includes(term) ||
    normalize(product.brand).includes(term)
  );
}

export async function listProducts(params: ListProductsParams = {}): Promise<Product[]> {
  const { search = "", category, status, includeInactive } = params;
  const result = products
    .find((p) => (includeInactive ? true : p.active))
    .filter((p) => matchesSearch(p, search))
    .filter((p) => !category || category === "all" || p.category === category)
    .filter((p) => !status || status === "all" || stockStatus(p) === status)
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  return delay(result);
}

export async function getProduct(id: string): Promise<Product> {
  const product = products.get(id);
  if (!product) throw new MockError("Produto não encontrado", 404);
  return delay(product);
}

/** Busca por SKU ou código de barras (exato, sem diferenciar maiúsculas). */
export async function getProductByCode(code: string): Promise<Product | null> {
  const term = normalize(code);
  if (!term) return delay(null);
  const product =
    products.find((p) => p.active && (normalize(p.sku) === term || normalize(p.barcode) === term))[0] ?? null;
  return delay(product);
}

export type ProductInput = Omit<Product, "_id" | "createdAt" | "updatedAt">;

function validateProduct(input: ProductInput, ignoreId?: string) {
  if (!input.name.trim()) throw new MockError("Informe o nome do produto");
  if (!input.sku.trim()) throw new MockError("Informe o SKU");
  const sku = normalize(input.sku);
  if (products.find((p) => p._id !== ignoreId && normalize(p.sku) === sku).length)
    throw new MockError(`Já existe um produto com o SKU ${input.sku}`, 409);
  if (input.barcode) {
    const barcode = normalize(input.barcode);
    if (products.find((p) => p._id !== ignoreId && normalize(p.barcode) === barcode).length)
      throw new MockError(`Código de barras ${input.barcode} já cadastrado`, 409);
  }
}

export async function createProduct(input: ProductInput): Promise<Product> {
  validateProduct(input);
  const { quantity, ...rest } = input;
  const product = products.insert({ ...rest, quantity: 0, createdAt: now() });
  if (quantity > 0) recordMovement(product, "ENTRADA", quantity, { reason: "Estoque inicial (cadastro)" });
  return delay(products.get(product._id)!);
}

export async function updateProduct(id: string, input: Partial<ProductInput>): Promise<Product> {
  const current = products.get(id);
  if (!current) throw new MockError("Produto não encontrado", 404);
  // Quantidade só muda por movimentação, para manter o histórico consistente.
  const { quantity: _ignored, ...patch } = input;
  void _ignored;
  validateProduct({ ...current, ...patch }, id);
  return delay(products.update(id, { ...patch, updatedAt: now() }));
}

export async function setProductActive(id: string, active: boolean): Promise<Product> {
  if (!products.get(id)) throw new MockError("Produto não encontrado", 404);
  return delay(products.update(id, { active, updatedAt: now() }));
}

export interface StockStats {
  totalItems: number;
  totalUnits: number;
  costValue: number;
  saleValue: number;
  lowStock: number;
  outOfStock: number;
  expiringSoon: number;
}

export async function getStockStats(expiryDays = 30): Promise<StockStats> {
  const list = products.find((p) => p.active);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const limit = today.getTime() + expiryDays * 86_400_000;
  const stats: StockStats = {
    totalItems: list.length,
    totalUnits: list.reduce((s, p) => s + p.quantity, 0),
    costValue: round2(list.reduce((s, p) => s + p.quantity * p.costPrice, 0)),
    saleValue: round2(list.reduce((s, p) => s + p.quantity * p.price, 0)),
    lowStock: list.filter((p) => stockStatus(p) === "low").length,
    outOfStock: list.filter((p) => stockStatus(p) === "out").length,
    expiringSoon: list.filter((p) => p.perishable && p.expiryDate && new Date(p.expiryDate).getTime() <= limit).length,
  };
  return delay(stats);
}

// ---------------------------------------------------------------------------
// Categorias

export async function listCategories(): Promise<Category[]> {
  return delay([...categories.all()].sort((a, b) => a.name.localeCompare(b.name, "pt-BR")));
}

export async function createCategory(name: string): Promise<Category> {
  const clean = name.trim();
  if (!clean) throw new MockError("Informe o nome da categoria");
  const existing = categories.find((c) => normalize(c.name) === normalize(clean))[0];
  if (existing) return delay(existing);
  return delay(categories.insert({ name: clean }));
}

// ---------------------------------------------------------------------------
// Movimentações

export interface ListMovementsParams {
  productId?: string;
  type?: StockMovementType | "all";
  search?: string;
  limit?: number;
}

export async function listStockMovements(params: ListMovementsParams = {}): Promise<StockMovement[]> {
  const term = normalize(params.search);
  const result = stockMovements
    .find((m) => !params.productId || m.productId === params.productId)
    .filter((m) => !params.type || params.type === "all" || m.type === params.type)
    .filter(
      (m) =>
        !term ||
        normalize(m.productName).includes(term) ||
        normalize(m.sku).includes(term) ||
        normalize(m.reference).includes(term),
    )
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  return delay(params.limit ? result.slice(0, params.limit) : result);
}

export type AdjustMode = "add" | "remove" | "set";

export interface AdjustStockInput {
  productId: string;
  mode: AdjustMode;
  quantity: number;
  reason: string;
}

/** Ajuste manual: entrada, saída (perda/avaria) ou contagem de inventário. */
export async function adjustStock(input: AdjustStockInput): Promise<StockMovement> {
  const product = products.get(input.productId);
  if (!product) throw new MockError("Produto não encontrado", 404);
  if (!input.reason.trim()) throw new MockError("Informe o motivo do ajuste");
  const qty = Number(input.quantity);
  if (!Number.isFinite(qty) || qty < 0 || (input.mode !== "set" && qty === 0))
    throw new MockError("Quantidade inválida");
  let delta: number;
  let type: StockMovementType;
  if (input.mode === "add") {
    delta = qty;
    type = "ENTRADA";
  } else if (input.mode === "remove") {
    if (qty > product.quantity) throw new MockError(`Saldo insuficiente (atual: ${product.quantity})`);
    delta = -qty;
    type = "SAIDA";
  } else {
    delta = qty - product.quantity;
    type = "AJUSTE";
    if (delta === 0) throw new MockError("A contagem é igual ao saldo atual");
  }
  return delay(recordMovement(product, type, delta, { reason: input.reason.trim() }));
}

// ---------------------------------------------------------------------------
// Entradas de mercadoria (nota fiscal / importação de XML)

export interface ReceivingItemInput {
  /** Produto existente; se ausente, `newProduct` é cadastrado. */
  productId?: string;
  newProduct?: ProductInput;
  quantity: number;
  unitCost: number;
}

export interface ReceivingInput {
  document: string;
  supplier: string;
  issueDate?: string;
  updateCost: boolean;
  notes?: string;
  items: ReceivingItemInput[];
}

export interface ReceivingResult {
  reference: string;
  movements: StockMovement[];
  createdProducts: number;
  total: number;
}

export async function registerReceiving(input: ReceivingInput): Promise<ReceivingResult> {
  if (!input.document.trim()) throw new MockError("Informe o número da nota");
  if (!input.supplier.trim()) throw new MockError("Informe o fornecedor");
  if (!input.items.length) throw new MockError("Adicione ao menos um item");
  input.items.forEach((item, index) => {
    if (!(item.quantity > 0)) throw new MockError(`Item ${index + 1}: quantidade inválida`);
    if (!(item.unitCost >= 0)) throw new MockError(`Item ${index + 1}: custo inválido`);
    if (!item.productId && !item.newProduct) throw new MockError(`Item ${index + 1}: selecione um produto`);
    if (item.productId && !products.get(item.productId))
      throw new MockError(`Item ${index + 1}: produto não encontrado`, 404);
    if (item.newProduct) validateProduct(item.newProduct);
  });

  const reference = `NF ${input.document.trim()}`;
  const reason = `Entrada de mercadoria - ${input.supplier.trim()}`;
  const movements: StockMovement[] = [];
  let createdProducts = 0;
  for (const item of input.items) {
    let product: Product;
    if (item.productId) {
      product = products.get(item.productId)!;
    } else {
      product = products.insert({
        ...item.newProduct!,
        quantity: 0,
        costPrice: item.unitCost,
        createdAt: now(),
      });
      createdProducts++;
    }
    if (input.updateCost && item.unitCost > 0) {
      product = products.update(product._id, { costPrice: round2(item.unitCost), supplier: input.supplier.trim() });
    }
    movements.push(recordMovement(product, "ENTRADA", item.quantity, { reason, reference }));
  }
  const total = round2(input.items.reduce((s, i) => s + i.quantity * i.unitCost, 0));
  return delay({ reference, movements, createdProducts, total });
}

export interface ReceivingSummary {
  reference: string;
  supplier: string;
  timestamp: string;
  userName?: string;
  items: number;
  units: number;
}

/** Entradas agrupadas pela referência (nota fiscal). */
export async function listReceivings(limit = 20): Promise<ReceivingSummary[]> {
  const groups = new Map<string, ReceivingSummary>();
  const entries = stockMovements
    .find((m) => m.type === "ENTRADA" && !!m.reference)
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  for (const m of entries) {
    const key = m.reference!;
    const group = groups.get(key);
    if (group) {
      group.items++;
      group.units += m.quantity;
    } else {
      groups.set(key, {
        reference: key,
        supplier: m.reason?.replace(/^Entrada de mercadoria - /, "") ?? "—",
        timestamp: m.timestamp,
        userName: m.userName,
        items: 1,
        units: m.quantity,
      });
    }
  }
  return delay([...groups.values()].slice(0, limit));
}

// ---------------------------------------------------------------------------
// Endereços do depósito

export interface AddressWithProducts extends WarehouseAddress {
  products: Pick<Product, "_id" | "name" | "sku" | "quantity" | "unit">[];
}

function sameLocation(a: WarehouseLocation | undefined, b: WarehouseLocation) {
  return (
    !!a &&
    a.aisle === b.aisle &&
    a.shelf === b.shelf &&
    a.level === b.level &&
    a.slot === b.slot &&
    normalize(a.deposit) === normalize(b.deposit)
  );
}

export async function listAddresses(): Promise<AddressWithProducts[]> {
  const active = products.find((p) => p.active);
  const result = warehouseAddresses
    .all()
    .map((address) => ({
      ...address,
      products: active
        .filter((p) => sameLocation(p.location, address))
        .map(({ _id, name, sku, quantity, unit }) => ({ _id, name, sku, quantity, unit })),
    }))
    .sort((a, b) => a.code.localeCompare(b.code));
  return delay(result);
}

export type AddressInput = WarehouseLocation & { description?: string; capacity?: number };

function pad2(value: string) {
  const clean = value.trim().toUpperCase();
  return /^\d+$/.test(clean) ? clean.padStart(2, "0") : clean;
}

function buildAddress(input: AddressInput): Omit<WarehouseAddress, "_id"> {
  const location: WarehouseLocation = {
    deposit: input.deposit.trim().toUpperCase() || "DEPÓSITO 01",
    aisle: input.aisle.trim().toUpperCase(),
    shelf: pad2(input.shelf),
    level: pad2(input.level),
    slot: pad2(input.slot),
  };
  if (!location.aisle || !location.shelf || !location.level || !location.slot)
    throw new MockError("Preencha corredor, prateleira, nível e posição");
  return {
    ...location,
    code: locationCode(location),
    description: input.description?.trim() || undefined,
    capacity: input.capacity,
    active: true,
    createdAt: now(),
  };
}

export async function createAddress(input: AddressInput): Promise<WarehouseAddress> {
  const data = buildAddress(input);
  if (warehouseAddresses.find((a) => a.code === data.code).length)
    throw new MockError(`O endereço ${data.code} já existe`, 409);
  return delay(warehouseAddresses.insert(data));
}

export interface AddressBatchInput {
  deposit: string;
  aisles: string[];
  shelves: number;
  levels: number;
  slots: number;
  capacity?: number;
}

export async function createAddressBatch(input: AddressBatchInput): Promise<{ created: number; skipped: number }> {
  if (!input.aisles.length) throw new MockError("Informe ao menos um corredor");
  const total = input.aisles.length * input.shelves * input.levels * input.slots;
  if (total <= 0) throw new MockError("Intervalo inválido");
  if (total > 2000) throw new MockError("Limite de 2.000 endereços por lote");
  const existing = new Set(warehouseAddresses.all().map((a) => a.code));
  let created = 0;
  let skipped = 0;
  for (const aisle of input.aisles) {
    for (let s = 1; s <= input.shelves; s++) {
      for (let l = 1; l <= input.levels; l++) {
        for (let p = 1; p <= input.slots; p++) {
          const data = buildAddress({
            deposit: input.deposit,
            aisle,
            shelf: String(s),
            level: String(l),
            slot: String(p),
            capacity: input.capacity,
          });
          if (existing.has(data.code)) {
            skipped++;
            continue;
          }
          existing.add(data.code);
          warehouseAddresses.insert(data);
          created++;
        }
      }
    }
  }
  return delay({ created, skipped });
}

export async function setAddressActive(id: string, active: boolean): Promise<WarehouseAddress> {
  if (!warehouseAddresses.get(id)) throw new MockError("Endereço não encontrado", 404);
  return delay(warehouseAddresses.update(id, { active }));
}

export async function deleteAddress(id: string): Promise<void> {
  const address = warehouseAddresses.get(id);
  if (!address) throw new MockError("Endereço não encontrado", 404);
  if (products.find((p) => p.active && sameLocation(p.location, address)).length)
    throw new MockError("Há produtos neste endereço. Mova-os antes de excluir.", 409);
  warehouseAddresses.remove(id);
  return delay(undefined);
}

/** Endereça o produto: grava a localização física no cadastro. */
export async function assignProductAddress(productId: string, addressId: string | null): Promise<Product> {
  const product = products.get(productId);
  if (!product) throw new MockError("Produto não encontrado", 404);
  if (!addressId) return delay(products.update(productId, { location: undefined, updatedAt: now() }));
  const address = warehouseAddresses.get(addressId);
  if (!address) throw new MockError("Endereço não encontrado", 404);
  if (!address.active) throw new MockError("Endereço inativo");
  const { deposit, aisle, shelf, level, slot } = address;
  return delay(products.update(productId, { location: { deposit, aisle, shelf, level, slot }, updatedAt: now() }));
}

// ---------------------------------------------------------------------------
// Etiquetas

export interface LabelSettings {
  storeName: string;
  expiryAlertDays: number;
}

export async function getLabelSettings(): Promise<LabelSettings> {
  const company = settings.get("company");
  return delay({
    storeName: company?.tradeName || company?.companyName || "BuildFlow",
    expiryAlertDays: company?.expiryAlertDays ?? 30,
  });
}
