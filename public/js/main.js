// BuildFlow ERP - Global API and Auth Management
const API_BASE = "/api";

const BuildFlow = {
  // Autenticação
  async login(email, password) {
    try {
      const response = await fetch(`${API_BASE}/auth-login`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      let data;
      const contentType = response.headers.get("content-type");

      if (contentType && contentType.includes("application/json")) {
        data = await response.json();
      } else {
        const text = await response.text();
        // Se o status for 200 mas não for JSON, pode ser um erro de configuração do servidor
        if (response.ok) {
          try {
            data = JSON.parse(text);
          } catch (e) {
            throw new Error(
              `Resposta inválida do servidor (200 OK, mas não é JSON)`,
            );
          }
        } else {
          throw new Error(
            `Erro no servidor (${response.status}): ${text.substring(0, 100)}`,
          );
        }
      }

      if (!response.ok) throw new Error(data.message || "Erro na autenticação");

      localStorage.setItem("user", JSON.stringify(data.user));
      if (data.token) localStorage.setItem("token", data.token);
      return data;
    } catch (error) {
      console.error("Login error:", error);
      throw error;
    }
  },

  logout() {
    if (typeof Swal !== "undefined") {
      Swal.fire({
        title: "Deseja realmente sair?",
        text: "Sua sessão será encerrada.",
        icon: "question",
        showCancelButton: true,
        confirmButtonColor: "#4f46e5",
        cancelButtonColor: "#64748b",
        confirmButtonText: "Sim, sair!",
        cancelButtonText: "Cancelar",
      }).then((result) => {
        if (result.isConfirmed) {
          this.performLogout();
        }
      });
    } else {
      if (confirm("Deseja realmente sair do sistema?")) {
        this.performLogout();
      }
    }
  },

  performLogout() {
    document.cookie = "token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
    localStorage.removeItem("user");
    localStorage.removeItem("token");
    window.location.href = window.location.pathname.includes("/pages/")
      ? "../index.html"
      : "index.html";
  },

  getAuthHeaders(includeJson = false) {
    const headers = {};
    const token = localStorage.getItem("token");
    if (token) headers["Authorization"] = `Bearer ${token}`;
    if (includeJson) headers["Content-Type"] = "application/json";
    return headers;
  },

  normalizeId(id) {
    if (!id) return "";
    if (typeof id === "object" && id.$oid) return id.$oid;
    return String(id);
  },

  normalizeSaleRecord(sale) {
    if (!sale || typeof sale !== "object") {
      return {
        items: [],
        total: 0,
        grossSubtotal: 0,
        itemsDiscountTotal: 0,
        globalDiscountAmount: 0,
        totalDiscount: 0,
      };
    }

    const items = Array.isArray(sale.items)
      ? sale.items.map((item) => {
          const qty = Math.max(0, Number(item.qty) || 0);
          const price = Number(item.price) || 0;
          const discount = Math.max(0, Number(item.discount) || 0);
          const discountType = item.discountType || "percent";
          const lineGross = qty * price;
          const discountAmount =
            discount > 0
              ? discountType === "value"
                ? Math.min(discount, lineGross)
                : lineGross * (discount / 100)
              : 0;
          const lineTotal = Math.max(0, lineGross - discountAmount);
          return {
            ...item,
            qty,
            price,
            discount,
            discountType,
            lineGross,
            discountAmount,
            lineTotal,
            discountLabel:
              discount > 0
                ? discountType === "percent"
                  ? `${discount}%`
                  : this.formatCurrency(discount)
                : null,
          };
        })
      : [];

    const saleSummary = this.computeSaleSummary(
      items,
      sale.globalDiscount || 0,
      sale.globalDiscountType || "percent",
    );

    return {
      ...sale,
      items: saleSummary.items,
      grossSubtotal: saleSummary.grossSubtotal,
      itemsDiscountTotal: saleSummary.itemsDiscountTotal,
      subtotalAfterItems: saleSummary.subtotalAfterItems,
      globalDiscount: saleSummary.globalDiscount,
      globalDiscountType: saleSummary.globalDiscountType,
      globalDiscountAmount: saleSummary.globalDiscountAmount,
      totalDiscount: saleSummary.totalDiscount,
      total: saleSummary.total,
    };
  },

  getSaleDisplayId(sale) {
    if (!sale) return "";
    if (sale.saleNumber != null) return String(sale.saleNumber);
    return this.normalizeId(sale._id).slice(-8);
  },

  getSaleStatusLabel(status) {
    if (status === "FINALIZED") return "Finalizada";
    if (status === "RESERVED") return "Reservada";
    if (status === "CANCELLED") return "Cancelada";
    return status || "—";
  },

  /** HTML do modal de detalhes da venda (descontos, totais e pagamento). */
  buildSaleDetailHtml(sale, options = {}) {
    const normalized = this.normalizeSaleRecord(sale);
    const storedTotal = Number(sale.total);
    const displayTotal =
      Number.isFinite(storedTotal) &&
      storedTotal >= 0 &&
      Math.abs(storedTotal - normalized.total) > 0.02
        ? storedTotal
        : normalized.total;

    const items = normalized.items || [];
    let itemsHtml = items
      .map((item) => {
        const qty = Number(item.qty) || 0;
        const discLine =
          item.discountAmount > 0
            ? `<small class="sale-detail-disc">Desc. ${this.escapeHtml(item.discountLabel || "")}: −${this.formatCurrency(item.discountAmount)}</small>`
            : "";
        return `
          <div class="sale-detail-row">
            <div class="sale-detail-row__item">
              <span class="sale-detail-qty">${qty}×</span>
              <span>${this.escapeHtml(item.name || "Produto")}${discLine}</span>
            </div>
            <span class="sale-detail-row__value">${this.formatCurrency(item.lineTotal)}</span>
          </div>`;
      })
      .join("");

    if (!itemsHtml) {
      itemsHtml =
        '<p class="sale-detail-empty">Nenhum item registrado nesta venda.</p>';
    }

    let totalsHtml = "";
    if (normalized.grossSubtotal > 0 && normalized.totalDiscount > 0) {
      totalsHtml += `<div class="sale-detail-row sale-detail-row--muted"><span>Subtotal bruto</span><span>${this.formatCurrency(normalized.grossSubtotal)}</span></div>`;
    }
    if (normalized.itemsDiscountTotal > 0) {
      totalsHtml += `<div class="sale-detail-row sale-detail-row--muted"><span>Desconto nos itens</span><span>−${this.formatCurrency(normalized.itemsDiscountTotal)}</span></div>`;
    }
    if (normalized.globalDiscountAmount > 0) {
      totalsHtml += `<div class="sale-detail-row sale-detail-row--muted"><span>Desconto na venda</span><span>−${this.formatCurrency(normalized.globalDiscountAmount)}</span></div>`;
    }

    const paymentMethod =
      sale.paymentMethod ||
      (sale.status === "RESERVED" ? "Reserva" : "Não informado");
    const amountPaid =
      sale.amountPaid != null
        ? Number(sale.amountPaid)
        : paymentMethod !== "Reserva" && sale.status === "FINALIZED"
          ? displayTotal
          : null;
    const change =
      sale.change != null ? Number(sale.change) : amountPaid != null ? 0 : null;

    let paymentHtml = "";
    if (amountPaid != null) {
      paymentHtml += `<div class="sale-detail-row sale-detail-row--muted"><span>Valor recebido</span><span>${this.formatCurrency(amountPaid)}</span></div>`;
      paymentHtml += `<div class="sale-detail-row sale-detail-row--muted"><span>Troco</span><span>${this.formatCurrency(change || 0)}</span></div>`;
    }

    const footerHtml = options.footerHtml || "";

    return `
      <div class="sale-detail-sheet">
        <div class="sale-detail-meta">
          <div class="sale-detail-kv">
            <label>Data / hora</label>
            <span>${new Date(sale.createdAt).toLocaleString("pt-BR")}</span>
          </div>
          <div class="sale-detail-kv">
            <label>Status</label>
            <span>${this.escapeHtml(this.getSaleStatusLabel(sale.status))}</span>
          </div>
          <div class="sale-detail-kv">
            <label>Pagamento</label>
            <span>${this.escapeHtml(paymentMethod)}</span>
          </div>
          <div class="sale-detail-kv">
            <label>Itens</label>
            <span>${items.length}</span>
          </div>
        </div>
        <div class="sale-detail-items">
          <div class="sale-detail-items__head">
            <span>Produto</span>
            <span>Valor</span>
          </div>
          ${itemsHtml}
          ${totalsHtml}
          ${paymentHtml}
        </div>
        <div class="sale-detail-total">
          <span>Total</span>
          <strong>${this.formatCurrency(displayTotal)}</strong>
        </div>
        ${footerHtml}
      </div>`;
  },

  async openSaleDetailModal(sale, options = {}) {
    if (typeof Swal === "undefined") {
      throw new Error("SweetAlert2 não está disponível nesta página.");
    }
    const title =
      options.title || `Venda #${this.getSaleDisplayId(sale)}`;
    const html = this.buildSaleDetailHtml(sale, options);
    return Swal.fire({
      title,
      html,
      width: options.width || 520,
      confirmButtonText: options.confirmButtonText || "Fechar",
      confirmButtonColor: "#4f46e5",
      customClass: {
        popup: "sale-detail-swal",
        title: "sale-detail-swal__title",
        htmlContainer: "sale-detail-swal__html",
        confirmButton: "sale-detail-swal__confirm",
      },
      ...options.swalOverrides,
    });
  },

  async apiFetch(path, options = {}) {
    const response = await fetch(`${API_BASE}${path}`, {
      ...options,
      credentials: "include",
      headers: {
        ...this.getAuthHeaders(typeof options.body === "string"),
        ...(options.headers || {}),
      },
    });

    let data;
    const contentType = response.headers.get("content-type");
    if (contentType && contentType.includes("application/json")) {
      data = await response.json();
    } else {
      const text = await response.text();
      if (!response.ok) {
        throw new Error(text.substring(0, 120) || `Erro ${response.status}`);
      }
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error("Resposta inválida do servidor");
      }
    }

    if (response.status === 401) {
      localStorage.removeItem("user");
      localStorage.removeItem("token");
      if (
        !window.location.pathname.endsWith("index.html") &&
        window.location.pathname !== "/"
      ) {
        window.location.href = window.location.pathname.includes("/pages/")
          ? "../index.html"
          : "index.html";
      }
      throw new Error("Sessão expirada. Faça login novamente.");
    }

    if (!response.ok) {
      throw new Error(data.message || `Erro ${response.status}`);
    }

    return data;
  },

  async checkAuth() {
    const user = localStorage.getItem("user");
    if (
      !user &&
      !window.location.pathname.endsWith("index.html") &&
      window.location.pathname !== "/"
    ) {
      window.location.href = window.location.pathname.includes("/pages/")
        ? "../index.html"
        : "index.html";
    }
    return user ? JSON.parse(user) : null;
  },

  // Produtos / Estoque
  async getProducts(params = {}) {
    const query = new URLSearchParams(params).toString();
    const path = query ? `/products?${query}` : "/products";
    const response = await this.apiFetch(path);
    // Handle both paginated and non-paginated responses for backward compatibility
    if (response && response.data) {
      return response.data;
    }
    return response;
  },

  getSearchQuickLinks() {
    return [
      {
        title: "Dashboard",
        desc: "Visão geral do sistema",
        href: "/dashboard.html",
      },
      {
        title: "Estoque",
        desc: "Consultar produtos e quantidades",
        href: "/pages/estoque.html",
      },
      {
        title: "Entradas",
        desc: "Registrar produtos no estoque",
        href: "/pages/entradas.html",
      },
      {
        title: "Histórico de Vendas",
        desc: "Ver vendas e reservas",
        href: "/pages/historico-vendas.html",
      },
      {
        title: "Contas a Pagar",
        desc: "Boletos, vencimentos e alertas financeiros",
        href: "/pages/contas-a-pagar.html",
      },
      {
        title: "Configurações",
        desc: "Ajustar preferências do sistema",
        href: "/pages/configuracoes.html",
      },
    ];
  },

  async getSearchResults(query) {
    const trimmed = (query || "").trim();
    const matchedLinks = this.getSearchQuickLinks().filter((item) =>
      `${item.title} ${item.desc}`.toLowerCase().includes(trimmed.toLowerCase()),
    );
    let products = [];
    if (trimmed) {
      try {
        products = await this.getProducts({ search: trimmed });
      } catch {
        products = [];
      }
    }
    return { links: trimmed ? matchedLinks : this.getSearchQuickLinks(), products };
  },

  buildSearchResults(container, results) {
    if (!container) return;
    const { links, products } = results || {};
    if ((!links || links.length === 0) && (!products || products.length === 0)) {
      container.innerHTML = '<div class="search-empty">Nenhum resultado encontrado.</div>';
      container.style.display = "block";
      return;
    }

    const parts = [];
    if (links && links.length) {
      parts.push(
        `<div class="search-group"><div class="search-group-title">Atalhos</div>${links
          .map(
            (item) =>
              `<button type="button" class="search-result-item" data-href="${item.href}"><strong>${this.escapeHtml(
                item.title,
              )}</strong><span>${this.escapeHtml(item.desc)}</span></button>`,
          )
          .join("")}</div>`,
      );
    }
    if (products && products.length) {
      parts.push(
        `<div class="search-group"><div class="search-group-title">Produtos</div>${products
          .slice(0, 8)
          .map(
            (product) =>
              `<button type="button" class="search-result-item" data-href="/pages/estoque.html?productId=${encodeURIComponent(product._id || product.id)}"><strong>${this.escapeHtml(
                product.name,
              )}</strong><span>${this.escapeHtml(product.sku || "")} · ${this.escapeHtml(
                product.supplier || "Fornecedor desconhecido",
              )} · ${Number(product.quantity || 0)} un</span></button>`,
          )
          .join("")}</div>`,
      );
    }

    container.innerHTML = parts.join("");
    container.style.display = "block";
    container.querySelectorAll(".search-result-item").forEach((button) => {
      button.addEventListener("click", () => {
        const href = button.dataset.href;
        if (href) window.location.href = href;
      });
    });
  },

  async updatePageSearch(searchBar, value) {
    const input = searchBar.querySelector("input");
    if (!input) return;
    const resultsContainer = searchBar.querySelector(".search-results");
    if (!resultsContainer) return;

    if (!value || !value.trim()) {
      this.buildSearchResults(resultsContainer, { links: this.getSearchQuickLinks(), products: [] });
      return;
    }

    const results = await this.getSearchResults(value);
    this.buildSearchResults(resultsContainer, results);
  },

  attachSearchBar(searchBar) {
    const input = searchBar.querySelector("input");
    if (!input || input.dataset.searchAttached) return;
    if (input.id === "dashboardSearchInput" || searchBar.id === "dashboardSearchBar") return;

    let resultsContainer = searchBar.querySelector(".search-results");
    if (!resultsContainer) {
      resultsContainer = document.createElement("div");
      resultsContainer.className = "search-results";
      searchBar.appendChild(resultsContainer);
    }

    const onInput = async (event) => {
      await this.updatePageSearch(searchBar, event.target.value);
    };

    const debounced = (() => {
      let timer;
      return (callback, delay = 250) => {
        clearTimeout(timer);
        timer = setTimeout(callback, delay);
      };
    })();

    input.addEventListener("input", (event) => {
      debounced(() => onInput(event), 250);
    });

    input.addEventListener("focus", (event) => {
      this.updatePageSearch(searchBar, event.target.value);
    });

    document.addEventListener("click", (event) => {
      if (!searchBar.contains(event.target)) {
        resultsContainer.style.display = "none";
      }
    });

    input.dataset.searchAttached = "1";
  },

  initGlobalSearch() {
    document.querySelectorAll(".search-bar").forEach((searchBar) => {
      this.attachSearchBar(searchBar);
    });
  },

  initUserMenu() {
    document.querySelectorAll(".user-profile").forEach((profile) => {
      if (profile.dataset.userMenuAttached) return;

      const dropdown = document.createElement("div");
      dropdown.className = "user-dropdown";
      dropdown.innerHTML = `
        <button type="button" class="user-dropdown-item" data-href="pages/configuracoes.html">
          <i class="fa-solid fa-sliders"></i> Configurações
        </button>
        <button type="button" class="user-dropdown-item danger" data-action="logout">
          <i class="fa-solid fa-arrow-right-from-bracket"></i> Sair
        </button>
      `;
      profile.appendChild(dropdown);

      profile.addEventListener("click", (event) => {
        event.stopPropagation();
        if (dropdown.classList.contains("active")) {
          dropdown.classList.remove("active");
          return;
        }
        dropdown.classList.add("active");
      });

      dropdown.addEventListener("click", (event) => {
        event.stopPropagation();
        const btn = event.target.closest(".user-dropdown-item");
        if (!btn) return;

        if (btn.dataset.action === "logout") {
          this.logout();
        } else if (btn.dataset.href) {
          window.location.href = btn.dataset.href;
        }
        dropdown.classList.remove("active");
      });

      document.addEventListener("click", () => {
        dropdown.classList.remove("active");
      });

      profile.dataset.userMenuAttached = "1";
    });
  },

  async createProduct(product) {
    return await this.apiFetch("/products", {
      method: "POST",
      body: JSON.stringify(product),
    });
  },

  async updateProduct(id, updates, options = {}) {
    const body = {
      id: this.normalizeId(id),
      ...updates,
    };
    if (options.transfer) body.transfer = options.transfer;
    if (options.adjustmentReason)
      body.adjustmentReason = options.adjustmentReason;
    return await this.apiFetch("/products", {
      method: "PUT",
      body: JSON.stringify(body),
    });
  },

  async deleteProduct(id) {
    return await this.apiFetch(
      `/products?id=${encodeURIComponent(this.normalizeId(id))}`,
      {
        method: "DELETE",
      },
    );
  },

  async getSales(params = {}) {
    const query = new URLSearchParams(params).toString();
    const path = query ? `/sales?${query}` : "/sales";
    const response = await this.apiFetch(path);
    // Handle both paginated and non-paginated responses for backward compatibility
    if (response && response.data) {
      return response.data;
    }
    return response;
  },

  async updateSale(id, data) {
    return await this.apiFetch(
      `/sales?id=${encodeURIComponent(this.normalizeId(id))}`,
      {
        method: "PUT",
        body: JSON.stringify(data),
      },
    );
  },

  async deleteSale(id) {
    return await this.apiFetch(
      `/sales?id=${encodeURIComponent(this.normalizeId(id))}`,
      { method: "DELETE" },
    );
  },

  // Vendas / PDV
  async createSale(saleData) {
    return await this.apiFetch("/sales", {
      method: "POST",
      body: JSON.stringify(saleData),
    });
  },

  /** Estoque livre para venda ou reserva: físico − reservado */
  getProductAvailableStock(product) {
    const qty = Number(product?.quantity) || 0;
    const reserved = Math.max(0, Number(product?.reserved) || 0);
    return qty - reserved;
  },

  findProductById(products, id) {
    const nid = this.normalizeId(id);
    return (products || []).find((p) => this.normalizeId(p._id) === nid);
  },

  getCartQtyForProduct(cart, productId, excludeIndex = -1) {
    const nid = this.normalizeId(productId);
    let total = 0;
    (cart || []).forEach((item, idx) => {
      if (idx === excludeIndex) return;
      if (this.normalizeId(item._id) === nid) {
        total += Math.max(0, parseInt(item.qty, 10) || 0);
      }
    });
    return total;
  },

  validateLineStock(product, cart, lineQty, lineIndex = -1) {
    const available = this.getProductAvailableStock(product);
    const others = this.getCartQtyForProduct(cart, product._id, lineIndex);
    const qty = Math.max(0, parseInt(lineQty, 10) || 0);
    const total = others + qty;

    if (total > available) {
      const maxLine = Math.max(0, available - others);
      const reserved = Math.max(0, Number(product.reserved) || 0);
      const physical = Math.max(0, Number(product.quantity) || 0);
      const deficit = total - available;
      let message;
      if (available === 0) {
        message = `${product.name}: sem unidades disponíveis (${reserved} reservada(s) de ${physical} no estoque). A venda gerará saldo negativo de ${deficit} un.`;
      } else if (others > 0) {
        message = `${product.name}: no carrinho já há ${others} un.; máximo adicional: ${maxLine} (${available} disponível(is)). A venda excederá em ${deficit} un.`;
      } else {
        message = `${product.name}: máximo ${maxLine} un. disponível(is) (${reserved} reservada(s)). A venda excederá em ${deficit} un.`;
      }
      return { ok: true, warning: true, available, maxLine, others, message };
    }
    return { ok: true, warning: false, available, maxLine: qty, others };
  },

  validateCartAgainstStock(cart, products) {
    const demand = new Map();
    for (const item of cart || []) {
      const id = this.normalizeId(item._id);
      if (!id) continue;
      const qty = Math.max(0, parseInt(item.qty, 10) || 0);
      demand.set(id, (demand.get(id) || 0) + qty);
    }

    const errors = [];
    const warnings = [];
    for (const [id, requested] of demand) {
      const product = this.findProductById(products, id);
      if (!product) {
        errors.push({
          message: "Um item do carrinho não foi encontrado no estoque.",
        });
        continue;
      }
      const available = this.getProductAvailableStock(product);
      if (requested > available) {
        const reserved = Math.max(0, Number(product.reserved) || 0);
        const physical = Math.max(0, Number(product.quantity) || 0);
        const deficit = requested - available;
        warnings.push({
          productName: product.name,
          requested,
          available,
          reserved,
          deficit,
          message: `${product.name}: ${requested} un. solicitada(s), ${available} disponível(is) (${reserved} reservada(s) de ${physical}). Saldo negativo de ${deficit} un. após a venda.`,
        });
      }
    }
    if (errors.length > 0) return { ok: false, errors, warnings };
    return { ok: true, errors: [], warnings };
  },

  // Endereçamento WMS
  DEFAULT_WAREHOUSE_DEPOSIT: "DEPÓSITO 01",

  getDefaultReceivingLocation() {
    return {
      aisle: "RECV",
      shelf: "00",
      level: "00",
      slot: "00",
      deposit: this.DEFAULT_WAREHOUSE_DEPOSIT,
    };
  },

  isReceivingLocation(locationOrProduct) {
    if (!locationOrProduct) return false;
    if (locationOrProduct.location) {
      return this.isReceivingLocation(
        this.getProductLocation(locationOrProduct),
      );
    }
    const loc =
      typeof locationOrProduct === "string"
        ? this.parseShelfAddress(locationOrProduct)
        : locationOrProduct;
    return String(loc.aisle || "")
      .trim()
      .toUpperCase()
      .startsWith("RECV");
  },

  formatAddressLabel(locationOrCode) {
    if (!locationOrCode) return "";
    if (typeof locationOrCode === "object") {
      if (this.isReceivingLocation(locationOrCode)) return "RECEBIMENTO";
      return this.formatShelfAddress(locationOrCode) || "";
    }
    const text = String(locationOrCode).trim();
    if (text.toUpperCase() === "RECEBIMENTO") return "RECEBIMENTO";
    if (text.toUpperCase().startsWith("RECV")) return "RECEBIMENTO";
    return text;
  },

  parseDestinationAddress(text) {
    const normalized = (text || "").trim().toUpperCase();
    if (normalized === "RECEBIMENTO" || normalized === "RECV") {
      return this.getDefaultReceivingLocation();
    }
    const parsed = this.parseShelfAddress(text);
    return {
      aisle: (parsed.aisle || "").toUpperCase(),
      shelf: parsed.shelf || "",
      level: parsed.level || "",
      slot: parsed.slot || "",
    };
  },

  formatShelfAddress(location) {
    if (!location) return "";
    const parts = [
      location.aisle,
      location.shelf,
      location.level,
      location.slot,
    ].filter(Boolean);
    return parts.join("-");
  },

  parseShelfAddress(str) {
    const parts = (str || "").split("-").map((s) => s.trim());
    return {
      aisle: parts[0] || "",
      shelf: parts[1] || "",
      level: parts[2] || "",
      slot: parts[3] || "",
    };
  },

  getProductLocation(product) {
    if (
      product?.location &&
      typeof product.location === "object" &&
      (product.location.aisle || product.location.shelf)
    ) {
      return product.location;
    }
    if (typeof product?.location === "string" && product.location.trim()) {
      return this.parseShelfAddress(product.location);
    }
    return { aisle: "", shelf: "", level: "", slot: "" };
  },

  formatProductLocationDisplay(product) {
    if (!product) return "Não definida";
    if (typeof product.location === "string" && product.location.trim()) {
      return this.formatAddressLabel(product.location.trim());
    }
    const loc = this.getProductLocation(product);
    if (this.isReceivingLocation(loc)) return "RECEBIMENTO";
    const code = this.formatShelfAddress(loc);
    return code || "Não definida";
  },

  escapeHtml(text) {
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
    return text == null ? '' : String(text).replace(/[&<>"']/g, c => map[c]);
  },

  formatCurrency(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return "R$ 0,00";
    return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  },

  /** Resumo financeiro do carrinho / venda (subtotal, descontos, total). */
  computeSaleSummary(
    cartItems,
    globalDiscount = 0,
    globalDiscountType = "percent",
  ) {
    let grossSubtotal = 0;
    let itemsDiscountTotal = 0;

    const items = (cartItems || []).map((item) => {
      const qty = Math.max(0, Number(item.qty) || 0);
      const price = Number(item.price) || 0;
      const lineGross = price * qty;
      grossSubtotal += lineGross;

      const discount = Math.max(0, Number(item.discount) || 0);
      const discountType = item.discountType || "percent";
      let discountAmount = 0;
      if (discount > 0) {
        discountAmount =
          discountType === "percent"
            ? lineGross * (discount / 100)
            : Math.min(lineGross, discount);
      }
      itemsDiscountTotal += discountAmount;

      const lineTotal = Math.max(0, lineGross - discountAmount);
      return {
        ...item,
        qty,
        price,
        discount,
        discountType,
        lineGross,
        discountAmount,
        discountLabel:
          discount > 0
            ? discountType === "percent"
              ? `${discount}%`
              : this.formatCurrency(discount)
            : null,
        lineTotal,
      };
    });

    const subtotalAfterItems = grossSubtotal - itemsDiscountTotal;
    const gVal = Math.max(0, Number(globalDiscount) || 0);
    let globalDiscountAmount = 0;
    if (gVal > 0) {
      globalDiscountAmount =
        globalDiscountType === "percent"
          ? subtotalAfterItems * (gVal / 100)
          : Math.min(subtotalAfterItems, gVal);
    }

    const total = Math.max(0, subtotalAfterItems - globalDiscountAmount);

    return {
      grossSubtotal,
      itemsDiscountTotal,
      subtotalAfterItems,
      globalDiscount: gVal,
      globalDiscountType: globalDiscountType || "percent",
      globalDiscountAmount,
      totalDiscount: itemsDiscountTotal + globalDiscountAmount,
      total,
      items,
    };
  },

  /** Imprime cupom térmico ou A4 com descontos e pagamento. */
  printSalePdf(sale, type, jsPDF, settings = {}) {
    const s = this.normalizeSaleRecord(sale);
    if (!s || !jsPDF) return;

    const storeName = settings.storeName || "BuildFlow ERP";
    const footer = settings.footerMessage || "Obrigado pela preferência!";

    if (type === "thermal") {
      let lineCount = 14;
      if (settings.showCompanyData && (settings.companyCnpj || settings.address)) lineCount += 3;
      s.items.forEach((item) => {
        lineCount += item.discountAmount > 0 ? 3 : 1;
      });
      if (s.itemsDiscountTotal > 0) lineCount += 1;
      if (s.globalDiscountAmount > 0) lineCount += 1;
      lineCount += 6;
      if (s.amountPaid != null) lineCount += 2;
      lineCount += 5;

      const doc = new jsPDF({
        unit: "mm",
        format: [80, Math.max(90, lineCount * 4.5)],
      });

      const ml = 5, mr = 75, cx = 40;
      const hrLight = (yy) => { doc.setDrawColor(200, 200, 200); doc.setLineWidth(0.15); doc.line(ml, yy, mr, yy); doc.setDrawColor(0, 0, 0); };
      const hrBold = (yy) => { doc.setDrawColor(0, 0, 0); doc.setLineWidth(0.4); doc.line(ml, yy, mr, yy); };
      let y = 10;

      // --- HEADER ---
      doc.setFont("courier", "bold");
      doc.setFontSize(14);
      doc.text(storeName, cx, y, { align: "center" });
      y += 5;
      doc.setFont("courier", "normal");
      doc.setFontSize(8);
      doc.text("COMPROVANTE DE VENDA", cx, y, { align: "center" });
      y += 3;
      doc.setFontSize(6);
      doc.text("NÃO FISCAL", cx, y, { align: "center" });
      y += 4;
      hrLight(y);
      y += 4;

      // --- SALE INFO ---
      doc.setFontSize(8);
      const d = new Date(s.createdAt);
      const dateStr = d.toLocaleDateString("pt-BR");
      const timeStr = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
      doc.text("DATA", ml, y);
      doc.text(`${dateStr}  ${timeStr}`, mr, y, { align: "right" });
      y += 3.5;
      doc.text("CUPOM", ml, y);
      doc.text(`#${s.saleNumber || String(s._id || "").slice(-6)}`, mr, y, { align: "right" });
      y += 3.5;
      doc.text("PGTO", ml, y);
      doc.text(`${s.paymentMethod || "—"}`, mr, y, { align: "right" });
      y += 3.5;

      // --- COMPANY DATA ---
      if (settings.showCompanyData) {
        if (settings.companyCnpj || settings.address) {
          hrLight(y);
          y += 3;
          doc.setFontSize(7);
          if (settings.companyCnpj) {
            doc.text(`CNPJ ${settings.companyCnpj}`, cx, y, { align: "center" });
            y += 3;
          }
          if (settings.address) {
            const addrLines = doc.splitTextToSize(String(settings.address), mr - ml);
            addrLines.forEach(line => { doc.text(line, cx, y, { align: "center" }); y += 3; });
          }
          y += 2;
        }
      }

      hrBold(y);
      y += 4;

      // --- COLUMN HEADER ---
      doc.setFont("courier", "bold");
      doc.setFontSize(7);
      doc.text("QTD  COD   PRODUTO", ml, y);
      doc.text("VALOR", mr, y, { align: "right" });
      y += 3;
      hrLight(y);
      y += 3.5;

      // --- ITEMS ---
      doc.setFont("courier", "normal");
      s.items.forEach((item) => {
        const qtyStr = String(item.qty).padStart(3, "0");
        const shortSku = ((item.sku || "").slice(-5)).padEnd(5, " ");
        const nameMax = 22;
        const name = (item.name || "Produto").substring(0, nameMax);
        doc.setFontSize(7);
        doc.text(`${qtyStr}  ${shortSku}  ${name}`, ml, y);
        if (item.discountAmount > 0) {
          doc.text(this.formatCurrency(item.lineGross), mr, y, { align: "right" });
          y += 3;
          doc.setFontSize(5.5);
          doc.setTextColor(140, 140, 140);
          doc.text(`  Desc. ${item.discountLabel || ""}`, ml, y);
          doc.text(`-${this.formatCurrency(item.discountAmount)}`, mr, y, { align: "right" });
          doc.setTextColor(0, 0, 0);
          y += 2;
          doc.setFont("courier", "bold");
          doc.setFontSize(7);
          doc.text(this.formatCurrency(item.lineTotal), mr, y, { align: "right" });
          doc.setFont("courier", "normal");
        } else {
          doc.setFont("courier", "bold");
          doc.text(this.formatCurrency(item.lineTotal), mr, y, { align: "right" });
          doc.setFont("courier", "normal");
        }
        y += 3.5;
      });

      hrBold(y);
      y += 3.5;

      // --- TOTALS ---
      doc.setFontSize(7);
      if (s.grossSubtotal > 0) {
        doc.text("Subtotal bruto:", ml, y);
        doc.text(this.formatCurrency(s.grossSubtotal), mr, y, { align: "right" });
        y += 3;
      }
      if (s.itemsDiscountTotal > 0) {
        doc.text("Desconto nos itens:", ml, y);
        doc.text(`-${this.formatCurrency(s.itemsDiscountTotal)}`, mr, y, { align: "right" });
        y += 3;
      }
      if (s.globalDiscountAmount > 0) {
        const gLabel = s.globalDiscountType === "percent"
          ? `Desconto na venda (${s.globalDiscount}%):`
          : "Desconto na venda:";
        doc.text(gLabel, ml, y);
        doc.text(`-${this.formatCurrency(s.globalDiscountAmount)}`, mr, y, { align: "right" });
        y += 3;
      }
      y += 1.5;

      // --- TOTAL BOX ---
      const totalY = y;
      const boxH = 9;
      const boxLabel = "TOTAL A PAGAR";
      const boxVal = this.formatCurrency(s.total);
      doc.setDrawColor(0, 0, 0);
      doc.setLineWidth(0.4);
      doc.roundedRect(ml - 1, totalY, mr - ml + 2, boxH, 2, 2);
      doc.setFont("courier", "bold");
      doc.setFontSize(9);
      doc.text(boxLabel, ml + 3, totalY + boxH - 2.5);
      doc.text(boxVal, mr - 3, totalY + boxH - 2.5, { align: "right" });
      y = totalY + boxH + 4;
      doc.setFont("courier", "normal");

      // --- PAYMENT ---
      doc.setFontSize(7);
      if (s.amountPaid != null) {
        hrLight(y);
        y += 2.5;
        doc.text("Valor recebido:", ml, y);
        doc.text(this.formatCurrency(s.amountPaid), mr, y, { align: "right" });
        y += 3;
        doc.setFont("courier", "bold");
        doc.text("Troco:", ml, y);
        doc.text(this.formatCurrency(s.change || 0), mr, y, { align: "right" });
        doc.setFont("courier", "normal");
        y += 3;
      }

      // --- BOTTOM LINE ---
      y += 1;
      hrBold(y);
      y += 4;

      // --- FOOTER ---
      doc.setFontSize(8);
      doc.text(footer, cx, y, { align: "center" });
      y += 3.5;
      doc.setFontSize(6);
      const legalLines = doc.splitTextToSize(settings.receiptLegalNote || "Documento não fiscal", mr - ml);
      legalLines.forEach((line) => {
        doc.text(line, cx, y, { align: "center" });
        y += 2.5;
      });
      y += 1;
      doc.text(`PROCON ${settings.proconNumber || "151"}`, cx, y, { align: "center" });

      if (settings.useQz && window.QzPrint) {
        QzPrint.printPdf(doc.output('arraybuffer'));
      } else {
        window.open(doc.output("bloburl"), "_blank");
      }
      return;
    }

    const doc = new jsPDF();
    const margin = 20;
    doc.setFontSize(22);
    doc.setTextColor(59, 130, 246);
    doc.text(storeName, margin, 25);
    doc.setFontSize(10);
    doc.setTextColor(100, 116, 139);
    doc.text("Comprovante de Venda", margin, 32);
    doc.line(margin, 38, 190, 38);

    doc.setTextColor(30, 41, 59);
    doc.setFontSize(11);
    doc.text(
      `Venda #${s.saleNumber || String(s._id || "").slice(-6)}`,
      margin,
      50,
    );
    doc.text(
      `Data: ${new Date(s.createdAt).toLocaleString("pt-BR")}`,
      margin,
      57,
    );
    doc.text(`Pagamento: ${s.paymentMethod || "—"}`, 190, 50, {
      align: "right",
    });
    doc.text(`Status: ${s.status || "FINALIZED"}`, 190, 57, { align: "right" });

    if (settings.showCompanyData) {
      doc.setFontSize(9);
      doc.setTextColor(100, 116, 139);
      doc.text(settings.companyName || "", margin, 65);
      doc.text(
        `CNPJ: ${settings.companyCnpj || ""} | ${settings.address || ""}`,
        margin,
        70,
      );
    }

    const tableData = s.items.map((i) => {
      const disc =
        i.discountAmount > 0
          ? `-${this.formatCurrency(i.discountAmount)} (${i.discountLabel || ""})`
          : "—";
      return [
        i.name || "Produto",
        i.sku || "—",
        String(i.qty),
        this.formatCurrency(i.price),
        disc,
        this.formatCurrency(i.lineTotal),
      ];
    });

    doc.autoTable({
      head: [["Item", "SKU", "Qtd", "Unit.", "Desconto", "Total"]],
      body: tableData,
      startY: settings.showCompanyData ? 75 : 65,
      margin: { left: margin, right: margin },
      theme: "striped",
      headStyles: { fillColor: [59, 130, 246] },
      styles: { fontSize: 9 },
    });

    let finalY = doc.lastAutoTable.finalY + 8;
    doc.setFontSize(10);
    doc.setTextColor(30, 41, 59);
    if (s.grossSubtotal > 0) {
      doc.text(
        `Subtotal bruto: ${this.formatCurrency(s.grossSubtotal)}`,
        190,
        finalY,
        { align: "right" },
      );
      finalY += 6;
    }
    if (s.itemsDiscountTotal > 0) {
      doc.text(
        `Desconto nos itens: -${this.formatCurrency(s.itemsDiscountTotal)}`,
        190,
        finalY,
        { align: "right" },
      );
      finalY += 6;
    }
    if (s.globalDiscountAmount > 0) {
      const gl =
        s.globalDiscountType === "percent"
          ? `Desconto na venda (${s.globalDiscount}%): -${this.formatCurrency(s.globalDiscountAmount)}`
          : `Desconto na venda: -${this.formatCurrency(s.globalDiscountAmount)}`;
      doc.text(gl, 190, finalY, { align: "right" });
      finalY += 6;
    }
    doc.setFontSize(14);
    doc.setFont(undefined, "bold");
    doc.text(`TOTAL: ${this.formatCurrency(s.total)}`, 190, finalY, {
      align: "right",
    });
    finalY += 8;
    doc.setFontSize(10);
    doc.setFont(undefined, "normal");
    if (s.amountPaid != null) {
      doc.text(
        `Valor recebido: ${this.formatCurrency(s.amountPaid)}`,
        190,
        finalY,
        { align: "right" },
      );
      finalY += 6;
      doc.text(`Troco: ${this.formatCurrency(s.change || 0)}`, 190, finalY, {
        align: "right",
      });
    }
    if (settings.useQz && window.QzPrint) {
      QzPrint.printPdf(doc.output('arraybuffer'));
    } else {
      window.open(doc.output("bloburl"), "_blank");
    }
  },

  /** Converte texto do campo de desconto (R$ 10,50 ou 10%) em número. */
  parseDiscountInput(raw) {
    if (raw == null) return 0;
    let s = String(raw).trim();
    if (!s) return 0;
    s = s
      .replace(/%/g, "")
      .replace(/R\$\s?/gi, "")
      .replace(/\s/g, "");
    if (s.includes(",") && s.includes(".")) {
      s = s.replace(/\./g, "").replace(",", ".");
    } else {
      s = s.replace(",", ".");
    }
    const n = parseFloat(s);
    return Number.isFinite(n) ? Math.max(0, n) : 0;
  },

  /** Exibe desconto formatado para o PDV. */
  formatDiscountInput(value, type) {
    const n = Math.max(0, Number(value) || 0);
    if (type === "percent") {
      if (n === 0) return "";
      const capped = Math.min(100, n);
      const formatted = capped.toLocaleString("pt-BR", {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
      });
      return `${formatted}%`;
    }
    if (n === 0) return "";
    return this.formatCurrency(n);
  },

  /**
   * Campo de desconto com máscara (% ou R$).
   * @returns {{ getValue: Function, refresh: Function }}
   */
  initPdvDiscountField(inputId, getTypeFn, initialValue = 0) {
    const el = document.getElementById(inputId);
    if (!el) {
      return { getValue: () => 0, refresh: () => {} };
    }

    el.type = "text";
    el.inputMode = "decimal";
    el.autocomplete = "off";
    el.classList.add("pdv-discount-input");

    const setRaw = (num) => {
      el.dataset.rawValue = String(Math.max(0, Number(num) || 0));
    };

    const applyFormat = () => {
      const type = getTypeFn();
      const num = this.parseDiscountInput(el.dataset.rawValue ?? el.value);
      setRaw(num);
      el.value = this.formatDiscountInput(num, type);
      el.placeholder = type === "percent" ? "0%" : "R$ 0,00";
      el.classList.toggle("pdv-discount-input--percent", type === "percent");
      el.classList.toggle("pdv-discount-input--value", type === "value");
    };

    const showEditingValue = () => {
      const num = this.parseDiscountInput(el.dataset.rawValue ?? el.value);
      if (num === 0) {
        el.value = "";
        return;
      }
      el.value = num.toLocaleString("pt-BR", {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
      });
    };

    setRaw(initialValue);
    applyFormat();

    el.addEventListener("focus", showEditingValue);
    el.addEventListener("blur", applyFormat);
    el.addEventListener("input", () => {
      setRaw(this.parseDiscountInput(el.value));
    });

    return {
      getValue() {
        const type = getTypeFn();
        let num = BuildFlow.parseDiscountInput(el.dataset.rawValue ?? el.value);
        if (type === "percent") num = Math.min(100, num);
        return num;
      },
      refresh: applyFormat,
    };
  },

  /** Carrega JsBarcode do arquivo local (evita falha de CDN). */
  loadJsBarcode() {
    if (typeof window.JsBarcode !== "undefined") {
      return Promise.resolve(window.JsBarcode);
    }
    if (window.__jsBarcodeLoadPromise) {
      return window.__jsBarcodeLoadPromise;
    }
    const scriptPath = "/js/JsBarcode.all.min.js";

    window.__jsBarcodeLoadPromise = new Promise((resolve, reject) => {
      const existing = document.querySelector("script[data-jsbarcode]");
      if (existing) {
        existing.addEventListener("load", () => resolve(window.JsBarcode));
        existing.addEventListener("error", () =>
          reject(new Error("JsBarcode")),
        );
        return;
      }
      const script = document.createElement("script");
      script.src = scriptPath;
      script.async = true;
      script.setAttribute("data-jsbarcode", "1");
      script.onload = () => resolve(window.JsBarcode);
      script.onerror = () =>
        reject(new Error("Falha ao carregar JsBarcode.all.min.js"));
      document.head.appendChild(script);
    });

    return window.__jsBarcodeLoadPromise;
  },

  isValidEan13(digits13) {
    if (!/^\d{13}$/.test(digits13)) return false;
    let sum = 0;
    for (let i = 0; i < 12; i++) {
      sum += parseInt(digits13[i], 10) * (i % 2 === 0 ? 1 : 3);
    }
    const check = (10 - (sum % 10)) % 10;
    return check === parseInt(digits13[12], 10);
  },

  /** Lê o código de barras já cadastrado no produto (não gera número novo). */
  getProductBarcodeForLabel(product) {
    const raw = String(product?.barcode || "").trim();
    if (!raw) return null;

    const digits = raw.replace(/\D/g, "");
    if (digits.length === 13 && this.isValidEan13(digits)) {
      return { format: "EAN13", value: digits, text: raw, digits };
    }
    const codeValue = digits.length >= 4 ? digits : raw;
    return {
      format: "CODE128",
      value: codeValue,
      text: raw,
      digits: digits || codeValue,
    };
  },

  /** Desenha código de barras nos elementos SVG (somente visualização). */
  renderBarcodeOnElements(elements, payload) {
    const lib = window.JsBarcode;
    if (!lib || !payload || !elements?.length) return false;

    const baseOptions = {
      width: 1.5,
      height: 40,
      displayValue: true,
      fontSize: 10,
      font: "monospace",
      fontOptions: "bold",
      textMargin: 2,
      margin: 4,
      lineColor: "#000000",
      background: "transparent",
      text: payload.text,
    };

    const attempts = [
      { format: payload.format, value: payload.value },
      { format: "CODE128", value: payload.digits || payload.value },
      { format: "CODE128", value: payload.text },
    ];
    if (payload.digits && payload.digits.length === 13) {
      attempts.push({ format: "EAN13", value: payload.digits });
    }

    for (const attempt of attempts) {
      try {
        lib(elements, attempt.value, {
          ...baseOptions,
          format: attempt.format,
        });
        return true;
      } catch (e) {
        continue;
      }
    }
    return false;
  },

  locationFromAddress(addr) {
    if (!addr) return { aisle: "", shelf: "", level: "", slot: "" };
    return {
      aisle: addr.aisle || "",
      shelf: addr.shelf || "",
      level: addr.level || "",
      slot: addr.slot || "",
    };
  },

  async getWarehouseAddresses(params = {}) {
    const query = new URLSearchParams(params).toString();
    const path = query
      ? `/warehouse-addresses?${query}`
      : "/warehouse-addresses";
    return await this.apiFetch(path);
  },

  // Caixa (Abertura/Fechamento)
  async getCaixaStatus() {
    return await this.apiFetch('/caixa?status=aberto');
  },

  async abrirCaixa(valorInicial, observacao = '', userName = '', numeroCaixa = '01') {
    return await this.apiFetch('/caixa', {
      method: 'POST',
      body: JSON.stringify({ action: 'abrir', valorInicial, observacao, userName, numeroCaixa })
    });
  },

  async verificarSenhaCaixa(password) {
    return await this.apiFetch('/caixa', {
      method: 'POST',
      body: JSON.stringify({ action: 'verificar-senha', password })
    });
  },

  async fecharCaixa(observacao = '') {
    return await this.apiFetch('/caixa', {
      method: 'POST',
      body: JSON.stringify({ action: 'fechar', observacao })
    });
  },

  async getCaixaHistory() {
    return await this.apiFetch('/caixa');
  },

  async getStockMovements(params = {}) {
    const query = new URLSearchParams(params).toString();
    const path = query ? `/stock-movements?${query}` : "/stock-movements";
    return await this.apiFetch(path);
  },

  async saveImport(data) {
    return await this.apiFetch("/imports", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  async createWarehouseAddress(data) {
    return await this.apiFetch("/warehouse-addresses", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  async getUnits() {
    return await this.apiFetch("/units");
  },

  async createUnit(data) {
    return await this.apiFetch("/units", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  async updateWarehouseAddress(id, data) {
    return await this.apiFetch("/warehouse-addresses", {
      method: "PUT",
      body: JSON.stringify({ id: this.normalizeId(id), ...data }),
    });
  },

  async deleteWarehouseAddress(id) {
    return await this.apiFetch(
      `/warehouse-addresses?id=${encodeURIComponent(this.normalizeId(id))}`,
      {
        method: "DELETE",
      },
    );
  },

  // Dashboard
  getDashboardMetricsCacheKey(period) {
    return `buildflow_dashboard_cache_${period}`;
  },

  async getDashboardMetrics(period = 'month', tzOffset, selectedDate) {
    const cacheKey = this.getDashboardMetricsCacheKey(period + (selectedDate || ''));
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      try {
        const { data, expiry } = JSON.parse(cached);
        if (Date.now() < expiry) return data;
      } catch { /* ignore */ }
    }
    const data = await this.fetchAndCacheMetrics(period, tzOffset, selectedDate);
    localStorage.setItem(cacheKey, JSON.stringify({ data, expiry: Date.now() + 30000 }));
    return data;
  },

  // Configurações
  getSettings() {
    const defaults = {
        storeName: "BuildFlow ERP",
        companyName: "BuildFlow ERP & Logística S.A.",
        companyCnpj: "12.345.678/0001-90",
        address: "Av. Principal, 1000 - São Paulo/SP",
        autoPrint: false,
        useQz: false,
        printType: "thermal",
        showCompanyData: true,
        footerMessage: "Obrigado pela preferência!",
        receiptLegalNote: "Documento não fiscal emitido conforme Lei Complementar nº 123/2006",
        proconNumber: "151",
        darkMode: true,
        pushNotifications: true,
        systemSounds: false,
    };
    const saved = JSON.parse(localStorage.getItem("buildflow_settings")) || {};
    return { ...defaults, ...saved };
  },

  async fetchAndCacheMetrics(period = 'month', tzOffset, selectedDate) {
    const tz = tzOffset ?? new Date().getTimezoneOffset();
    let url = `/dashboard?period=${period}&tzOffset=${tz}`;
    if (selectedDate) url += `&date=${selectedDate}`;
    return await this.apiFetch(url);
  },

  async getWmsSummary() {
    const products = await this.getProducts({ limit: 'all' });
    const withoutAddress = products.filter(
      (p) => !this.formatShelfAddress(this.getProductLocation(p)),
    ).length;
    const withAddress = products.length - withoutAddress;
    return { total: products.length, withoutAddress, withAddress, products };
  },

  // Sincronização automática removida
  async syncOfflineData() {
    return;
  },

  // UI Utilities
  applyTheme() {
    const settings = this.getSettings();
    if (settings.darkMode === false) {
      document.body.classList.add("light-theme");
    } else {
      document.body.classList.remove("light-theme");
    }
  },

  showToast(message, type = "info") {
    if (typeof Swal !== "undefined") {
      const Toast = Swal.mixin({
        toast: true,
        position: "top-end",
        showConfirmButton: false,
        timer: 3000,
        timerProgressBar: true,
        backdrop: false, // REMOVE BACKDROP
        didOpen: (toast) => {
          toast.addEventListener("mouseenter", Swal.stopTimer);
          toast.addEventListener("mouseleave", Swal.resumeTimer);
        },
      });

      Toast.fire({
        icon: type === "danger" ? "error" : type,
        title: message,
      });
      return;
    }

    let container = document.getElementById("global-toast-container");
    if (!container) {
      container = document.createElement("div");
      container.id = "global-toast-container";
      container.style.cssText =
        "position:fixed; top:24px; right:24px; z-index:9999;";
      document.body.appendChild(container);
    }

    const toast = document.createElement("div");
    const bgColor =
      type === "success"
        ? "#10b981"
        : type === "warning"
          ? "#f59e0b"
          : type === "danger"
            ? "#ef4444"
            : "#3b82f6";

    toast.style.cssText = `
            background: ${bgColor};
            color: white;
            padding: 12px 20px;
            border-radius: 8px;
            margin-bottom: 10px;
            box-shadow: 0 10px 15px -3px rgba(0,0,0,0.2);
            font-size: 0.875rem;
            display: flex;
            align-items: center;
            gap: 10px;
            animation: slideIn 0.3s ease-out;
        `;

    const icon = type === "success" ? "fa-check-circle" : "fa-circle-info";
    toast.innerHTML = `<i class="fa-solid ${icon}"></i> <span>${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = "0";
      toast.style.transform = "translateX(100%)";
      toast.style.transition = "all 0.3s";
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  },
};

// Auto-init
document.addEventListener("DOMContentLoaded", async () => {
  BuildFlow.checkAuth();
  BuildFlow.applyTheme();
  BuildFlow.initGlobalSearch();
  BuildFlow.initUserMenu();
});

// Animation CSS
const style = document.createElement("style");
style.innerHTML = `
    @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
    }
`;
document.head.appendChild(style);

// Inicialização e Listeners Online/Offline
window.addEventListener("online", () => {
  BuildFlow.showToast("Você está online!", "success");
});

window.addEventListener("offline", () => {
  BuildFlow.showToast(
    "Você está offline. Algumas funcionalidades podem não estar disponíveis.",
    "warning",
  );
});

window.BuildFlow = BuildFlow;
