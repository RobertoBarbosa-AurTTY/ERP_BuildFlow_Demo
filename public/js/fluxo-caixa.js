// Fluxo de Caixa Projetado + DRE do período.
(function () {
  let report = null;

  const els = {};

  function $(id) {
    return document.getElementById(id);
  }

  function formatCurrency(v) {
    return BuildFlow.formatCurrency(v);
  }

  function moneyClass(v) {
    return v >= 0 ? "pos" : "neg";
  }

  async function loadData() {
    const period = els.periodSelect?.value || "month";
    const date = els.dateSelect?.value || "";
    const params = new URLSearchParams();
    params.set("period", period);
    const tzOffset = -new Date().getTimezoneOffset();
    params.set("tzOffset", String(tzOffset));
    if (date) params.set("date", date);

    const res = await BuildFlow.apiFetch(`/financial-report?${params.toString()}`);
    report = res;
    renderAll();
  }

  function renderKpis() {
    if (!report) return;
    const last = report.cashFlow[report.cashFlow.length - 1];
    const entradas = report.cashFlow.reduce((s, d) => s + d.entradaRealizada + d.entradaPrevista, 0);
    const saidas = report.cashFlow.reduce((s, d) => s + d.saidaRealizada + d.saidaPrevista, 0);
    els.kpiIn.textContent = formatCurrency(entradas);
    els.kpiOut.textContent = formatCurrency(saidas);
    els.kpiBalance.textContent = formatCurrency(last?.saldoAcumulado || 0);
    els.kpiBalance.className = "stat-info";
    els.kpiBalance.style.color = (last?.saldoAcumulado || 0) < 0 ? "var(--red)" : "";
    els.kpiDre.textContent = formatCurrency(report.dre.resultadoOperacional);
    els.kpiDre.style.color = report.dre.resultadoOperacional < 0 ? "var(--red)" : "";
  }

  function renderChart() {
    if (!els.flowChart || !report) return;
    const maxAbs = Math.max(
      1,
      ...report.cashFlow.map((d) => Math.max(d.entradaRealizada + d.entradaPrevista, d.saidaRealizada + d.saidaPrevista, Math.abs(d.saldoAcumulado))),
    );

    const minAcc = Math.min(0, ...report.cashFlow.map((d) => Math.min(d.saldoAcumulado, 0)));
    const range = maxAbs - minAcc;
    const bottomPct = range === 0 ? 0 : (Math.abs(minAcc) / range) * 100;

    els.flowChart.innerHTML = report.cashFlow
      .map((day) => {
        const entrada = day.entradaRealizada + day.entradaPrevista;
        const saida = day.saidaRealizada + day.saidaPrevista;
        const hIn = range === 0 ? 0 : (entrada / range) * 100;
        const hOut = range === 0 ? 0 : (saida / range) * 100;
        const accPct = range === 0 ? 0 : ((day.saldoAcumulado - minAcc) / range) * 100;
        const label = day.dia.slice(5).replace("-", "/");
        const isToday = day.isToday;
        const cls = isToday ? "fc-bar-wrap fc-today" : "fc-bar-wrap";
        const title = `${day.dia} — Entrada: ${formatCurrency(entrada)} · Saída: ${formatCurrency(saida)} · Saldo: ${formatCurrency(day.saldoAcumulado)}`;
        return `<div class="${cls}" title="${title}">
          <div class="fc-bar fc-bar--in" style="height:${Math.max(0, hIn)}%;"></div>
          <div class="fc-bar fc-bar--out" style="height:${Math.max(0, hOut)}%;"></div>
          <span>${label}</span>
        </div>`;
      })
      .join("");
  }

  function renderDre() {
    if (!els.dreTable || !report) return;
    const d = report.dre;
    const set = (id, v) => {
      const el = $(id);
      if (el) {
        el.textContent = formatCurrency(v);
        if (id === "dreResultado") el.style.color = v < 0 ? "var(--red)" : "";
      }
    };
    els.drePeriodLabel.textContent =
      report.period === "day"
        ? new Date(report.startDate).toLocaleDateString("pt-BR")
        : report.period === "week"
          ? "Últimos 7 dias"
          : "Mês atual";
    set("dreReceitaBruta", d.receitaBruta);
    set("dreDeducoes", d.deducoes);
    set("dreReceitaLiquida", d.receitaLiquida);
    set("dreCmv", d.cmv);
    set("dreLucroBruto", d.lucroBruto);
    set("dreDespesas", d.despesasPagas);
    set("dreOutros", d.outrosRecebimentos);
    set("dreResultado", d.resultadoOperacional);
  }

  function renderDaysTable() {
    if (!els.daysTable || !report) return;
    els.daysTable.querySelector("tbody").innerHTML = report.cashFlow
      .map((day) => {
        const cell = (line, v, cls) =>
          `<td class="fc-day-cell ${moneyClass(cls)}" data-day="${day.dia}" data-line="${line}" title="Clique para ver como este valor foi calculado">${formatCurrency(v)}</td>`;
        return `<tr class="fc-day-row ${day.isToday ? "fc-today-row" : ""}" data-day="${day.dia}" title="Clique para ver a composição do dia">
          <td>${day.dia}${day.isToday ? " <small>(hoje)</small>" : ""} <span class="fc-modal-row-link">Ver detalhes</span></td>
          ${cell("entradaRealizada", day.entradaRealizada, day.entradaRealizada)}
          ${cell("entradaPrevista", day.entradaPrevista, day.entradaPrevista)}
          ${cell("saidaRealizada", -day.saidaRealizada, -day.saidaRealizada)}
          ${cell("saidaPrevista", -day.saidaPrevista, -day.saidaPrevista)}
          ${cell("saldoDia", day.saldoDia, day.saldoDia)}
          ${cell("saldoAcumulado", day.saldoAcumulado, day.saldoAcumulado)}
        </tr>`;
      })
      .join("");
  }

  // ===== Composição do dia (clique no valor/linha abre o cálculo) =====
  const DAY_LINES = {
    entradaRealizada: {
      title: "Entrada realizada",
      expl: "Soma das vendas finalizadas no dia (pelo valor que o cliente pagou) com as contas a receber que foram recebidas neste dia.",
      fonte: "Tabela de vendas (status FINALIZED, data da venda) + tabela de contas a receber (status recebido, data do recebimento)",
    },
    entradaPrevista: {
      title: "Entrada prevista",
      expl: "Soma das contas a receber em aberto (não recebidas nem canceladas) com vencimento neste dia.",
      fonte: "Tabela de contas a receber (status em aberto, data de vencimento)",
    },
    saidaRealizada: {
      title: "Saída realizada",
      expl: "Soma das contas a pagar quitadas neste dia. O dia considerado é o do pagamento (quando o dinheiro saiu); contas pagas depois do vencimento aparecem marcadas como \"em atraso\".",
      fonte: "Tabela de contas a pagar (status pago, data do pagamento)",
    },
    saidaPrevista: {
      title: "Saída prevista",
      expl: "Soma das contas a pagar em aberto (não pagas nem canceladas) com vencimento neste dia.",
      fonte: "Tabela de contas a pagar (status em aberto, data de vencimento)",
    },
  };

  function dayDetailParams(date) {
    const tzOffset = -new Date().getTimezoneOffset();
    return new URLSearchParams({ date, tzOffset: String(tzOffset) });
  }

  function daySectionHtml(cfg, focus) {
    const [c1, c2, c3] = cfg.cols;
    const rows = cfg.items.length
      ? cfg.items
          .map((i) => {
            const badge = i.emAtraso ? ` <span class="fc-badge-atraso">em atraso</span>` : "";
            const dataCell = i.vencimento
              ? `<span class="fc-venc">Venc ${fmtDay(i.vencimento)}</span> &middot; <span class="fc-pago">Pago em ${fmtDay(i.data)}</span>`
              : i.tipo === "venda"
                ? fmtDateOnly(i.data)
                : fmtDay(i.data);
            return `<tr><td>${BuildFlow.escapeHtml(i.descricao)}${badge}</td><td>${BuildFlow.escapeHtml(i.referencia)}</td><td class="num">${dataCell}</td><td class="num"><strong>${formatCurrency(i.amount)}</strong></td></tr>`;
          })
          .join("")
      : `<tr><td colspan="4" class="fc-modal-empty" style="padding:14px;">${cfg.emptyMsg}</td></tr>`;
    const nota = cfg.nota ? `<p class="fc-day-nota">${cfg.nota}</p>` : "";
    return `<div class="fc-day-section ${focus ? "fc-day-section--focus" : ""}">
      <div class="fc-day-section-head"><span>${cfg.title}</span><strong>${formatCurrency(cfg.total)}</strong></div>
      ${nota}
      <p class="fc-day-expl">${cfg.expl}</p>
      <p class="fc-day-fonte"><i class="fa-solid fa-database"></i> Fonte: ${cfg.fonte}</p>
      <table class="fc-modal-table"><thead><tr><th>${c1}</th><th>${c2}</th><th class="num">${c3}</th><th class="num">Valor</th></tr></thead><tbody>${rows}</tbody></table>
    </div>`;
  }

  function saldoSectionHtml(label, expl, rows, total, focus) {
    const body = rows
      .map(
        (r) =>
          `<tr><td>${BuildFlow.escapeHtml(r.label)}</td><td></td><td class="num">${r.data ? fmtDateOnly(r.data) : ""}</td><td class="num">${formatCurrency(r.value)}</td></tr>`,
      )
      .join("");
    return `<div class="fc-day-section ${focus ? "fc-day-section--focus" : ""}">
      <div class="fc-day-section-head"><span>${label}</span><strong>${formatCurrency(total)}</strong></div>
      <p class="fc-day-expl">${expl}</p>
      <table class="fc-modal-table"><thead><tr><th>Componente</th><th></th><th class="num">Data</th><th class="num">Valor</th></tr></thead><tbody>${body}</tbody></table>
    </div>`;
  }

  function buildDayDetailHtml(res, day, focusLine) {
    const e = (r) => r || { items: [], total: 0 };
    const inR = e(res.entradaRealizada);
    const inP = e(res.entradaPrevista);
    const outR = e(res.saidaRealizada);
    const outP = e(res.saidaPrevista);
    const saldoDia = inR.total + inP.total - outR.total - outP.total;
    const prevAcc = day.saldoAcumulado - day.saldoDia;
    const atrasadasOut = outR.items.filter((i) => i.emAtraso).length;

    const sections = [
      daySectionHtml(
        { ...DAY_LINES.entradaRealizada, total: inR.total, items: inR.items, emptyMsg: "Nenhuma entrada realizada neste dia.", cols: ["Descrição", "Forma / Cliente", "Data"] },
        focusLine === "entradaRealizada",
      ),
      daySectionHtml(
        { ...DAY_LINES.entradaPrevista, total: inP.total, items: inP.items, emptyMsg: "Nenhuma conta a receber prevista para este dia.", cols: ["Descrição", "Cliente", "Vencimento"] },
        focusLine === "entradaPrevista",
      ),
      daySectionHtml(
        {
          ...DAY_LINES.saidaRealizada,
          total: outR.total,
          items: outR.items,
          emptyMsg: "Nenhuma conta paga neste dia.",
          cols: ["Descrição", "Categoria", "Pago em"],
          nota: outR.items.length
            ? `${outR.items.length} ${outR.items.length > 1 ? "contas pagas" : "conta paga"} neste dia${atrasadasOut ? ` &middot; ${atrasadasOut} ${atrasadasOut > 1 ? "estavam" : "estava"} em atraso` : ""}`
            : "",
        },
        focusLine === "saidaRealizada",
      ),
      daySectionHtml(
        { ...DAY_LINES.saidaPrevista, total: outP.total, items: outP.items, emptyMsg: "Nenhuma conta a pagar prevista para este dia.", cols: ["Descrição", "Categoria", "Vencimento"] },
        focusLine === "saidaPrevista",
      ),
      saldoSectionHtml(
        "Saldo do dia",
        "Entradas do dia (realizadas + previstas) menos as saídas do dia (realizadas + previstas).",
        [
          { label: "Entradas realizadas", value: inR.total },
          { label: "Entradas previstas", value: inP.total },
          { label: "Saídas realizadas", value: -outR.total },
          { label: "Saídas previstas", value: -outP.total },
        ],
        saldoDia,
        focusLine === "saldoDia",
      ),
      saldoSectionHtml(
        "Saldo acumulado",
        "Soma do saldo acumulado dos dias anteriores com o saldo de hoje. É o quanto o caixa teria ao final deste dia se tudo o que está previsto se concretizar.",
        [
          { label: "Saldo acumulado até o dia anterior", value: prevAcc },
          { label: "Saldo do dia", value: saldoDia },
        ],
        day.saldoAcumulado,
        focusLine === "saldoAcumulado",
      ),
    ];

    if (focusLine && sections.length) {
      const idx = sections.findIndex((s) => s.includes("fc-day-section--focus"));
      if (idx > 0) sections.unshift(sections.splice(idx, 1)[0]);
    }

    return `
      <div class="sale-detail-sheet">
        <div class="sale-detail-meta" style="grid-template-columns:1fr 1fr 1fr;">
          <div class="sale-detail-kv"><label>Dia</label><span>${day.dia.replace("-", "/")}</span></div>
          <div class="sale-detail-kv"><label>Entradas</label><span>${formatCurrency(inR.total + inP.total)}</span></div>
          <div class="sale-detail-kv"><label>Saídas</label><span>${formatCurrency(outR.total + outP.total)}</span></div>
        </div>
        ${sections.join("")}
      </div>`;
  }

  async function openDayDetail(date, line) {
    const day = report?.cashFlow.find((d) => d.dia === date);
    if (!day) return;
    const title = `Como foi calculado — ${date.replace("-", "/")}`;
    const html = `<p class="fc-modal-empty">Carregando...</p>`;
    Swal.fire({
      title,
      html,
      width: 860,
      showConfirmButton: false,
      showCloseButton: true,
      customClass: { popup: "sale-detail-swal", title: "sale-detail-swal__title", htmlContainer: "sale-detail-swal__html" },
      didOpen: async () => {
        const htmlEl = Swal.getHtmlContainer();
        try {
          const res = await BuildFlow.apiFetch(`/financial-day-detail?${dayDetailParams(date).toString()}`);
          htmlEl.innerHTML = buildDayDetailHtml(res, day, line);
        } catch (err) {
          htmlEl.innerHTML = `<p class="fc-modal-empty">Não foi possível carregar: ${BuildFlow.escapeHtml(err.message)}</p>`;
        }
      },
    });
  }

  function bindDayRows() {
    els.daysTable?.querySelectorAll("tr.fc-day-row").forEach((tr) => {
      tr.addEventListener("click", (ev) => {
        const cell = ev.target.closest(".fc-day-cell");
        if (cell) {
          openDayDetail(cell.dataset.day, cell.dataset.line);
        } else {
          openDayDetail(tr.dataset.day);
        }
      });
    });
  }

  // ===== Drill-down do DRE (clique na linha abre a composição) =====
  const DRE_DETAIL = {
    receita: {
      label: "Receita Bruta",
      expl: "Todas as vendas finalizadas no período, contadas pelo preço cheio dos produtos (antes dos descontos).",
    },
    deducoes: {
      label: "Deduções e descontos",
      expl: "Apenas as vendas que tiveram desconto no período. Veja o valor bruto da venda, o desconto concedido e o valor recebido. Para separar o desconto dado nos itens do desconto dado na venda, clique em \"Ver venda\".",
    },
    liquida: {
      label: "Receita Líquida",
      expl: "Todas as vendas finalizadas no período, pelo valor que o cliente realmente pagou (já com os descontos).",
    },
    cmv: {
      label: "CMV (custo das mercadorias)",
      expl: "Produtos vendidos no período com o custo de compra de cada um, agrupados por produto.",
    },
    despesas: {
      label: "Despesas pagas",
      expl: "Contas a pagar quitadas dentro do período.",
    },
    outros: {
      label: "Outros recebimentos",
      expl: "Contas a receber que entraram no período, além das vendas.",
    },
    resultado: {
      label: "Resultado Operacional",
      expl: "Veja como o resultado final é montado a partir de cada linha do período.",
    },
  };

  let dreState = null;

  function fmtDateTime(v) {
    return v ? new Date(v).toLocaleString("pt-BR") : "—";
  }

  function fmtDateOnly(v) {
    return v ? new Date(v).toLocaleDateString("pt-BR") : "—";
  }

  function fmtDay(v) {
    if (!v) return "—";
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return "—";
    return `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`;
  }

  function detailParams(line, page) {
    const period = els.periodSelect?.value || "month";
    const date = els.dateSelect?.value || "";
    const tzOffset = -new Date().getTimezoneOffset();
    const p = new URLSearchParams({ line, period, tzOffset: String(tzOffset), page: String(page) });
    if (date) p.set("date", date);
    return p;
  }

  function saleRowHtml(s, line) {
    const id = BuildFlow.escapeHtml(s._id);
    const n = BuildFlow.escapeHtml(String(s.saleNumber));
    const date = fmtDateTime(s.createdAt);
    const bruto = s.grossSubtotal != null ? s.grossSubtotal : s.total + s.totalDiscount;
    if (line === "receita" || line === "deducoes") {
      const tds = `<td>${date}</td><td>${n}</td><td class="num">${formatCurrency(bruto)}</td><td class="num"><span class="neg">${formatCurrency(s.totalDiscount)}</span></td><td class="num"><strong>${formatCurrency(s.total)}</strong></td>`;
      return `<tr>${tds}<td><span class="fc-modal-row-link" onclick="openSaleDetailDre('${id}')">Ver venda</span></td></tr>`;
    }
    const tds = `<td>${date}</td><td>${n}</td><td class="num">${s.qtdItens}</td><td class="num"><strong>${formatCurrency(s.total)}</strong></td>`;
    return `<tr>${tds}<td><span class="fc-modal-row-link" onclick="openSaleDetailDre('${id}')">Ver venda</span></td></tr>`;
  }

  function detailTableHtml(data) {
    const line = data.line;
    if (line === "receita" || line === "liquida" || line === "deducoes") {
      const head =
        line === "liquida"
          ? "<th>Data</th><th>Nº venda</th><th class=\"num\">Itens</th><th class=\"num\">Recebido</th><th></th>"
          : "<th>Data</th><th>Nº venda</th><th class=\"num\">Bruto</th><th class=\"num\">Desconto</th><th class=\"num\">Recebido</th><th></th>";
      const body = data.items.map((s) => saleRowHtml(s, line)).join("");
      const table = `<table class="fc-modal-table"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
      if (!data.items.length) return `<p class="fc-modal-empty">Nenhuma venda neste período.</p>`;
      return tableScrollWrap(table);
    }
    if (line === "cmv") {
      const head = "<th>Produto</th><th>SKU</th><th class=\"num\">Qtd</th><th class=\"num\">Custo unit.</th><th class=\"num\">Custo total</th>";
      const body = data.items
        .map(
          (r) =>
            `<tr><td>${BuildFlow.escapeHtml(r.produto)}</td><td>${BuildFlow.escapeHtml(r.sku)}</td><td class="num">${r.qty}</td><td class="num">${formatCurrency(r.custoUnitario)}</td><td class="num">${formatCurrency(r.custoTotal)}</td></tr>`,
        )
        .join("");
      if (!data.items.length) return `<p class="fc-modal-empty">Nenhum produto vendido neste período.</p>`;
      return tableScrollWrap(`<table class="fc-modal-table"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`);
    }
    if (line === "despesas" || line === "outros") {
      const isPay = line === "despesas";
      const head = `<th>Descrição</th><th>Categoria</th><th class="num">Vencimento</th><th class="num">${isPay ? "Pago em" : "Recebido em"}</th><th class="num">Valor</th>`;
      const body = data.items
        .map(
          (b) =>
            `<tr><td>${BuildFlow.escapeHtml(b.description)}</td><td>${BuildFlow.escapeHtml(b.category)}</td><td class="num">${fmtDay(b.dueDate)}</td><td class="num">${fmtDay(b.dateValue)}</td><td class="num">${formatCurrency(b.amount)}</td></tr>`,
        )
        .join("");
      if (!data.items.length) return `<p class="fc-modal-empty">Nenhum registro neste período.</p>`;
      return tableScrollWrap(`<table class="fc-modal-table"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`);
    }
    return "";
  }

  function detailFooterHtml(data) {
    const unitLabel =
      data.line === "cmv" ? "produtos" : data.line === "despesas" || data.line === "outros" ? "registros" : "vendas";
    const totalLabel = {
      receita: "Total de receita bruta",
      deducoes: "Total de descontos",
      liquida: "Total recebido",
      cmv: "Custo total",
      despesas: "Total de despesas",
      outros: "Total recebido",
    }[data.line] || "Total";
    const moreBtn = data.pagination.hasMore
      ? `<button type="button" class="fc-more-btn" onclick="loadMoreDreDetail()">Mostrar mais</button>`
      : "";
    return `<div style="display:flex;flex-wrap:wrap;align-items:center;gap:12px;justify-content:space-between;margin-top:16px;">
      <span style="font-size:0.85rem;color:var(--text-muted);">${data.totalCount} ${unitLabel} no período</span>
      ${moreBtn}
      <div class="sale-detail-total" style="margin:0;"><span>${totalLabel}</span><strong>${formatCurrency(data.grandTotal)}</strong></div>
    </div>`;
  }

  function tableScrollWrap(tableHtml) {
    return `<div class="sale-detail-items sale-detail-items--scroll" style="padding:0;border:1px solid var(--border);border-radius:10px;overflow-x:auto;">${tableHtml}</div>`;
  }

  function resultadoMiniDreHtml() {
    const d = report.dre;
    const rows = [
      { label: "Receita Bruta", value: d.receitaBruta },
      { label: "Deduções e descontos", value: -d.deducoes, neg: true },
      { label: "Receita Líquida", value: d.receitaLiquida, strong: true },
      { label: "CMV (custo das mercadorias)", value: -d.cmv, neg: true },
      { label: "Lucro Bruto", value: d.lucroBruto, strong: true },
      { label: "Despesas pagas", value: -d.despesasPagas, neg: true },
      { label: "Outros recebimentos", value: d.outrosRecebimentos },
    ];
    const rowsHtml = rows
      .map(
        (r) =>
          `<div class="sale-detail-row sale-detail-row--muted"><span>${r.label}</span><span class="sale-detail-row__value ${r.neg ? "caixa-report-value--negative" : ""} ${r.strong ? "caixa-report-value--positive" : ""}">${formatCurrency(r.value)}</span></div>`,
      )
      .join("");
    return `<div class="sale-detail-items">${rowsHtml}</div>
      <div class="sale-detail-total"><span>Resultado Operacional</span><strong>${formatCurrency(d.resultadoOperacional)}</strong></div>`;
  }

  function periodLabel() {
    if (!report) return "—";
    if (report.period === "day") return new Date(report.startDate).toLocaleDateString("pt-BR");
    if (report.period === "week") return "Últimos 7 dias";
    return "Mês atual";
  }

  function dreSwalConfig(title, html, width, extra = {}) {
    return {
      title,
      html,
      width,
      confirmButtonText: "Fechar",
      confirmButtonColor: "#4f46e5",
      customClass: {
        popup: "sale-detail-swal",
        title: "sale-detail-swal__title",
        htmlContainer: "sale-detail-swal__html",
        confirmButton: "sale-detail-swal__confirm",
      },
      ...extra,
    };
  }

  function wrapDetailSheet(innerHtml) {
    const lineLabel = (DRE_DETAIL[dreState?.line] || {}).label || "—";
    return `<div class="sale-detail-sheet">
      <div class="sale-detail-meta" style="grid-template-columns:1fr 1fr 1fr;">
        <div class="sale-detail-kv"><label>Período</label><span>${BuildFlow.escapeHtml(periodLabel())}</span></div>
        <div class="sale-detail-kv"><label>Detalhamento</label><span>${BuildFlow.escapeHtml(lineLabel)}</span></div>
        <div class="sale-detail-kv"><label>Origem</label><span>DRE do período</span></div>
      </div>
      ${innerHtml}
    </div>`;
  }

  async function openDreDetail(line) {
    const info = DRE_DETAIL[line];
    if (!info) return;

    if (line === "resultado") {
      dreState = null;
      Swal.fire(dreSwalConfig(`DRE — ${info.label}`, `<div class="sale-detail-sheet">${resultadoMiniDreHtml()}</div>`, 520));
      return;
    }

    dreState = { line, page: 1, sales: [] };
    const html = wrapDetailSheet(`<p class="fc-modal-empty">Carregando...</p>`);
    Swal.fire(dreSwalConfig(`DRE — ${info.label}`, html, 860, { didOpen: () => loadMoreDreDetail() }));
  }

  async function loadMoreDreDetail() {
    const st = dreState;
    if (!st) return;
    const htmlEl = Swal.getHtmlContainer();
    if (!htmlEl) return;
    const info = DRE_DETAIL[st.line];
    try {
      const res = await BuildFlow.apiFetch(`/financial-detail?${detailParams(st.line, st.page).toString()}`);
      st.sales.push(...res.items);
      const inner = `<p class="fc-modal-expl">${info.expl}</p>${detailTableHtml(res)}${detailFooterHtml(res)}`;
      htmlEl.innerHTML = wrapDetailSheet(inner);
      st.page += 1;
    } catch (err) {
      const inner = `<p class="fc-modal-expl">${info ? info.expl : ""}</p><p class="fc-modal-empty">Não foi possível carregar: ${BuildFlow.escapeHtml(err.message)}</p>`;
      htmlEl.innerHTML = wrapDetailSheet(inner);
    }
  }

  function openSaleDetailDre(id) {
    const sale = (dreState?.sales || []).find((s) => s._id === id);
    if (!sale) return;
    Swal.fire(
      dreSwalConfig(`Venda nº ${BuildFlow.escapeHtml(String(sale.saleNumber))}`, BuildFlow.buildSaleDetailHtml(sale), 640),
    );
  }

  function bindDreRows() {
    els.dreTable?.querySelectorAll("tr[data-line]").forEach((tr) => {
      tr.title = "Clique para ver o detalhe";
      tr.addEventListener("click", () => openDreDetail(tr.dataset.line));
    });
  }

  function renderAll() {
    renderKpis();
    renderChart();
    renderDre();
    renderDaysTable();
    bindDayRows();
  }

  function bindEvents() {
    els.applyBtn?.addEventListener("click", () => loadData());
    els.periodSelect?.addEventListener("change", () => loadData());
    els.dateSelect?.addEventListener("change", () => loadData());
    bindDreRows();
    bindDayRows();
  }

  function cacheElements() {
    [
      "periodSelect",
      "dateSelect",
      "applyBtn",
      "kpiIn",
      "kpiOut",
      "kpiBalance",
      "kpiDre",
      "flowChart",
      "dreTable",
      "drePeriodLabel",
      "daysTable",
    ].forEach((id) => {
      els[id] = $(id);
    });
  }

  document.addEventListener("DOMContentLoaded", async () => {
    BuildFlow.checkAuth();
    cacheElements();
    bindEvents();
    window.openDreDetail = openDreDetail;
    window.loadMoreDreDetail = loadMoreDreDetail;
    window.openSaleDetailDre = openSaleDetailDre;
    window.openDayDetail = openDayDetail;
    try {
      await loadData();
    } catch (err) {
      Swal.fire({ icon: "error", title: "Erro ao carregar", text: err.message });
    }
  });
})();
