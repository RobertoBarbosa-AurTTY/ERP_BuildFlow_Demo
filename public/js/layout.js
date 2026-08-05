// Sidebar única injetada em todas as páginas (fonte única de navegação).
(function () {
  const NAV_GROUPS = [
    {
      title: "Menu Principal",
      items: [
        { href: "/dashboard", icon: "fa-chart-pie", label: "Dashboard" },
        { href: "/stock", icon: "fa-boxes-stacked", label: "Estoque" },
        { href: "/receiving", icon: "fa-file-import", label: "Entradas" },
        { href: "/pos", icon: "fa-cart-shopping", label: "PDV / Vendas" },
      ],
    },
    {
      title: "Relatórios & Analíticos",
      items: [
        { href: "/reports", icon: "fa-chart-line", label: "Relatórios" },
        { href: "/cash-flow", icon: "fa-money-bill-trend-up", label: "Fluxo de Caixa" },
        { href: "/cash-audit", icon: "fa-magnifying-glass-chart", label: "Auditoria de Caixa", adminOnly: true },
      ],
    },
    {
      title: "Históricos",
      items: [
        { href: "/sales-history", icon: "fa-clock-rotate-left", label: "Histórico de Vendas" },
      ],
    },
    {
      title: "Financeiro",
      items: [
        { href: "/bills", icon: "fa-file-invoice-dollar", label: "Contas a Pagar" },
        { href: "/receivables", icon: "fa-hand-holding-dollar", label: "Contas a Receber" },
        { href: "/customers", icon: "fa-users", label: "Clientes" },
      ],
    },
    {
      title: "Sistema",
      items: [
        { href: "/settings", icon: "fa-sliders", label: "Configurações" },
        { href: "/manual", icon: "fa-circle-question", label: "Ajuda" },
      ],
    },
  ];

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function currentRoute() {
    return window.location.pathname;
  }

  function isActive(href) {
    return currentRoute() === href;
  }

  function currentRole() {
    try {
      const user = JSON.parse(localStorage.getItem("user") || "null");
      return user?.role || null;
    } catch {
      return null;
    }
  }

  function isAdminOnlyVisible(item) {
    if (!item.adminOnly) return true;
    const role = currentRole();
    return role === "Admin" || role === "Gerente";
  }

  function buildNav() {
    return NAV_GROUPS.map(
      (group) => `
        <div class="sidebar-group">
          <div class="sidebar-group-header">${group.title}</div>
          <ul class="nav-list">
            ${group.items
              .filter(isAdminOnlyVisible)
              .map(
                (item) => `
              <li class="nav-item">
                <a href="${item.href}" class="nav-link${isActive(item.href) ? " active" : ""}">
                  <i class="fa-solid ${item.icon}"></i><span>${item.label}</span>
                </a>
              </li>`,
              )
              .join("")}
          </ul>
        </div>`,
    ).join("");
  }

  function fillUserProfile() {
    const user = (function () {
      try {
        return JSON.parse(localStorage.getItem("user") || "null");
      } catch {
        return null;
      }
    })();
    const avatar = document.querySelector(".user-avatar");
    const nameEl = document.querySelector(".user-info p");
    const roleEl = document.querySelector(".user-info span");
    if (!avatar && !nameEl) return;

    const name = user?.name || user?.email || "Usuário";
    const initials = String(name)
      .split(/\s+/)
      .map((p) => p[0])
      .slice(0, 2)
      .join("")
      .toUpperCase();
    if (avatar) avatar.textContent = initials || "U";
    if (nameEl) nameEl.textContent = name;
    if (roleEl) roleEl.textContent = user?.role || "Operador";
  }

  function injectSidebar() {
    if (document.querySelector(".layout > aside.sidebar")) return;
    const layout = document.querySelector(".layout");
    if (!layout) return;

    const aside = document.createElement("aside");
    aside.className = "sidebar";
    aside.innerHTML = `
      <div class="sidebar-logo">
        <div class="sidebar-logo-icon"><i class="fa-solid fa-layer-group"></i></div>
        <div class="sidebar-logo-text">Build<span>Flow</span></div>
      </div>
      <div class="sidebar-inner">${buildNav()}</div>
      <div class="sidebar-user">
        <div class="user-avatar">U</div>
        <div class="user-info">
          <p>Usuário</p>
          <span>Operador</span>
        </div>
      </div>`;

    layout.insertBefore(aside, layout.firstChild);
    fillUserProfile();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", injectSidebar);
  } else {
    injectSidebar();
  }

  // checkAuth preenche o localStorage de forma assíncrona; tenta de novo depois
  window.addEventListener("load", () => setTimeout(fillUserProfile, 600));
})();
