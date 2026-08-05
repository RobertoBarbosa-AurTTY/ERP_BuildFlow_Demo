// Cadastro de Clientes — CRUD completo.
(function () {
  let customers = [];
  let editingId = null;

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

  async function loadData() {
    const search = els.search?.value?.trim() || "";
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    params.set("limit", "all");

    const res = await BuildFlow.apiFetch(`/customers?${params.toString()}`);
    customers = res.data || [];
    if (els.customerCount) els.customerCount.textContent = customers.length;
    renderTable();
  }

  function renderTable() {
    if (!els.tableBody) return;
    if (!customers.length) {
      els.tableBody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:40px;color:var(--text-muted)">Nenhum cliente encontrado. Cadastre seu primeiro cliente.</td></tr>`;
      return;
    }

    els.tableBody.innerHTML = customers
      .map((c) => {
        const id = normalizeId(c._id);
        return `<tr class="ap-row" data-customer-id="${id}" style="cursor:pointer;">
          <td><strong>${BuildFlow.escapeHtml(c.name)}</strong></td>
          <td>${BuildFlow.escapeHtml(c.cpfCnpj || "—")}</td>
          <td>${BuildFlow.escapeHtml(c.email || "—")}</td>
          <td>${BuildFlow.escapeHtml(c.phone || "—")}</td>
          <td>${BuildFlow.escapeHtml(c.address || "—")}</td>
          <td>${c.active ? '<span class="ap-badge badge-green">Ativo</span>' : '<span class="ap-badge badge-muted">Inativo</span>'}</td>
          <td class="ap-actions">
            <button type="button" class="btn-icon" data-edit="${id}" title="Editar"><i class="fa-solid fa-pen"></i></button>
            <button type="button" class="btn-icon btn-icon--danger" data-delete="${id}" title="Excluir"><i class="fa-solid fa-trash"></i></button>
          </td>
        </tr>`;
      })
      .join("");
  }

  function openModal(customer = null) {
    editingId = customer ? normalizeId(customer._id) : null;
    els.modalTitle.textContent = customer ? "Editar Cliente" : "Novo Cliente";
    els.fieldName.value = customer?.name || "";
    els.fieldCpfCnpj.value = customer?.cpfCnpj || "";
    els.fieldEmail.value = customer?.email || "";
    els.fieldPhone.value = customer?.phone || "";
    els.fieldAddress.value = customer?.address || "";
    els.fieldNotes.value = customer?.notes || "";
    els.fieldActive.checked = customer ? customer.active !== false : true;
    els.modalOverlay.style.display = "flex";
  }

  function closeModal() {
    editingId = null;
    els.modalOverlay.style.display = "none";
  }

  async function saveCustomer(e) {
    e.preventDefault();
    const payload = {
      name: els.fieldName.value.trim(),
      cpfCnpj: els.fieldCpfCnpj.value.trim(),
      email: els.fieldEmail.value.trim(),
      phone: els.fieldPhone.value.trim(),
      address: els.fieldAddress.value.trim(),
      notes: els.fieldNotes.value.trim(),
      active: els.fieldActive.checked,
    };

    try {
      if (editingId) {
        await BuildFlow.apiFetch(`/customers?id=${editingId}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
        Swal.fire({ icon: "success", title: "Cliente atualizado!", timer: 1800, showConfirmButton: false });
      } else {
        await BuildFlow.apiFetch("/customers", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        Swal.fire({ icon: "success", title: "Cliente cadastrado!", timer: 1800, showConfirmButton: false });
      }
      closeModal();
      await loadData();
    } catch (err) {
      Swal.fire({ icon: "error", title: "Erro", text: err.message });
    }
  }

  async function deleteCustomer(id) {
    const result = await Swal.fire({
      title: "Excluir cliente?",
      text: "Esta ação não pode ser desfeita.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#ef4444",
      confirmButtonText: "Excluir",
      cancelButtonText: "Cancelar",
    });
    if (!result.isConfirmed) return;
    try {
      await BuildFlow.apiFetch(`/customers?id=${id}`, { method: "DELETE" });
      await loadData();
    } catch (err) {
      Swal.fire({ icon: "error", title: "Erro", text: err.message });
    }
  }

  function showDetails(customer) {
    const renderRow = (label, value) =>
      `<div style="padding:10px 14px;background:var(--bg-input);border-radius:10px;"><div style="color:var(--text-muted);font-size:0.72rem;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:3px;">${label}</div><div style="font-size:0.9rem;">${value}</div></div>`;
    Swal.fire({
      title: "Ficha do Cliente",
      html: `<div style="text-align:left;">
        <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;">
          ${renderRow("Nome", `<strong>${BuildFlow.escapeHtml(customer.name)}</strong>`)}
          ${renderRow("CPF/CNPJ", BuildFlow.escapeHtml(customer.cpfCnpj || "—"))}
          ${renderRow("E-mail", BuildFlow.escapeHtml(customer.email || "—"))}
          ${renderRow("Telefone", BuildFlow.escapeHtml(customer.phone || "—"))}
          ${renderRow("Endereço", BuildFlow.escapeHtml(customer.address || "—"))}
          ${renderRow("Situação", customer.active ? "Ativo" : "Inativo")}
          ${renderRow("Cadastro", formatDate(customer.createdAt))}
        </div>
        ${customer.notes ? `<div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border);"><div style="color:var(--text-muted);font-size:0.8rem;margin-bottom:4px;">Observações</div><div style="font-size:0.9rem;color:var(--text-secondary);">${BuildFlow.escapeHtml(customer.notes)}</div></div>` : ""}
      </div>`,
      width: 760,
      confirmButtonText: "Fechar",
      confirmButtonColor: "var(--brand, #4f46e5)",
    });
  }

  function debounce(fn, ms) {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), ms);
    };
  }

  function bindEvents() {
    els.newCustomerBtn?.addEventListener("click", () => openModal());
    els.modalClose?.addEventListener("click", closeModal);
    els.modalCancel?.addEventListener("click", closeModal);
    els.customerForm?.addEventListener("submit", saveCustomer);
    els.search?.addEventListener("input", debounce(loadData, 350));
    els.searchBar?.addEventListener("input", debounce(loadData, 350));

    els.tableBody?.addEventListener("click", (e) => {
      const edit = e.target.closest("[data-edit]");
      const del = e.target.closest("[data-delete]");
      if (edit) {
        const customer = customers.find((c) => normalizeId(c._id) === edit.dataset.edit);
        if (customer) openModal(customer);
        return;
      }
      if (del) {
        deleteCustomer(del.dataset.delete);
        return;
      }
      const row = e.target.closest("[data-customer-id]");
      if (row) {
        const customer = customers.find((c) => normalizeId(c._id) === row.dataset.customerId);
        if (customer) showDetails(customer);
      }
    });

    els.modalOverlay?.addEventListener("click", (e) => {
      if (e.target === els.modalOverlay) closeModal();
    });
  }

  function cacheElements() {
    [
      "search",
      "searchBar",
      "customerCount",
      "tableBody",
      "newCustomerBtn",
      "modalOverlay",
      "modalTitle",
      "modalClose",
      "modalCancel",
      "customerForm",
      "fieldName",
      "fieldCpfCnpj",
      "fieldEmail",
      "fieldPhone",
      "fieldAddress",
      "fieldNotes",
      "fieldActive",
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
