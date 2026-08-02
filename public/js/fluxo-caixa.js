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
        const entrada = day.entradaRealizada + day.entradaPrevista;
        const saida = day.saidaRealizada + day.saidaPrevista;
        return `<tr class="${day.isToday ? "fc-today-row" : ""}">
          <td>${day.dia}${day.isToday ? " <small>(hoje)</small>" : ""}</td>
          <td class="${moneyClass(entrada)}">${formatCurrency(entrada)}</td>
          <td class="${moneyClass(-saida)}">${formatCurrency(-saida)}</td>
          <td class="${moneyClass(day.saldoDia)}">${formatCurrency(day.saldoDia)}</td>
          <td class="${moneyClass(day.saldoAcumulado)}"><strong>${formatCurrency(day.saldoAcumulado)}</strong></td>
        </tr>`;
      })
      .join("");
  }

  function renderAll() {
    renderKpis();
    renderChart();
    renderDre();
    renderDaysTable();
  }

  function bindEvents() {
    els.applyBtn?.addEventListener("click", () => loadData());
    els.periodSelect?.addEventListener("change", () => loadData());
    els.dateSelect?.addEventListener("change", () => loadData());
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
    try {
      await loadData();
    } catch (err) {
      Swal.fire({ icon: "error", title: "Erro ao carregar", text: err.message });
    }
  });
})();
