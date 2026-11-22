// Dados iniciais de demonstração. Datas são relativas a "hoje" para o painel
// sempre parecer vivo. A geração usa um PRNG com semente fixa: todo navegador
// vê os mesmos números.
import { saleTotals } from "@/lib/domain/calc";
import type {
  AccountPayable,
  AccountReceivable,
  CashMovement,
  CashSession,
  Category,
  Customer,
  PaymentMethod,
  Product,
  ProductUnit,
  Sale,
  SaleItem,
  StockMovement,
  WarehouseAddress,
} from "@/lib/domain/types";
import { daysAgo, daysFromNow } from "./db";

function prng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

type P = [name: string, sku: string, category: string, supplier: string, unit: ProductUnit, qty: number, min: number, max: number, price: number, cost: number, loc: string, expiryInDays?: number];

const PRODUCT_ROWS: P[] = [
  ["Cimento CP-II 50kg", "MAT-001", "Materiais", "Votorantim", "SC", 120, 40, 220, 35.9, 25, "C-01-01-01"],
  ["Argamassa AC-II 20kg", "MAT-002", "Materiais", "Quartzolit", "SC", 85, 30, 160, 24.9, 15.4, "C-01-02-01"],
  ["Cal Hidratada 20kg", "MAT-003", "Materiais", "Itaú", "SC", 18, 20, 80, 16.5, 9.9, "C-01-03-01"],
  ["Rejunte Flexível 1kg Cinza", "MAT-004", "Materiais", "Quartzolit", "UN", 64, 20, 120, 12.9, 6.8, "C-02-01-03", 120],
  ["Tubo PVC 100mm 6m", "HID-042", "Hidráulica", "Tigre", "UN", 45, 20, 90, 89.9, 60, "A-01-01-05"],
  ["Tubo PVC 50mm 6m", "TUB-001", "Hidráulica", "Tigre", "UN", 75, 25, 150, 45.5, 28, "B-01-01-06"],
  ["Conexão 90° 1/2\" PVC", "CON-001", "Hidráulica", "Tigre", "UN", 250, 50, 500, 2.5, 1.5, "A-01-02-03"],
  ["Conexão T 3/4\" PVC", "CON-002", "Hidráulica", "Tigre", "UN", 180, 40, 350, 3.2, 1.8, "A-01-02-04"],
  ["Registro de Gaveta 3/4\"", "HID-051", "Hidráulica", "Deca", "UN", 0, 10, 40, 58.9, 36.5, "A-02-01-01"],
  ["Caixa d'Água 1000L", "HID-090", "Hidráulica", "Fortlev", "UN", 7, 3, 15, 489, 352, "G-01-01-01"],
  ["Fio Flexível 2,5mm 100m", "ELE-105", "Elétrica", "Sil", "UN", 12, 15, 40, 185, 130, "E-01-01-02"],
  ["Disjuntor Bipolar 32A", "ELE-210", "Elétrica", "Schneider", "UN", 34, 10, 60, 42.9, 26.1, "E-01-02-01"],
  ["Tomada 2P+T 10A Branca", "ELE-301", "Elétrica", "Tramontina", "UN", 220, 50, 300, 9.9, 4.7, "E-02-01-04"],
  ["Lâmpada LED 12W Bivolt", "ELE-402", "Elétrica", "Philips", "UN", 310, 80, 250, 11.5, 5.9, "E-02-02-01"],
  ["Tinta Acrílica Fosca 18L Branco", "TIN-018", "Tintas", "Suvinil", "UN", 28, 10, 60, 389, 262, "T-02-01-07", 16],
  ["Massa Corrida 25kg", "TIN-025", "Tintas", "Coral", "UN", 40, 15, 80, 79.9, 49, "T-02-02-01", 45],
  ["Rolo de Lã 23cm", "TIN-103", "Tintas", "Atlas", "UN", 55, 20, 100, 29.9, 14.5, "T-03-01-02"],
  ["Areia Média 20kg", "ARE-001", "Agregados", "Pedreiras União", "SC", 200, 50, 400, 14.9, 9, "D-01-01-01"],
  ["Brita 1 20kg", "ARE-002", "Agregados", "Pedreiras União", "SC", 150, 40, 300, 18.5, 11, "D-02-01-02"],
  ["Tijolo Cerâmico 6 furos", "TIJ-001", "Alvenaria", "Cerâmica São Paulo", "UN", 5000, 1000, 10000, 0.85, 0.48, "F-01-01-01"],
  ["Bloco de Concreto 14x19x39", "TIJ-002", "Alvenaria", "Blocos Indústria", "UN", 2000, 500, 4000, 3.5, 2, "F-02-01-02"],
  ["Prego 17x27 Galvanizado", "FER-001", "Ferragens", "Gerdau", "KG", 140, 40, 300, 21.9, 12.5, "H-01-03-04"],
  ["Vergalhão CA-50 10mm 12m", "FER-010", "Ferragens", "Gerdau", "UN", 96, 40, 200, 54.9, 38.2, "H-02-01-01"],
  ["Parafuso Drywall 3,5x25 (cx 1000)", "FER-020", "Ferragens", "Ciser", "CX", 8, 10, 40, 49.9, 27.5, "H-01-02-02"],
  ["Porcelanato 60x60 Acetinado", "REV-060", "Revestimentos", "Portobello", "M2", 340, 100, 600, 69.9, 44, "R-01-01-01"],
  ["Piso Cerâmico 45x45", "REV-045", "Revestimentos", "Eliane", "M2", 520, 150, 800, 32.9, 19.8, "R-02-01-01"],
  ["Furadeira de Impacto 650W", "FERR-100", "Ferramentas", "Bosch", "UN", 9, 4, 20, 349, 228, "K-01-01-01"],
  ["Trena 5m", "FERR-205", "Ferramentas", "Stanley", "UN", 42, 10, 60, 32.9, 16.4, "K-02-01-03"],
];

/** Completa 12 dígitos com o dígito verificador do EAN-13. */
function ean13(base12: string) {
  const sum = base12
    .split("")
    .reduce((acc, digit, index) => acc + Number(digit) * (index % 2 === 0 ? 1 : 3), 0);
  return base12 + ((10 - (sum % 10)) % 10);
}

export function seedProducts(): Product[] {
  return PRODUCT_ROWS.map(([name, sku, category, supplier, unit, quantity, minStock, maxStock, price, costPrice, loc, expiry], i) => {
    const [aisle, shelf, level, slot] = loc.split("-");
    return {
      _id: `p${i + 1}`,
      name,
      sku,
      barcode: ean13(`78912345${String(6789 + i).padStart(4, "0")}`),
      category,
      supplier,
      brand: supplier,
      unit,
      quantity,
      minStock,
      maxStock,
      price,
      costPrice,
      perishable: expiry !== undefined,
      expiryDate: expiry !== undefined ? daysFromNow(expiry) : undefined,
      location: { deposit: "DEPÓSITO 01", aisle, shelf, level, slot },
      active: true,
      createdAt: daysAgo(120 - i),
    };
  });
}

export function seedCategories(): Category[] {
  const names = ["Materiais", "Hidráulica", "Elétrica", "Tintas", "Agregados", "Alvenaria", "Ferragens", "Revestimentos", "Ferramentas"];
  return names.map((name, i) => ({ _id: `cat${i + 1}`, name }));
}

const CUSTOMER_ROWS: [string, string, string, string][] = [
  ["Construtora Horizonte Ltda", "12345678000195", "compras@horizonte.com.br", "82988112240"],
  ["Maria Aparecida Santos", "12345678909", "maria.santos@email.com", "82999887728"],
  ["João Pedro Almeida", "98765432100", "joaopedro@email.com", "82991234539"],
  ["Reformas Litoral ME", "23456789000195", "contato@reformaslitoral.com.br", "8233445566"],
  ["Ana Beatriz Lima", "45678912364", "anabeatriz@email.com", "82987654359"],
  ["Carlos Eduardo Ferreira", "32165498791", "", "82996541227"],
  ["Imobiliária Ponta Verde", "34567890000130", "manutencao@pontaverde.com.br", "8232109876"],
  ["Fernanda Costa Rocha", "74185296355", "fernanda.rocha@email.com", "82993216546"],
  ["Paulo Henrique Souza", "85296374100", "", "82981472518"],
  ["Elétrica Nordeste Serviços", "45678901000175", "financeiro@eletricanordeste.com.br", "8230304040"],
];

export function seedCustomers(): Customer[] {
  return CUSTOMER_ROWS.map(([name, cpfCnpj, email, phone], i) => ({
    _id: `c${i + 1}`,
    name,
    cpfCnpj,
    email: email || undefined,
    phone,
    address: ["Av. Fernandes Lima, 1200 - Farol, Maceió/AL", "Rua do Comércio, 45 - Centro, Maceió/AL", "Av. Álvaro Otacílio, 3300 - Ponta Verde, Maceió/AL"][i % 3],
    active: true,
    createdAt: daysAgo(200 - i * 9),
  }));
}

const METHODS: PaymentMethod[] = ["PIX", "PIX", "Cartão de Crédito", "Cartão de Débito", "Dinheiro", "Dinheiro", "Cartão de Crédito", "Crediário"];
const OPERATORS = ["Operador de Caixa", "Gerente da Loja", "Administrador Master"];

export function seedSales(): Sale[] {
  const rand = prng(42);
  const products = seedProducts();
  const customers = seedCustomers();
  const sales: Sale[] = [];
  let number = 1000;

  for (let day = 59; day >= 0; day--) {
    const weekday = new Date(daysAgo(day)).getDay();
    const count = weekday === 0 ? 2 : 4 + Math.floor(rand() * 6);
    for (let n = 0; n < count; n++) {
      const lineCount = 1 + Math.floor(rand() * 4);
      const items: SaleItem[] = [];
      for (let l = 0; l < lineCount; l++) {
        const p = products[Math.floor(rand() * products.length)];
        if (items.some((it) => it.id === p._id)) continue;
        const bulk = p.price < 5 ? 50 + Math.floor(rand() * 400) : p.price < 40 ? 1 + Math.floor(rand() * 12) : 1 + Math.floor(rand() * 3);
        items.push({
          id: p._id,
          sku: p.sku,
          name: p.name,
          unit: p.unit,
          qty: bulk,
          price: p.price,
          discount: rand() < 0.15 ? 5 : 0,
          discountType: "percent",
        });
      }
      const globalDiscount = rand() < 0.1 ? 10 : 0;
      const totals = saleTotals(items, globalDiscount, "value");
      const method = METHODS[Math.floor(rand() * METHODS.length)];
      const customer = rand() < 0.45 ? customers[Math.floor(rand() * customers.length)] : null;
      const status = day > 0 && rand() < 0.03 ? "CANCELLED" : "FINALIZED";
      const createdAt = new Date(daysAgo(day, 8 + Math.floor(rand() * 10)));
      createdAt.setMinutes(Math.floor(rand() * 60));
      const paid = method === "Dinheiro" ? Math.ceil(totals.total / 10) * 10 : null;
      sales.push({
        _id: `s${++number}`,
        saleNumber: number,
        items,
        grossSubtotal: totals.grossSubtotal,
        itemsDiscountTotal: totals.itemsDiscountTotal,
        globalDiscount,
        globalDiscountType: "value",
        globalDiscountAmount: totals.globalDiscountAmount,
        totalDiscount: totals.totalDiscount,
        total: totals.total,
        status,
        paymentMethod: method,
        amountPaid: paid,
        change: paid !== null ? Math.round((paid - totals.total) * 100) / 100 : null,
        customerId: customer?._id ?? null,
        customerName: customer?.name ?? null,
        caixaId: `cx${Math.max(1, 60 - day)}`,
        userName: OPERATORS[Math.floor(rand() * OPERATORS.length)],
        createdAt: createdAt.toISOString(),
        ...(status === "CANCELLED" ? { cancelledAt: createdAt.toISOString(), cancelReason: "Cliente desistiu da compra" } : {}),
      });
    }
  }
  return sales.reverse();
}

export function seedPayables(): AccountPayable[] {
  const rows: [string, string, string, number, number, AccountPayable["status"]][] = [
    ["Compra de cimento - NF 45871", "Votorantim", "Fornecedores", 6250, -12, "paid"],
    ["Tubos e conexões - NF 99812", "Tigre", "Fornecedores", 4380.5, -3, "pending"],
    ["Energia elétrica", "Equatorial Alagoas", "Utilidades", 1890.32, 4, "pending"],
    ["Aluguel do galpão", "Imobiliária Ponta Verde", "Aluguel", 8500, 8, "pending"],
    ["Internet e telefonia", "Vivo Empresas", "Utilidades", 389.9, 12, "pending"],
    ["Tintas - NF 11290", "Suvinil", "Fornecedores", 7820, 18, "pending"],
    ["Folha de pagamento", "Funcionários", "Pessoal", 23400, 6, "pending"],
    ["Simples Nacional", "Receita Federal", "Impostos", 5120.44, 15, "pending"],
    ["Manutenção da empilhadeira", "Empilha Nordeste", "Manutenção", 1450, -20, "paid"],
    ["Água e esgoto", "Casal", "Utilidades", 312.7, -1, "pending"],
    ["Material elétrico - NF 7741", "Schneider", "Fornecedores", 3210, 25, "pending"],
    ["Seguro patrimonial", "Porto Seguro", "Seguros", 980, -35, "paid"],
  ];
  const list: AccountPayable[] = rows.map(([description, supplier, category, amount, due, status], i) => ({
    _id: `ap${i + 1}`,
    description,
    supplier,
    category,
    amount,
    dueDate: daysFromNow(due),
    status,
    paidDate: status === "paid" ? daysFromNow(due - 1) : undefined,
    paymentMethod: status === "paid" ? "Boleto" : undefined,
    documentNumber: `DOC-${2400 + i}`,
    recurring: ["Utilidades", "Aluguel", "Pessoal"].includes(category),
    createdAt: daysAgo(40 - i),
  }));
  // Um parcelamento em 3x
  for (let k = 1; k <= 3; k++) {
    list.push({
      _id: `ap-parc-${k}`,
      description: `Furadeiras e ferramentas - parcela ${k}/3`,
      supplier: "Bosch",
      category: "Fornecedores",
      amount: 1980,
      dueDate: daysFromNow(-25 + k * 30),
      status: k === 1 ? "paid" : "pending",
      paidDate: k === 1 ? daysFromNow(5) : undefined,
      installmentGroupId: "grp-bosch",
      installmentNumber: k,
      totalInstallments: 3,
      createdAt: daysAgo(30),
    });
  }
  return list;
}

export function seedReceivables(): AccountReceivable[] {
  const customers = seedCustomers();
  const rows: [number, string, number, number, AccountReceivable["status"]][] = [
    [0, "Obra Residencial Jatiúca - pedido 1188", 12450, -6, "pending"],
    [3, "Reforma apartamento 302", 3890, 3, "pending"],
    [6, "Manutenção predial - outubro", 2740.5, -18, "paid"],
    [9, "Material elétrico - obra Farol", 5320, 10, "pending"],
    [1, "Crediário - venda 1231", 689.9, 14, "pending"],
    [4, "Crediário - venda 1250", 412.3, -2, "pending"],
    [7, "Crediário - venda 1262", 950, 21, "pending"],
    [0, "Obra Residencial Jatiúca - pedido 1102", 9870, -30, "paid"],
  ];
  const list: AccountReceivable[] = rows.map(([c, description, amount, due, status], i) => ({
    _id: `ar${i + 1}`,
    description,
    customerId: customers[c]._id,
    customerName: customers[c].name,
    category: description.startsWith("Crediário") ? "Crediário" : "Vendas a prazo",
    amount,
    dueDate: daysFromNow(due),
    status,
    receivedDate: status === "paid" ? daysFromNow(due) : undefined,
    paymentMethod: status === "paid" ? "PIX" : undefined,
    documentNumber: `REC-${880 + i}`,
    createdAt: daysAgo(45 - i * 2),
  }));
  for (let k = 1; k <= 4; k++) {
    list.push({
      _id: `ar-parc-${k}`,
      description: `Reforma completa - parcela ${k}/4`,
      customerId: customers[2]._id,
      customerName: customers[2].name,
      category: "Vendas a prazo",
      amount: 1525,
      dueDate: daysFromNow(-40 + k * 30),
      status: k === 1 ? "paid" : "pending",
      receivedDate: k === 1 ? daysFromNow(-10) : undefined,
      paymentMethod: k === 1 ? "Boleto" : undefined,
      installmentGroupId: "grp-reforma",
      installmentNumber: k,
      totalInstallments: 4,
      createdAt: daysAgo(50),
    });
  }
  return list;
}

export function seedCashSessions(): CashSession[] {
  const rand = prng(7);
  const sales = seedSales();
  const movements = seedCashMovements();
  const sessions: CashSession[] = [];
  for (let day = 59; day >= 0; day--) {
    const number = 60 - day;
    const id = `cx${number}`;
    const open = day === 0;
    const openingAmount = 200;
    // Fechamento = dinheiro esperado no caixa; ~10% das sessões com pequena diferença.
    const cashSales = sales
      .filter((s) => s.caixaId === id && s.status === "FINALIZED")
      .reduce((sum, s) => sum + (s.splitPayment ? s.splitPayment.cash : s.paymentMethod === "Dinheiro" ? s.total : 0), 0);
    const moves = movements
      .filter((m) => m.caixaId === id)
      .reduce((sum, m) => sum + (m.type === "suprimento" ? m.amount : -m.amount), 0);
    const expected = Math.round((openingAmount + cashSales + moves) * 100) / 100;
    const hasDiff = rand() < 0.1;
    const diff = hasDiff ? (rand() < 0.5 ? -1 : 1) * Math.round(2 + rand() * 25) : 0;
    sessions.push({
      _id: id,
      number,
      status: open ? "aberto" : "fechado",
      operatorName: OPERATORS[number % 2],
      openedAt: daysAgo(day, 8),
      closedAt: open ? undefined : daysAgo(day, 18),
      openingAmount,
      closingAmount: open ? undefined : Math.round((expected + diff) * 100) / 100,
      notes: !open && hasDiff ? "Diferença conferida com a gerência" : undefined,
    });
  }
  return sessions.reverse();
}

export function seedCashMovements(): CashMovement[] {
  return [
    { _id: "cm1", caixaId: "cx60", type: "suprimento", amount: 100, reason: "Troco adicional", userName: "Gerente da Loja", timestamp: daysAgo(0, 9) },
    { _id: "cm2", caixaId: "cx60", type: "retirada", amount: 500, reason: "Sangria para cofre", userName: "Gerente da Loja", timestamp: daysAgo(0, 13) },
    { _id: "cm3", caixaId: "cx59", type: "retirada", amount: 800, reason: "Sangria para cofre", userName: "Gerente da Loja", timestamp: daysAgo(1, 15) },
  ];
}

export function seedStockMovements(): StockMovement[] {
  const products = seedProducts();
  return products.slice(0, 10).map((p, i) => ({
    _id: `sm${i + 1}`,
    productId: p._id,
    sku: p.sku,
    productName: p.name,
    type: i % 3 === 0 ? "ENTRADA" : i % 3 === 1 ? "VENDA" : "AJUSTE",
    quantity: i % 3 === 1 ? -(2 + i) : 10 + i * 3,
    previousQuantity: p.quantity - (10 + i * 3),
    newQuantity: p.quantity,
    reason: i % 3 === 2 ? "Inventário mensal" : undefined,
    reference: i % 3 === 0 ? `NF ${40000 + i * 17}` : undefined,
    userName: OPERATORS[i % 3],
    timestamp: daysAgo(i, 11),
  }));
}

export function seedWarehouseAddresses(): WarehouseAddress[] {
  // Grade base em todos os corredores usados pelos produtos + os endereços exatos deles.
  const codes = new Map<string, [string, string, string, string]>();
  for (const aisle of ["A", "B", "C", "D", "E", "F", "G", "H", "K", "R", "T"]) {
    for (const shelf of ["01", "02", "03"]) {
      for (const level of ["01", "02", "03"]) {
        for (const slot of ["01", "02", "03", "04"]) {
          codes.set(`${aisle}-${shelf}-${level}-${slot}`, [aisle, shelf, level, slot]);
        }
      }
    }
  }
  for (const row of PRODUCT_ROWS) {
    const [aisle, shelf, level, slot] = row[10].split("-");
    codes.set(row[10], [aisle, shelf, level, slot]);
  }
  return [...codes.values()]
    .sort((a, b) => a.join("-").localeCompare(b.join("-")))
    .map(([aisle, shelf, level, slot], i) => ({
      _id: `wa${i + 1}`,
      deposit: "DEPÓSITO 01",
      aisle,
      shelf,
      level,
      slot,
      code: `D01-${aisle}-${shelf}-${level}-${slot}`,
      capacity: 100,
      active: true,
      createdAt: daysAgo(150),
    }));
}
