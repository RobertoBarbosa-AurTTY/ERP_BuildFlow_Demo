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
  let calendarMonthOffset = 0;
  let calendarViewMonth = 0;
  let calendarViewYear = 0;

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
    params.set("limit", "all");

    const summaryParams = new URLSearchParams(params.toString());
    summaryParams.set("summary", "true");

    const [listRes, summaryRes] = await Promise.all([
      BuildFlow.apiFetch(`/accounts-payable?${params.toString()}`),
      BuildFlow.apiFetch(`/accounts-payable?${summaryParams.toString()}`),
    ]);

    bills = listRes.data || [];
    summary = summaryRes;
    calendarMonthOffset = 0;
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

        return `<tr class="ap-row ap-row--${bill.status}" data-bill-id="${id}" style="cursor:pointer;">
          <td><strong>${BuildFlow.escapeHtml(bill.description)}</strong>${bill.documentNumber ? `<br><small>${BuildFlow.escapeHtml(bill.documentNumber)}</small>` : ""}</td>
          <td>${BuildFlow.escapeHtml(bill.supplier || "—")}</td>
          <td>${BuildFlow.escapeHtml(CATEGORIES[bill.category] || bill.category)}</td>
          <td>${formatDate(bill.dueDate)}</td>
          <td><strong>${BuildFlow.formatCurrency(bill.amount)}</strong></td>
          <td style="white-space:nowrap;">${statusBadge(bill.status)}</td>
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

    const targetDate = new Date(today.getFullYear(), today.getMonth() + calendarMonthOffset, 1);
    const targetYear = targetDate.getFullYear();
    const targetMonth = targetDate.getMonth();
    calendarViewMonth = targetMonth;
    calendarViewYear = targetYear;
    const startWeekday = targetDate.getDay();
    const daysInMonth = new Date(targetYear, targetMonth + 1, 0).getDate();

    const byDay = {};
    for (const bill of bills) {
      if (bill.status === "paid" || bill.status === "cancelled") continue;
      const d = new Date(bill.dueDate);
      if (d.getMonth() !== targetMonth || d.getFullYear() !== targetYear) continue;
      const key = d.getDate();
      if (!byDay[key]) byDay[key] = [];
      byDay[key].push(bill);
    }

    const monthName = targetDate.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
    els.calendarTitle.textContent = monthName.charAt(0).toUpperCase() + monthName.slice(1);

    let html = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"]
      .map((d) => `<div class="ap-cal-head">${d}</div>`)
      .join("");

    for (let i = 0; i < startWeekday; i++) html += `<div class="ap-cal-cell ap-cal-cell--empty"></div>`;

    const isCurrentMonth = calendarMonthOffset === 0;

    for (let day = 1; day <= daysInMonth; day++) {
      const dayBills = byDay[day] || [];
      const isToday = isCurrentMonth && day === today.getDate();
      const hasOverdue = dayBills.some((b) => b.status === "overdue");
      const total = dayBills.reduce((s, b) => s + (Number(b.amount) || 0), 0);
      html += `<div class="ap-cal-cell${isToday ? " ap-cal-cell--today" : ""}${hasOverdue ? " ap-cal-cell--overdue" : ""}" data-day="${day}">
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

  function showDayBills(day) {
    const dayBills = bills.filter((b) => {
      if (b.status === "paid" || b.status === "cancelled") return false;
      const d = new Date(b.dueDate);
      return d.getDate() === day && d.getMonth() === calendarViewMonth && d.getFullYear() === calendarViewYear;
    });
    if (!dayBills.length) return;

    const rows = dayBills
      .map((b) => {
        return `<tr>
          <td style="padding:10px 8px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:200px;">${BuildFlow.escapeHtml(b.description)}${b.documentNumber ? `<br><small style="font-weight:400;">${BuildFlow.escapeHtml(b.documentNumber)}</small>` : ""}</td>
          <td style="padding:10px 8px;white-space:nowrap;">${BuildFlow.escapeHtml(b.supplier || "—")}</td>
          <td style="padding:10px 8px;white-space:nowrap;">${BuildFlow.escapeHtml(CATEGORIES[b.category] || b.category)}</td>
          <td style="padding:10px 8px;white-space:nowrap;text-align:right;">${BuildFlow.formatCurrency(b.amount)}</td>
          <td style="padding:10px 8px;white-space:nowrap;">${statusBadge(b.status)}</td>
        </tr>`;
      })
      .join("");

    const dateStr = new Date(calendarViewYear, calendarViewMonth, day).toLocaleDateString("pt-BR");
    Swal.fire({
      title: `Contas — ${dateStr}`,
      html: `<div style="text-align:left;max-height:55vh;overflow-y:auto;"><table style="width:100%;border-collapse:collapse;font-size:0.85rem;table-layout:fixed;">
        <colgroup><col><col style="width:120px;"><col style="width:100px;"><col style="width:90px;"><col style="width:90px;"></colgroup>
        <thead><tr style="border-bottom:2px solid var(--border);text-align:left;">
          <th style="padding:10px 8px;">Descrição</th>
          <th style="padding:10px 8px;white-space:nowrap;">Fornecedor</th>
          <th style="padding:10px 8px;white-space:nowrap;">Categoria</th>
          <th style="padding:10px 8px;white-space:nowrap;text-align:right;">Valor</th>
          <th style="padding:10px 8px;white-space:nowrap;">Status</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table></div>`,
      width: 800,
      confirmButtonText: "Fechar",
      confirmButtonColor: "var(--brand, #4f46e5)",
    });
  }

  function showInstallmentGroup(groupId) {
    BuildFlow.apiFetch(`/accounts-payable?groupId=${encodeURIComponent(groupId)}`).then((groupBills) => {
      if (!groupBills || !groupBills.length) return;
      const rows = groupBills
        .map((b) => {
          const paid = b.status === "paid" || b.status === "cancelled";
          return `<tr style="border-bottom:1px solid var(--border);${paid ? "opacity:0.6;" : ""}">
            <td style="padding:10px 8px;white-space:nowrap;text-align:center;">${b.installmentNumber || "—"}/${b.totalInstallments || "—"}</td>
            <td style="padding:10px 8px;white-space:nowrap;">${formatDate(b.dueDate)}</td>
            <td style="padding:10px 8px;white-space:nowrap;text-align:right;">${BuildFlow.formatCurrency(b.amount)}</td>
            <td style="padding:10px 8px;white-space:nowrap;text-align:right;">${b.paidDate ? formatDate(b.paidDate) : "—"}</td>
            <td style="padding:10px 8px;white-space:nowrap;">${statusBadge(b.status)}</td>
          </tr>`;
        })
        .join("");
      const paidCount = groupBills.filter((b) => b.status === "paid").length;
      Swal.fire({
        title: `Parcelas — ${BuildFlow.escapeHtml(groupBills[0].description)}`,
        html: `<div style="text-align:left;"><div style="margin-bottom:12px;font-size:0.85rem;color:var(--text-muted);">${paidCount} de ${groupBills.length} pagas · Total: ${BuildFlow.formatCurrency(groupBills.reduce((s, b) => s + (Number(b.amount) || 0), 0))}</div><div style="max-height:50vh;overflow-y:auto;"><table style="width:100%;border-collapse:collapse;font-size:0.85rem;table-layout:fixed;">
          <colgroup><col style="width:80px;"><col style="width:100px;"><col style="width:100px;"><col style="width:100px;"><col></colgroup>
          <thead><tr style="border-bottom:2px solid var(--border);">
            <th style="padding:10px 8px;text-align:center;white-space:nowrap;">Parcela</th>
            <th style="padding:10px 8px;white-space:nowrap;">Vencimento</th>
            <th style="padding:10px 8px;text-align:right;white-space:nowrap;">Valor</th>
            <th style="padding:10px 8px;text-align:right;white-space:nowrap;">Pago em</th>
            <th style="padding:10px 8px;white-space:nowrap;">Status</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table></div></div>`,
        width: 650,
        confirmButtonText: "Fechar",
        confirmButtonColor: "var(--brand, #4f46e5)",
      });
    });
  }

  async function showBillDetails(bill) {
    const isGroup = bill.totalInstallments > 1 && bill.installmentGroupId;
    let groupData = null;
    if (isGroup) {
      try {
        const res = await BuildFlow.apiFetch(`/accounts-payable?groupId=${encodeURIComponent(bill.installmentGroupId)}`);
        if (res && res.length) groupData = res;
      } catch (_) {}
    }

    const paidBills = groupData ? groupData.filter((b) => b.status === "paid") : [];
    const pendingBills = groupData ? groupData.filter((b) => b.status !== "paid" && b.status !== "cancelled") : [];

    let summaryHtml = "";
    if (groupData) {
      const totalAmount = groupData.reduce((s, b) => s + (Number(b.amount) || 0), 0);
      const paidTotal = paidBills.reduce((s, b) => s + (Number(b.amount) || 0), 0);
      const pendingTotal = pendingBills.reduce((s, b) => s + (Number(b.amount) || 0), 0);
      summaryHtml = `
        <div style="display:flex;gap:16px;margin-bottom:16px;padding:12px 16px;background:var(--bg-hover);border-radius:10px;">
          <div style="flex:1;text-align:center;">
            <div style="font-size:0.7rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.04em;">Pagas</div>
            <div style="font-size:1.1rem;font-weight:700;color:#10b981;">${paidBills.length}/${groupData.length}</div>
            <div style="font-size:0.8rem;color:var(--text-secondary);">${BuildFlow.formatCurrency(paidTotal)}</div>
          </div>
          <div style="flex:1;text-align:center;">
            <div style="font-size:0.7rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.04em;">Pendente</div>
            <div style="font-size:1.1rem;font-weight:700;color:#f59e0b;">${pendingBills.length}</div>
            <div style="font-size:0.8rem;color:var(--text-secondary);">${BuildFlow.formatCurrency(pendingTotal)}</div>
          </div>
          <div style="flex:1;text-align:center;">
            <div style="font-size:0.7rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.04em;">Total</div>
            <div style="font-size:1.1rem;font-weight:700;">${groupData.length}</div>
            <div style="font-size:0.8rem;color:var(--text-secondary);">${BuildFlow.formatCurrency(totalAmount)}</div>
          </div>
        </div>`;
    }

    const parcelas = isGroup
      ? `${bill.installmentNumber || "—"}/${bill.totalInstallments}`
      : "—";
    const renderRow = (label, value) =>
      `<tr><td style="padding:6px 10px 6px 0;color:var(--text-muted);font-size:0.8rem;white-space:nowrap;vertical-align:top;width:1px;">${label}</td><td style="padding:6px 0;font-size:0.9rem;">${value}</td></tr>`;
    const html = `
      <div style="text-align:left;">
        ${summaryHtml}
        <table style="width:100%;border-collapse:collapse;">
          <tbody>
            ${renderRow("Descrição", `<strong>${BuildFlow.escapeHtml(bill.description)}</strong>`)}
            ${renderRow("Fornecedor", BuildFlow.escapeHtml(bill.supplier || "—"))}
            ${renderRow("Categoria", BuildFlow.escapeHtml(CATEGORIES[bill.category] || bill.category))}
            ${renderRow("Valor", `<strong>${BuildFlow.formatCurrency(bill.amount)}</strong>`)}
            ${renderRow("Vencimento", formatDate(bill.dueDate))}
            ${renderRow("Status", statusBadge(bill.status))}
            ${renderRow("Parcelas", parcelas)}
            ${bill.documentNumber ? renderRow("Nº Documento", BuildFlow.escapeHtml(bill.documentNumber)) : ""}
            ${bill.paymentMethod ? renderRow("Forma de Pagamento", BuildFlow.escapeHtml(PAYMENT_METHODS[bill.paymentMethod] || bill.paymentMethod)) : ""}
            ${bill.paidDate ? renderRow("Pago em", formatDate(bill.paidDate)) : ""}
          </tbody>
        </table>
        ${bill.notes ? `<div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border);"><div style="color:var(--text-muted);font-size:0.8rem;margin-bottom:4px;">Observações</div><div style="font-size:0.9rem;color:var(--text-secondary);">${BuildFlow.escapeHtml(bill.notes)}</div></div>` : ""}
      </div>`;

    const showGroupBtn = isGroup;
    Swal.fire({
      title: "Ficha da Conta",
      html: html,
      width: 600,
      showConfirmButton: true,
      confirmButtonText: "Fechar",
      confirmButtonColor: "var(--brand, #4f46e5)",
      showCancelButton: showGroupBtn,
      cancelButtonText: "Ver parcelas",
      cancelButtonColor: "var(--text-muted)",
      reverseButtons: true,
    }).then((res) => {
      if (res.dismiss === Swal.DismissReason.cancel && showGroupBtn) {
        showInstallmentGroup(bill.installmentGroupId);
      }
    });
  }

  function openModal(bill = null) {
    editingId = bill ? normalizeId(bill._id) : null;
    els.modalTitle.textContent = bill ? "Editar Conta" : "Nova Conta a Pagar";
    els.fieldDescription.value = bill?.description || "";
    els.fieldSupplier.value = bill?.supplier || "";
    els.fieldCategory.value = bill?.category || "outros";
    const isInstallment = bill?.totalInstallments > 1;
    const installmentAmount = isInstallment && bill?.totalInstallments
      ? (Number(bill.amount) || 0)
      : (bill?.amount ?? "");
    els.fieldAmount.value = installmentAmount;
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
    if (els.installmentFields) {
      els.installmentFields.style.display = "block";
    }
    if (els.fieldInstallmentCheck) els.fieldInstallmentCheck.checked = isInstallment;
    if (els.fieldInstallmentCount) els.fieldInstallmentCount.value = bill?.totalInstallments || 2;
    if (els.installmentCountFields) {
      els.installmentCountFields.style.display = isInstallment ? "block" : "none";
    }
    els.modalOverlay.style.display = "flex";
  }

  function closeModal() {
    editingId = null;
    els.modalOverlay.style.display = "none";
  }

  async function saveBill(e) {
    e.preventDefault();
    const amount = Number(els.fieldAmount.value);
    const totalInstallments = els.fieldInstallmentCheck?.checked ? parseInt(els.fieldInstallmentCount?.value, 10) : null;

    const payload = {
      description: els.fieldDescription.value.trim(),
      supplier: els.fieldSupplier.value.trim(),
      category: els.fieldCategory.value,
      amount: totalInstallments > 1 ? amount * totalInstallments : amount,
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
      totalInstallments: totalInstallments > 1 ? totalInstallments : null,
    };

    try {
      if (editingId) {
        const { totalInstallments: _, ...editPayload } = payload;
        await BuildFlow.apiFetch("/accounts-payable", {
          method: "PUT",
          body: JSON.stringify({ id: editingId, ...editPayload, amount: Number(els.fieldAmount.value) }),
        });
        Swal.fire({ icon: "success", title: "Conta atualizada!", timer: 1800, showConfirmButton: false });
      } else {
        await BuildFlow.apiFetch("/accounts-payable", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        const msg = totalInstallments > 1
          ? `${totalInstallments} parcelas cadastradas!`
          : "Boleto cadastrado!";
        Swal.fire({ icon: "success", title: msg, timer: 1800, showConfirmButton: false });
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
    els.fieldInstallmentCheck?.addEventListener("change", () => {
      if (els.installmentCountFields) {
        els.installmentCountFields.style.display = els.fieldInstallmentCheck.checked ? "block" : "none";
      }
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
      if (pay) { markPaid(pay.dataset.pay); return; }
      if (edit) {
        const bill = bills.find((b) => normalizeId(b._id) === edit.dataset.edit);
        if (bill) openModal(bill);
        return;
      }
      if (del) { deleteBill(del.dataset.delete); return; }
      const row = e.target.closest("[data-bill-id]");
      if (row) {
        const bill = bills.find((b) => normalizeId(b._id) === row.dataset.billId);
        if (bill) showBillDetails(bill);
      }
    });

    els.calPrev?.addEventListener("click", () => {
      calendarMonthOffset--;
      renderCalendar();
    });
    els.calNext?.addEventListener("click", () => {
      calendarMonthOffset++;
      renderCalendar();
    });

    els.calendarGrid?.addEventListener("click", (e) => {
      const cell = e.target.closest("[data-day]");
      if (!cell) return;
      const day = parseInt(cell.dataset.day, 10);
      showDayBills(day);
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
      "calPrev",
      "calNext",
      "cashFlowChart",
      "categoryBreakdown",
      "search",
      "filterStatus",
      "filterCategory",
      "filterFrom",
      "filterTo",
      "newBillBtn",
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
      "fieldInstallmentCheck",
      "fieldInstallmentCount",
      "installmentFields",
      "installmentCountFields",
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
