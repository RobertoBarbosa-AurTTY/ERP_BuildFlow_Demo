(function () {
  const CATEGORIES = {
    fornecedores: "Fornecedores",
    aluguel: "Aluguel",
    impostos: "Impostos",
    servicos: "Serviços",
    utilities: "Utilidades",
    folha: "Folha de Pagamento",
    outros: "Outros",
  };

  const PAYMENT_METHODS = {
    boleto: "Boleto",
    pix: "PIX",
    transferencia: "Transferência",
    cartao: "Cartão",
    dinheiro: "Dinheiro",
  };

  const STATUS_LABELS = {
    pending: "A vencer",
    overdue: "Vencida",
    paid: "Paga",
    cancelled: "Cancelada",
  };

  let bills = [];
  let summary = null;
  let editingId = null;
  let activeTab = "list";

  const els = {};

  function $(id) {
    return document.getElementById(id);
  }

  function normalizeId(id) {
    return BuildFlow.normalizeId(id);
  }

  function formatDate(value) {
    if (!value) return "—";
    return new Date(value).toLocaleDateString("pt-BR");
  }

  function statusBadge(status) {
    const map = {
      pending: "badge-amber",
      overdue: "badge-red",
      paid: "badge-green",
      cancelled: "badge-muted",
    };
    return `<span class="ap-badge ${map[status] || "badge-muted"}">${STATUS_LABELS[status] || status}</span>`;
  }

  async function loadData() {
    const search = els.search?.value?.trim() || "";
    const status = els.filterStatus?.value || "all";
    const category = els.filterCategory?.value || "all";
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (status !== "all") params.set("status", status);
    if (category !== "all") params.set("category", category);
    if (els.filterFrom?.value) params.set("from", els.filterFrom.value);
    if (els.filterTo?.value) params.set("to", els.filterTo.value);

    const [listRes, summaryRes] = await Promise.all([
      BuildFlow.apiFetch(`/accounts-payable?${params.toString()}`),
      BuildFlow.apiFetch("/accounts-payable?summary=true"),
    ]);

    bills = listRes.data || [];
    summary = summaryRes;
    renderAll();
    checkBrowserNotifications();
  }

  function renderKpis() {
    if (!summary || !els.kpiPending) return;
    els.kpiPending.textContent = BuildFlow.formatCurrency(summary.totalPending);
    els.kpiOverdue.textContent = BuildFlow.formatCurrency(summary.totalOverdue);
    els.kpiWeek.textContent = `${summary.countDueThisWeek} · ${BuildFlow.formatCurrency(summary.totalDueThisWeek)}`;
    els.kpiPaid.textContent = BuildFlow.formatCurrency(summary.paidThisMonth);
    els.badgeOverdue.textContent = summary.countOverdue || 0;
    els.badgeSoon.textContent = summary.countDueSoon || 0;

    if (summary.countOverdue > 0) {
      els.alertBanner.style.display = "flex";
      els.alertBanner.innerHTML = `
        <i class="fa-solid fa-triangle-exclamation"></i>
        <div>
          <strong>${summary.countOverdue} conta(s) vencida(s)</strong>
          <span>Total em atraso: ${BuildFlow.formatCurrency(summary.totalOverdue)}</span>
        </div>
        <button type="button" class="btn btn-sm" id="filterOverdueBtn">Ver vencidas</button>`;
      $("filterOverdueBtn")?.addEventListener("click", () => {
        els.filterStatus.value = "overdue";
        loadData();
      });
    } else if (summary.countDueSoon > 0) {
      els.alertBanner.style.display = "flex";
      els.alertBanner.innerHTML = `
        <i class="fa-solid fa-bell"></i>
        <div>
          <strong>${summary.countDueSoon} vencimento(s) próximo(s)</strong>
          <span>Total: ${BuildFlow.formatCurrency(summary.totalDueSoon)}</span>
        </div>`;
    } else {
      els.alertBanner.style.display = "none";
    }
  }

  function renderTable() {
    if (!els.tableBody) return;
    if (!bills.length) {
      els.tableBody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:40px;color:var(--text-muted)">Nenhuma conta encontrada. Cadastre seu primeiro boleto.</td></tr>`;
      return;
    }

    els.tableBody.innerHTML = bills
      .map((bill) => {
        const id = normalizeId(bill._id);
        const daysLabel =
          bill.status === "overdue"
            ? `${Math.abs(bill.daysUntilDue)} dia(s) em atraso`
            : bill.status === "pending"
              ? bill.daysUntilDue === 0
                ? "Vence hoje"
                : `${bill.daysUntilDue} dia(s)`
              : bill.status === "paid"
                ? `Pago em ${formatDate(bill.paidDate)}`
                : "—";

        return `<tr class="ap-row ap-row--${bill.status}">
          <td><strong>${BuildFlow.escapeHtml(bill.description)}</strong>${bill.documentNumber ? `<br><small>${BuildFlow.escapeHtml(bill.documentNumber)}</small>` : ""}</td>
          <td>${BuildFlow.escapeHtml(bill.supplier || "—")}</td>
          <td>${BuildFlow.escapeHtml(CATEGORIES[bill.category] || bill.category)}</td>
          <td>${formatDate(bill.dueDate)}</td>
          <td><strong>${BuildFlow.formatCurrency(bill.amount)}</strong></td>
          <td>${statusBadge(bill.status)}</td>
          <td><small>${daysLabel}</small></td>
          <td class="ap-actions">
            ${bill.status !== "paid" && bill.status !== "cancelled" ? `<button type="button" class="btn-icon" data-pay="${id}" title="Marcar como paga"><i class="fa-solid fa-check"></i></button>` : ""}
            <button type="button" class="btn-icon" data-edit="${id}" title="Editar"><i class="fa-solid fa-pen"></i></button>
            <button type="button" class="btn-icon btn-icon--danger" data-delete="${id}" title="Excluir"><i class="fa-solid fa-trash"></i></button>
          </td>
        </tr>`;
      })
      .join("");
  }

  function renderCalendar() {
    if (!els.calendarGrid) return;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const year = today.getFullYear();
    const month = today.getMonth();
    const firstDay = new Date(year, month, 1);
    const startWeekday = firstDay.getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const byDay = {};
    for (const bill of bills) {
      if (bill.status === "paid" || bill.status === "cancelled") continue;
      const d = new Date(bill.dueDate);
      if (d.getMonth() !== month || d.getFullYear() !== year) continue;
      const key = d.getDate();
      if (!byDay[key]) byDay[key] = [];
      byDay[key].push(bill);
    }

    const monthName = today.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
    els.calendarTitle.textContent = monthName.charAt(0).toUpperCase() + monthName.slice(1);

    let html = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"]
      .map((d) => `<div class="ap-cal-head">${d}</div>`)
      .join("");

    for (let i = 0; i < startWeekday; i++) html += `<div class="ap-cal-cell ap-cal-cell--empty"></div>`;

    for (let day = 1; day <= daysInMonth; day++) {
      const dayBills = byDay[day] || [];
      const isToday = day === today.getDate();
      const hasOverdue = dayBills.some((b) => b.status === "overdue");
      const total = dayBills.reduce((s, b) => s + (Number(b.amount) || 0), 0);
      html += `<div class="ap-cal-cell${isToday ? " ap-cal-cell--today" : ""}${hasOverdue ? " ap-cal-cell--overdue" : ""}">
        <span class="ap-cal-day">${day}</span>
        ${dayBills.length ? `<span class="ap-cal-count">${dayBills.length}</span><span class="ap-cal-total">${BuildFlow.formatCurrency(total)}</span>` : ""}
      </div>`;
    }

    els.calendarGrid.innerHTML = html;
  }

  function renderCashFlow() {
    if (!els.cashFlowChart || !summary?.cashFlow) return;
    const max = Math.max(...summary.cashFlow.map((d) => d.total), 1);
    els.cashFlowChart.innerHTML = summary.cashFlow
      .map((day) => {
        const height = Math.max(4, (day.total / max) * 100);
        const date = new Date(day.date);
        const label = date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
        const cls = day.total > 0 ? "ap-bar--active" : "";
        return `<div class="ap-bar-wrap" title="${label}: ${BuildFlow.formatCurrency(day.total)} (${day.count})">
          <div class="ap-bar ${cls}" style="height:${height}%"></div>
          <span>${label}</span>
        </div>`;
      })
      .join("");

    if (els.categoryBreakdown && summary.byCategory) {
      const entries = Object.entries(summary.byCategory).sort((a, b) => b[1].total - a[1].total);
      els.categoryBreakdown.innerHTML = entries.length
        ? entries
            .map(
              ([key, val]) => `<div class="ap-cat-row">
            <span>${BuildFlow.escapeHtml(CATEGORIES[key] || key)}</span>
            <span>${val.count} · ${BuildFlow.formatCurrency(val.total)}</span>
          </div>`,
            )
            .join("")
        : '<p class="ap-empty">Sem contas em aberto por categoria.</p>';
    }
  }

  function renderAll() {
    renderKpis();
    if (activeTab === "list") renderTable();
    if (activeTab === "calendar") renderCalendar();
    if (activeTab === "cashflow") renderCashFlow();
  }

  function openModal(bill = null) {
    editingId = bill ? normalizeId(bill._id) : null;
    els.modalTitle.textContent = bill ? "Editar Conta" : "Nova Conta a Pagar";
    els.fieldDescription.value = bill?.description || "";
    els.fieldSupplier.value = bill?.supplier || "";
    els.fieldCategory.value = bill?.category || "outros";
    els.fieldAmount.value = bill?.amount ?? "";
    els.fieldDueDate.value = bill?.dueDate
      ? new Date(bill.dueDate).toISOString().slice(0, 10)
      : "";
    els.fieldPaymentMethod.value = bill?.paymentMethod || "boleto";
    els.fieldBarcode.value = bill?.barcode || "";
    els.fieldDocument.value = bill?.documentNumber || "";
    els.fieldNotes.value = bill?.notes || "";
    els.fieldReminder.value = bill?.reminderDays ?? 3;
    els.fieldRecurring.checked = bill?.recurring?.enabled || false;
    els.fieldFrequency.value = bill?.recurring?.frequency || "monthly";
    els.recurringFields.style.display = els.fieldRecurring.checked ? "block" : "none";
    els.modalOverlay.style.display = "flex";
  }

  function closeModal() {
    editingId = null;
    els.modalOverlay.style.display = "none";
  }

  async function saveBill(e) {
    e.preventDefault();
    const payload = {
      description: els.fieldDescription.value.trim(),
      supplier: els.fieldSupplier.value.trim(),
      category: els.fieldCategory.value,
      amount: Number(els.fieldAmount.value),
      dueDate: els.fieldDueDate.value,
      paymentMethod: els.fieldPaymentMethod.value,
      barcode: els.fieldBarcode.value.trim(),
      documentNumber: els.fieldDocument.value.trim(),
      notes: els.fieldNotes.value.trim(),
      reminderDays: Number(els.fieldReminder.value) || 3,
      recurring: {
        enabled: els.fieldRecurring.checked,
        frequency: els.fieldFrequency.value,
      },
    };

    try {
      if (editingId) {
        await BuildFlow.apiFetch("/accounts-payable", {
          method: "PUT",
          body: JSON.stringify({ id: editingId, ...payload }),
        });
        Swal.fire({ icon: "success", title: "Conta atualizada!", timer: 1800, showConfirmButton: false });
      } else {
        await BuildFlow.apiFetch("/accounts-payable", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        Swal.fire({ icon: "success", title: "Boleto cadastrado!", timer: 1800, showConfirmButton: false });
      }
      closeModal();
      await loadData();
    } catch (err) {
      Swal.fire({ icon: "error", title: "Erro", text: err.message });
    }
  }

  async function markPaid(id) {
    const result = await Swal.fire({
      title: "Confirmar pagamento?",
      text: "A conta será marcada como paga.",
      icon: "question",
      showCancelButton: true,
      confirmButtonColor: "#10b981",
      confirmButtonText: "Sim, pagar",
      cancelButtonText: "Cancelar",
    });
    if (!result.isConfirmed) return;
    try {
      await BuildFlow.apiFetch("/accounts-payable", {
        method: "PUT",
        body: JSON.stringify({ id, action: "pay" }),
      });
      Swal.fire({ icon: "success", title: "Pagamento registrado!", timer: 1600, showConfirmButton: false });
      await loadData();
    } catch (err) {
      Swal.fire({ icon: "error", title: "Erro", text: err.message });
    }
  }

  async function deleteBill(id) {
    const result = await Swal.fire({
      title: "Excluir conta?",
      text: "Esta ação não pode ser desfeita.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#ef4444",
      confirmButtonText: "Excluir",
      cancelButtonText: "Cancelar",
    });
    if (!result.isConfirmed) return;
    try {
      await BuildFlow.apiFetch("/accounts-payable", {
        method: "DELETE",
        body: JSON.stringify({ id }),
      });
      await loadData();
    } catch (err) {
      Swal.fire({ icon: "error", title: "Erro", text: err.message });
    }
  }

  function checkBrowserNotifications() {
    if (!summary || !("Notification" in window)) return;
    const key = "ap_notified_" + new Date().toISOString().slice(0, 10);
    if (localStorage.getItem(key)) return;

    const alerts = [...(summary.alerts?.overdue || []), ...(summary.alerts?.dueSoon || [])];
    if (!alerts.length) return;

    const notify = () => {
      const overdue = summary.alerts?.overdue?.length || 0;
      const soon = summary.alerts?.dueSoon?.length || 0;
      let body = "";
      if (overdue) body += `${overdue} conta(s) vencida(s). `;
      if (soon) body += `${soon} vencimento(s) nos próximos dias.`;
      new Notification("BuildFlow — Contas a Pagar", { body, icon: "/favicon.ico" });
      localStorage.setItem(key, "1");
    };

    if (Notification.permission === "granted") notify();
    else if (Notification.permission !== "denied") {
      Notification.requestPermission().then((p) => {
        if (p === "granted") notify();
      });
    }
  }

  function bindEvents() {
    els.newBillBtn?.addEventListener("click", () => openModal());
    els.modalClose?.addEventListener("click", closeModal);
    els.modalCancel?.addEventListener("click", closeModal);
    els.billForm?.addEventListener("submit", saveBill);
    els.fieldRecurring?.addEventListener("change", () => {
      els.recurringFields.style.display = els.fieldRecurring.checked ? "block" : "none";
    });

    els.search?.addEventListener("input", debounce(loadData, 350));
    els.filterStatus?.addEventListener("change", loadData);
    els.filterCategory?.addEventListener("change", loadData);
    els.filterFrom?.addEventListener("change", loadData);
    els.filterTo?.addEventListener("change", loadData);

    document.querySelectorAll(".ap-tab").forEach((tab) => {
      tab.addEventListener("click", () => {
        document.querySelectorAll(".ap-tab").forEach((t) => t.classList.remove("active"));
        tab.classList.add("active");
        activeTab = tab.dataset.tab;
        document.querySelectorAll(".ap-panel").forEach((p) => {
          p.style.display = p.dataset.panel === activeTab ? "block" : "none";
        });
        renderAll();
      });
    });

    els.tableBody?.addEventListener("click", (e) => {
      const pay = e.target.closest("[data-pay]");
      const edit = e.target.closest("[data-edit]");
      const del = e.target.closest("[data-delete]");
      if (pay) markPaid(pay.dataset.pay);
      if (edit) {
        const bill = bills.find((b) => normalizeId(b._id) === edit.dataset.edit);
        if (bill) openModal(bill);
      }
      if (del) deleteBill(del.dataset.delete);
    });

    els.notifyBtn?.addEventListener("click", () => {
      if ("Notification" in window) {
        Notification.requestPermission().then((p) => {
          Swal.fire({
            icon: p === "granted" ? "success" : "info",
            title: p === "granted" ? "Notificações ativadas" : "Permissão não concedida",
            timer: 2000,
            showConfirmButton: false,
          });
        });
      }
    });

    els.modalOverlay?.addEventListener("click", (e) => {
      if (e.target === els.modalOverlay) closeModal();
    });
  }

  function debounce(fn, ms) {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), ms);
    };
  }

  function cacheElements() {
    [
      "kpiPending",
      "kpiOverdue",
      "kpiWeek",
      "kpiPaid",
      "badgeOverdue",
      "badgeSoon",
      "alertBanner",
      "tableBody",
      "calendarGrid",
      "calendarTitle",
      "cashFlowChart",
      "categoryBreakdown",
      "search",
      "filterStatus",
      "filterCategory",
      "filterFrom",
      "filterTo",
      "newBillBtn",
      "notifyBtn",
      "modalOverlay",
      "modalTitle",
      "modalClose",
      "modalCancel",
      "billForm",
      "fieldDescription",
      "fieldSupplier",
      "fieldCategory",
      "fieldAmount",
      "fieldDueDate",
      "fieldPaymentMethod",
      "fieldBarcode",
      "fieldDocument",
      "fieldNotes",
      "fieldReminder",
      "fieldRecurring",
      "fieldFrequency",
      "recurringFields",
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
