// Auditoria de Caixa — análise de caixas com períodos anormais, ajuste de
// datas/valores, fechamento e trilha de auditoria (Admin/Gerente).
(function () {
  let allCaixas = [];

  const els = {};
  const ALERT_MS = 24 * 60 * 60 * 1000;

  function $(id) {
    return document.getElementById(id);
  }

  function normalizeId(id) {
    return BuildFlow.normalizeId(id);
  }

  function esc(v) {
    return BuildFlow.escapeHtml(v);
  }

  function fmt(v) {
    return BuildFlow.formatCurrency(Number(v) || 0);
  }

  function userRole() {
    try {
      const u = JSON.parse(localStorage.getItem("user") || "null");
      return u ? u.role : null;
    } catch {
      return null;
    }
  }

  function caixaDurationMs(cx) {
    const fim = cx.dataFechamento ? new Date(cx.dataFechamento) : new Date();
    return Math.max(0, fim.getTime() - new Date(cx.dataAbertura).getTime());
  }

  function isAlert(cx) {
    return caixaDurationMs(cx) > ALERT_MS;
  }

  function formatDuration(ms) {
    const dias = Math.floor(ms / 86400000);
    const horas = Math.floor((ms % 86400000) / 3600000);
    const minutos = Math.floor((ms % 3600000) / 60000);
    if (dias > 0) return `${dias}d ${horas}h`;
    if (horas > 0) return `${horas}h ${minutos}min`;
    return `${minutos}min`;
  }

  async function loadData() {
    try {
      const res = await BuildFlow.apiFetch("/caixa?limit=500");
      allCaixas = Array.isArray(res) ? res : [];
      renderTable();
    } catch (err) {
      Swal.fire({ icon: "error", title: "Erro ao carregar", text: err.message });
    }
  }

  function getFiltered() {
    const status = els.statusSelect?.value || "all";
    const start = els.dateStart?.value || "";
    const end = els.dateEnd?.value || "";
    const search = (els.auditSearch?.value || "").trim().toLowerCase();

    return allCaixas.filter((cx) => {
      if (status === "aberto" && cx.status !== "aberto") return false;
      if (status === "fechado" && cx.status !== "fechado") return false;

      const abertura = new Date(cx.dataAbertura);
      if (start && abertura < new Date(start + "T00:00:00")) return false;

      const fechamento = cx.dataFechamento ? new Date(cx.dataFechamento) : new Date();
      if (end && fechamento > new Date(end + "T23:59:59.999")) return false;

      if (search) {
        const texto = `${cx.numeroCaixa || ""} ${cx.userName || ""} ${cx.observacao || ""}`.toLowerCase();
        if (!texto.includes(search)) return false;
      }
      return true;
    });
  }

  function renderTable() {
    const list = getFiltered();
    const abertos = list.filter((c) => c.status === "aberto").length;
    const alertas = list.filter(isAlert).length;
    const vendas = list.reduce((s, c) => s + (Number(c.numeroVendas) || 0), 0);

    if (els.kpiTotal) els.kpiTotal.textContent = list.length;
    if (els.kpiOpen) els.kpiOpen.textContent = abertos;
    if (els.kpiAlerts) {
      els.kpiAlerts.textContent = alertas;
      els.kpiAlerts.style.color = alertas > 0 ? "#ef4444" : "";
    }
    if (els.kpiSales) els.kpiSales.textContent = vendas;

    if (!els.tableBody) return;
    if (!list.length) {
      els.tableBody.innerHTML = '<tr><td colspan="10" style="text-align:center;padding:40px;color:var(--text-muted);">Nenhum registro de caixa encontrado.</td></tr>';
      return;
    }

    els.tableBody.innerHTML = list
      .map((cx) => {
        const id = normalizeId(cx._id);
        const ms = caixaDurationMs(cx);
        const alert = isAlert(cx);
        const isOpen = cx.status === "aberto";
        const abertura = cx.dataAbertura ? new Date(cx.dataAbertura).toLocaleString("pt-BR") : "—";
        const fechamento = cx.dataFechamento
          ? new Date(cx.dataFechamento).toLocaleString("pt-BR")
          : isOpen ? "Em aberto" : "—";

        const alertaLabel = isOpen
          ? `Aberto há ${formatDuration(ms)}`
          : `Período de ${formatDuration(ms)}`;

        return `
          <tr class="clickable-row" data-audit="${id}" title="Clique para auditar"${alert ? ' style="background:rgba(239,68,68,0.06);"' : ""}>
            <td style="font-weight:700;">${esc(cx.numeroCaixa || "—")}</td>
            <td>${esc(cx.userName || "—")}</td>
            <td>${abertura}</td>
            <td>${fechamento}</td>
            <td>${formatDuration(ms)}</td>
            <td style="font-weight:600;">${fmt(cx.valorInicial)}</td>
            <td style="font-weight:700;">${fmt(cx.valorFinal)}</td>
            <td>${Number(cx.numeroVendas) || 0}</td>
            <td>${isOpen ? '<span class="badge badge-success">Aberto</span>' : '<span class="badge" style="background:var(--bg-hover);color:var(--text-muted);">Fechado</span>'}</td>
            <td>
              <div style="display:flex;gap:4px;align-items:center;flex-wrap:wrap;">
                ${alert ? `<span class="ac-alert-badge">${esc(alertaLabel)}</span>` : ""}
                ${isOpen ? `<button type="button" class="btn btn-icon" data-close="${id}" title="Fechar caixa" style="background:var(--red);color:#fff;"><i class="fa-solid fa-lock"></i></button>` : ""}
              </div>
            </td>
          </tr>`;
      })
      .join("");
  }

  function toLocalInput(date) {
    const d = new Date(date);
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function formatChangeValue(v) {
    if (v == null) return "—";
    if (typeof v === "number") return `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;
    if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}T/.test(v)) {
      const d = new Date(v);
      if (!Number.isNaN(d.getTime())) return d.toLocaleString("pt-BR");
    }
    return String(v);
  }

  function salesByMethod(summary) {
    const acc = {};
    const add = (m, v) => {
      const key = m || "—";
      acc[key] = (acc[key] || 0) + (Number(v) || 0);
    };
    if (!summary || !Array.isArray(summary.methods)) return acc;
    for (const item of summary.methods) {
      if (item.method === "Dividido" && item.splitPayment) {
        add("Dinheiro", item.splitPayment.cash);
        add(item.splitPayment.method, item.splitPayment.rest);
      } else {
        add(item.method, item.total);
      }
    }
    return acc;
  }

  function renderAuditModal(cx, sangrias, summary, logs) {
    const id = normalizeId(cx._id);
    const ms = caixaDurationMs(cx);
    const alert = isAlert(cx);
    const isOpen = cx.status === "aberto";
    const terminal = esc(cx.numeroCaixa || "—");
    const operador = esc(cx.userName || "Operador desconhecido");
    const abertura = cx.dataAbertura ? new Date(cx.dataAbertura).toLocaleString("pt-BR") : "—";
    const fechamento = cx.dataFechamento
      ? new Date(cx.dataFechamento).toLocaleString("pt-BR")
      : isOpen ? "Em aberto" : "—";
    const numeroVendas = Number(cx.numeroVendas) || 0;

    const totalRetiradas = (sangrias || []).reduce(
      (s, i) => s + (i.tipo === "suprimento" ? 0 : Number(i.valor) || 0),
      0
    );
    const totalSuprimentos = (sangrias || []).reduce(
      (s, i) => s + (i.tipo === "suprimento" ? Number(i.valor) || 0 : 0),
      0
    );

    const methods = salesByMethod(summary);
    const methodsHtml = Object.keys(methods).length
      ? Object.entries(methods)
          .map(
            ([m, v]) => `
          <div class="sale-detail-row sale-detail-row--muted">
            <span>${esc(m)}</span>
            <span class="sale-detail-row__value">${fmt(v)}</span>
          </div>`
          )
          .join("")
      : '<p class="sale-detail-empty">Sem vendas no período.</p>';

    const movementsHtml = sangrias && sangrias.length
      ? sangrias
          .map((item) => {
            const isSup = item.tipo === "suprimento";
            const valor = Number(item.valor) || 0;
            const descricao = esc(item.descricao || item.categoria || "—");
            const tipoLabel = isSup ? "Suprimento" : "Sangria";
            const tipoIcon = isSup ? "fa-arrow-up" : "fa-arrow-down";
            const sinal = isSup ? "+" : "−";
            const valueClass = isSup ? "caixa-report-value--positive" : "caixa-report-value--negative";
            const data = item.createdAt ? new Date(item.createdAt).toLocaleString("pt-BR") : "—";
            return `
            <div class="sale-detail-row caixa-report-movement">
              <div class="caixa-report-movement__main">
                <div class="caixa-report-movement__desc">
                  <div class="caixa-report-movement__type caixa-report-movement__type--${isSup ? "suprimento" : "sangria"}">
                    <i class="fa-solid ${tipoIcon}"></i> ${tipoLabel}
                  </div>
                  <span>${descricao}</span>
                </div>
                <div class="caixa-report-movement__date">${data}</div>
                <span class="sale-detail-row__value ${valueClass}">${sinal} ${fmt(valor)}</span>
              </div>
            </div>`;
          })
          .join("")
      : '<p class="sale-detail-empty">Nenhum movimento registrado.</p>';

    const ajustes = Array.isArray(cx.ajustes) ? cx.ajustes : [];
    const ajustesHtml = ajustes
      .map((a) => {
        const quando = a.quando ? new Date(a.quando).toLocaleString("pt-BR") : "—";
        const mudancas = Array.isArray(a.mudancas) && a.mudancas.length
          ? a.mudancas
              .map((m) => `${m.campo}: ${formatChangeValue(m.antes)} → ${formatChangeValue(m.depois)}`)
              .join(" | ")
          : "recálculo sem alterações — totais conferidos";
        return `
          <div class="ac-entry">
            <div class="ac-when">${quando}</div>
            <div class="ac-who">${esc(a.por || "Usuário")}</div>
            <div class="ac-details">${esc(mudancas)}</div>
            ${a.justificativa ? `<div class="ac-just"><i class="fa-solid fa-comment"></i> ${esc(a.justificativa)}</div>` : ""}
          </div>`;
      })
      .join("");

    const relevantActions = ["OPEN_CAIXA", "CLOSE_CAIXA", "ADJUST_CAIXA"];
    const logsHtml = (logs || [])
      .filter((l) => relevantActions.includes(l.action))
      .map((l) => {
        const quando = l.timestamp ? new Date(l.timestamp).toLocaleString("pt-BR") : "—";
        return `
          <div class="ac-entry ac-entry--log">
            <div class="ac-when">${quando} · ${esc(l.action)}</div>
            <div class="ac-details">${esc(l.details || "")}</div>
          </div>`;
      })
      .join("");

    const trilhaHtml = (ajustesHtml || logsHtml)
      ? `<div class="sale-detail-items ac-audit-panel">
          <div class="sale-detail-items__head">
            <span>Trilha de auditoria</span>
            <span></span>
          </div>
          <div class="ac-audit-scroll">
            ${ajustesHtml || ""}
            ${logsHtml || ""}
          </div>
        </div>`
      : "";

    const statusBadge = isOpen
      ? '<span class="badge badge-success">Aberto</span>'
      : '<span class="badge" style="background:var(--bg-hover);color:var(--text-muted);">Fechado</span>';

    const alertaLabel = isOpen
      ? `Aberto há ${formatDuration(ms)}`
      : `Período de ${formatDuration(ms)}`;

    const html = `
      <div class="sale-detail-sheet">
        <div class="caixa-report-hero">
          <div class="caixa-report-hero__icon"><i class="fa-solid fa-cash-register"></i></div>
          <div class="caixa-report-hero__info">
            <span class="caixa-report-hero__label">Terminal</span>
            <strong>Caixa ${terminal}</strong>
            <span style="display:block;font-size:0.75rem;color:var(--text-muted);margin-top:2px;">${operador} · ${formatDuration(ms)} de duração</span>
          </div>
          <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px;">
            ${statusBadge}
            ${alert ? `<span class="ac-alert-badge">${esc(alertaLabel)}</span>` : ""}
          </div>
        </div>

        <div class="sale-detail-meta caixa-report-meta">
          <div class="sale-detail-kv">
            <label>Abertura</label>
            <span>${abertura}</span>
          </div>
          <div class="sale-detail-kv">
            <label>Fechamento</label>
            <span>${fechamento}</span>
          </div>
          <div class="sale-detail-kv">
            <label>Vendas realizadas</label>
            <span>${numeroVendas} venda${numeroVendas === 1 ? "" : "s"}</span>
          </div>
          <div class="sale-detail-kv">
            <label>Duração</label>
            <span>${formatDuration(ms)}</span>
          </div>
        </div>

        <div class="ac-audit-grid">
          <div>
            <div class="sale-detail-items">
              <div class="sale-detail-items__head">
                <span>Resumo financeiro</span>
                <span></span>
              </div>
              <div class="sale-detail-row sale-detail-row--muted">
                <span>Valor inicial</span>
                <span class="sale-detail-row__value">${fmt(cx.valorInicial)}</span>
              </div>
              <div class="sale-detail-row sale-detail-row--muted">
                <span>Total em vendas</span>
                <span class="sale-detail-row__value caixa-report-value--positive">+${fmt(cx.totalVendas)}</span>
              </div>
              <div class="sale-detail-row sale-detail-row--muted">
                <span>Descontos</span>
                <span class="sale-detail-row__value caixa-report-value--negative">−${fmt(cx.totalDescontos)}</span>
              </div>
              <div class="sale-detail-row sale-detail-row--muted">
                <span>Sangrias</span>
                <span class="sale-detail-row__value caixa-report-value--negative">−${fmt(cx.totalRetiradas != null ? cx.totalRetiradas : totalRetiradas)}</span>
              </div>
              <div class="sale-detail-row sale-detail-row--muted">
                <span>Suprimentos</span>
                <span class="sale-detail-row__value caixa-report-value--positive">+${fmt(cx.totalSuprimentos != null ? cx.totalSuprimentos : totalSuprimentos)}</span>
              </div>
            </div>
            <div class="sale-detail-total">
              <span>Valor final</span>
              <strong>${fmt(cx.valorFinal)}</strong>
            </div>
          </div>

          <div class="sale-detail-items">
            <div class="sale-detail-items__head">
              <span>Vendas por método</span>
              <span></span>
            </div>
            ${methodsHtml}
          </div>

          <div class="sale-detail-items ac-audit-panel">
            <div class="sale-detail-items__head">
              <span>Movimentos de caixa (${sangrias ? sangrias.length : 0})</span>
              <span>Valor</span>
            </div>
            <div class="ac-audit-scroll">
              ${movementsHtml}
            </div>
          </div>

          ${trilhaHtml}
        </div>

        <div class="ac-audit-actions">
          <button type="button" class="btn btn-brand" onclick="auditAction('recalcular','${id}')">
            <i class="fa-solid fa-rotate"></i> Recalcular totais
          </button>
          <button type="button" class="btn" onclick="auditAction('datas','${id}')" style="background:var(--bg-hover);color:var(--text-primary);border:1px solid var(--border);">
            <i class="fa-solid fa-calendar-pen"></i> Ajustar datas
          </button>
          <button type="button" class="btn" onclick="auditAction('valores','${id}')" style="background:var(--bg-hover);color:var(--text-primary);border:1px solid var(--border);">
            <i class="fa-solid fa-coins"></i> Ajustar valores
          </button>
          ${isOpen ? `<button type="button" class="btn" onclick="auditAction('fechar','${id}')" style="background:var(--red);color:#fff;">
            <i class="fa-solid fa-lock"></i> Fechar caixa
          </button>` : ""}
        </div>
      </div>`;

    return {
      title: `Auditoria — Caixa ${terminal}`,
      html,
      id
    };
  }

  async function openAuditModal(id) {
    try {
      const [cx, sangrias, logs] = await Promise.all([
        BuildFlow.getCaixa(id),
        BuildFlow.getSangriasCaixa({ caixaId: id }),
        BuildFlow.getLogs({ entity: "caixa", entityId: id, limit: 100 })
      ]);

      const start = cx.dataAbertura ? new Date(cx.dataAbertura).toISOString() : null;
      const end = cx.dataFechamento ? new Date(cx.dataFechamento).toISOString() : null;
      const params = { caixaId: id, summary: "1" };
      if (start) params.start = start;
      if (end) params.end = end;
      const resSales = await BuildFlow.getSales(params);
      const summary = resSales && resSales.summary ? resSales.summary : null;

      const view = renderAuditModal(cx, sangrias, summary, logs);
      await Swal.fire({
        title: view.title,
        html: view.html,
        width: 1280,
        confirmButtonText: "Fechar",
        confirmButtonColor: "#4f46e5",
        customClass: {
          popup: "sale-detail-swal audit-modal-swal",
          title: "sale-detail-swal__title",
          htmlContainer: "sale-detail-swal__html",
          confirmButton: "sale-detail-swal__confirm"
        }
      });
    } catch (err) {
      Swal.fire({ icon: "error", title: "Erro ao carregar auditoria", text: err.message });
    }
  }

  async function requirePassword() {
    const { value: senha, isConfirmed } = await Swal.fire({
      title: "Confirme sua senha",
      text: "Ações de auditoria exigem validação da sua senha.",
      input: "password",
      inputPlaceholder: "Sua senha",
      inputAttributes: { autocomplete: "current-password" },
      focusConfirm: false,
      showCancelButton: true,
      confirmButtonText: "Confirmar",
      cancelButtonText: "Cancelar"
    });
    if (!isConfirmed || !senha) return false;
    try {
      await BuildFlow.verificarSenhaCaixa(senha);
      return true;
    } catch (err) {
      Swal.fire({ icon: "error", title: "Senha incorreta", text: err.message || "Não foi possível validar sua senha." });
      return false;
    }
  }

  window.auditAction = async (tipo, id) => {
    Swal.close();
    try {
      if (tipo === "recalcular") {
        const { value: justificativa, isConfirmed } = await Swal.fire({
          title: "Recalcular totais?",
          text: "Os totais serão recalculados a partir das vendas e movimentos dentro do período do caixa.",
          input: "textarea",
          inputPlaceholder: "Justificativa (obrigatória)",
          inputValidator: (v) => (v && v.trim() ? undefined : "Justificativa obrigatória."),
          showCancelButton: true,
          confirmButtonText: "Recalcular",
          cancelButtonText: "Cancelar"
        });
        if (!isConfirmed) { openAuditModal(id); return; }
        if (!(await requirePassword())) { openAuditModal(id); return; }
        await BuildFlow.recalcularCaixa(id, justificativa.trim());
        BuildFlow.showToast("Totais recalculados com sucesso.", "success");
        await openAuditModal(id);
        await loadData();
        return;
      }

      if (tipo === "fechar") {
        const { value: observacao, isConfirmed } = await Swal.fire({
          title: "Fechar caixa agora?",
          text: "O caixa será fechado no momento atual, considerando todas as vendas e movimentos do período.",
          input: "textarea",
          inputPlaceholder: "Observação (opcional)",
          showCancelButton: true,
          confirmButtonText: "Fechar caixa",
          confirmButtonColor: "#ef4444",
          cancelButtonText: "Cancelar"
        });
        if (!isConfirmed) { openAuditModal(id); return; }
        if (!(await requirePassword())) { openAuditModal(id); return; }
        await BuildFlow.fecharCaixa(observacao || "");
        BuildFlow.showToast("Caixa fechado com sucesso.", "success");
        await loadData();
        return;
      }

      const { value: form, isConfirmed } = await Swal.fire({
        title: tipo === "datas" ? "Ajustar datas do caixa" : "Ajustar valores do caixa",
        html: await buildAdjustHtml(tipo, id),
        focusConfirm: false,
        showCancelButton: true,
        confirmButtonText: "Aplicar ajuste",
        confirmButtonColor: "#4f46e5",
        cancelButtonText: "Cancelar",
        width: 980,
        customClass: {
          popup: "sale-detail-swal",
          title: "sale-detail-swal__title",
          htmlContainer: "sale-detail-swal__html",
          confirmButton: "sale-detail-swal__confirm"
        },
        preConfirm: () => validateAdjustForm(tipo)
      });
      if (!isConfirmed) { openAuditModal(id); return; }
      if (!(await requirePassword())) { openAuditModal(id); return; }

      if (tipo === "datas") {
        const payload = { justificativa: form.justificativa, recalcular: true };
        if (form.dataAbertura) payload.dataAbertura = new Date(form.dataAbertura).toISOString();
        payload.dataFechamento = form.dataFechamento ? new Date(form.dataFechamento).toISOString() : null;
        await BuildFlow.ajustarCaixa(id, payload);
        BuildFlow.showToast("Datas ajustadas e totais recalculados.", "success");
      } else {
        const payload = { justificativa: form.justificativa };
        ["valorInicial", "valorFinal", "totalDinheiro", "totalCartaoCredito", "totalCartaoDebito", "totalPIX", "totalDescontos"].forEach((campo) => {
          payload[campo] = form[campo];
        });
        await BuildFlow.ajustarCaixa(id, payload);
        BuildFlow.showToast("Valores ajustados e registrados na trilha de auditoria.", "success");
      }
      await openAuditModal(id);
      await loadData();
    } catch (err) {
      Swal.fire({ icon: "error", title: "Erro na auditoria", text: err.message });
    }
  };

  async function buildAdjustHtml(tipo, id) {
    const cx = await BuildFlow.getCaixa(id);
    const isOpen = cx.status === "aberto";
    const statusBadge = isOpen
      ? '<span class="badge badge-success">Aberto</span>'
      : '<span class="badge" style="background:var(--bg-hover);color:var(--text-muted);">Fechado</span>';
    const header = `
      <div class="caixa-report-hero">
        <div class="caixa-report-hero__icon"><i class="fa-solid fa-coins"></i></div>
        <div class="caixa-report-hero__info">
          <span class="caixa-report-hero__label">Terminal</span>
          <strong>Caixa ${esc(cx.numeroCaixa || "—")}</strong>
          <span style="display:block;font-size:0.75rem;color:var(--text-muted);margin-top:2px;">${esc(cx.userName || "Operador desconhecido")}</span>
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px;">${statusBadge}</div>
      </div>`;
    const fieldGroup = (label, inputId, value) => `
      <div>
        <label style="display:block;margin:8px 0 4px;font-size:0.75rem;color:var(--text-muted);">${label}</label>
        <input type="${inputId === "audit-abertura" || inputId === "audit-fechamento" ? "datetime-local" : "number"}" step="0.01" min="0" id="${inputId}" class="swal2-input" value="${value}" style="height:36px;padding:6px 10px;font-size:0.85rem;">
      </div>`;
    if (tipo === "datas") {
      const abertura = cx.dataAbertura ? toLocalInput(cx.dataAbertura) : "";
      const fechamento = cx.dataFechamento ? toLocalInput(cx.dataFechamento) : "";
      return `
        <div class="sale-detail-sheet">
          ${header}
          <p style="margin:10px 0;font-size:0.8rem;color:var(--text-secondary);line-height:1.4;">Informe as novas datas do caixa. Ao definir uma data de fechamento para um caixa aberto, ele será marcado como fechado e os totais serão recalculados considerando apenas as vendas dentro do novo período.</p>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:0 14px;">
            ${fieldGroup("Data de abertura", "audit-abertura", abertura)}
            ${fieldGroup(`Data de fechamento ${isOpen ? '<span style="color:var(--warning);">(em aberto — deixe vazio)</span>' : ""}`, "audit-fechamento", fechamento)}
          </div>
          <label style="display:block;margin:10px 0 4px;font-size:0.75rem;color:var(--text-muted);">Justificativa *</label>
          <textarea id="audit-just" class="swal2-textarea" rows="2" style="min-height:52px;font-size:0.85rem;" placeholder="Descreva o motivo do ajuste de datas (obrigatório)"></textarea>
        </div>`;
    }
    const campos = [
      ["valorInicial", "Valor inicial (R$)"],
      ["valorFinal", "Valor final (R$)"],
      ["totalDinheiro", "Total em dinheiro (R$)"],
      ["totalCartaoCredito", "Total cartão de crédito (R$)"],
      ["totalCartaoDebito", "Total cartão de débito (R$)"],
      ["totalPIX", "Total PIX (R$)"],
      ["totalDescontos", "Total de descontos (R$)"]
    ];
    return `
      <div class="sale-detail-sheet">
        ${header}
        <div style="display:grid;grid-template-columns:repeat(4, minmax(0, 1fr));gap:0 12px;">
          ${campos
            .map(
              ([campo, label]) => fieldGroup(label, `audit-${campo}`, Number(cx[campo] || 0).toFixed(2))
            )
            .join("")}
        </div>
        <label style="display:block;margin:10px 0 4px;font-size:0.75rem;color:var(--text-muted);">Justificativa *</label>
        <textarea id="audit-just" class="swal2-textarea" rows="2" style="min-height:52px;font-size:0.85rem;" placeholder="Descreva o motivo do ajuste de valores (obrigatório)"></textarea>
      </div>`;
  }

  function validateAdjustForm(tipo) {
    const just = document.getElementById("audit-just").value.trim();
    if (!just) {
      Swal.showValidationMessage("Justificativa obrigatória.");
      return false;
    }
    if (tipo === "datas") {
      const a = document.getElementById("audit-abertura").value;
      const f = document.getElementById("audit-fechamento").value;
      if (a && f && new Date(a) > new Date(f)) {
        Swal.showValidationMessage("Abertura não pode ser após o fechamento.");
        return false;
      }
      return { justificativa: just, dataAbertura: a, dataFechamento: f };
    }
    const campos = ["valorInicial", "valorFinal", "totalDinheiro", "totalCartaoCredito", "totalCartaoDebito", "totalPIX", "totalDescontos"];
    const form = { justificativa: just };
    for (const campo of campos) {
      const raw = document.getElementById(`audit-${campo}`).value;
      const num = BuildFlow.parseDiscountInput(raw);
      if (Number.isNaN(num) || num < 0) {
        Swal.showValidationMessage("Informe valores válidos e não negativos.");
        return false;
      }
      form[campo] = num;
    }
    return form;
  }

  function bindEvents() {
    els.statusSelect?.addEventListener("change", renderTable);
    els.dateStart?.addEventListener("change", renderTable);
    els.dateEnd?.addEventListener("change", renderTable);
    els.applyBtn?.addEventListener("click", renderTable);
    els.auditSearch?.addEventListener("input", (() => {
      let t;
      return () => { clearTimeout(t); t = setTimeout(renderTable, 350); };
    })());

    els.tableBody?.addEventListener("click", (e) => {
      const close = e.target.closest("[data-close]");
      if (close) {
        e.stopPropagation();
        const id = close.dataset.close;
        const cx = allCaixas.find((c) => normalizeId(c._id) === id);
        if (cx && cx.status === "aberto") {
          window.auditAction("fechar", id);
        }
        return;
      }
      const audit = e.target.closest("[data-audit]");
      if (audit) {
        openAuditModal(audit.dataset.audit);
      }
    });
  }

  function cacheElements() {
    [
      "statusSelect",
      "dateStart",
      "dateEnd",
      "applyBtn",
      "auditSearch",
      "kpiTotal",
      "kpiOpen",
      "kpiAlerts",
      "kpiSales",
      "auditTableBody"
    ].forEach((id) => {
      els[id] = $(id);
    });
    els.tableBody = els.auditTableBody;
  }

  document.addEventListener("DOMContentLoaded", async () => {
    BuildFlow.checkAuth();
    const role = userRole();
    if (role !== "Admin" && role !== "Gerente") {
      Swal.fire({
        icon: "error",
        title: "Acesso restrito",
        text: "A auditoria de caixa está disponível apenas para Admin e Gerente.",
        confirmButtonText: "Voltar"
      }).then(() => {
        window.location.href = "/dashboard";
      });
      return;
    }
    cacheElements();
    bindEvents();
    try {
      await loadData();
    } catch (err) {
      Swal.fire({ icon: "error", title: "Erro ao carregar", text: err.message });
    }
  });
})();
