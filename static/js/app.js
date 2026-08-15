/* ==========================================================================
   Financial Tracker - shared app helpers
   ========================================================================== */

(function () {
  "use strict";

  const CURRENCY = document.body.dataset.currency || "$";

  const MONTH_NAMES = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  const MONTH_SHORT = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];

  /* ------------------------------------------------------------------------
     Utilities
     ------------------------------------------------------------------------ */

  function escapeHtml(value) {
    if (value === null || value === undefined) return "";
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function fmtMoney(value) {
    const num = Number(value) || 0;
    return (
      CURRENCY +
      num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    );
  }

  function fmtDate(value) {
    if (!value) return "—";
    const d = new Date(value);
    if (isNaN(d.getTime())) return value;
    return `${d.getDate()} ${MONTH_SHORT[d.getMonth()]} ${d.getFullYear()}`;
  }

  function todayISO() {
    const d = new Date();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${d.getFullYear()}-${m}-${day}`;
  }

  function debounce(fn, wait) {
    let timer = null;
    return function (...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), wait);
    };
  }

  /* ------------------------------------------------------------------------
     API wrapper
     ------------------------------------------------------------------------ */

  async function api(path, options = {}) {
    const opts = { headers: {}, ...options };
    if (opts.body && typeof opts.body !== "string") {
      opts.headers["Content-Type"] = "application/json";
      opts.body = JSON.stringify(opts.body);
    }
    const res = await fetch(path, opts);
    if (res.status === 204) return null;
    let data = null;
    try {
      data = await res.json();
    } catch (e) {
      data = null;
    }
    if (!res.ok) {
      const message = (data && data.error) || `Request failed (${res.status})`;
      throw new Error(message);
    }
    return data;
  }

  /* ------------------------------------------------------------------------
     Toasts
     ------------------------------------------------------------------------ */

  function showToast(message, type = "info", timeout = 3500) {
    const stack = document.getElementById("toast-stack");
    if (!stack) return;
    const el = document.createElement("div");
    el.className = `toast ${type}`;
    el.textContent = message;
    stack.appendChild(el);
    setTimeout(() => {
      el.style.opacity = "0";
      el.style.transition = "opacity .3s";
      setTimeout(() => el.remove(), 320);
    }, timeout);
  }

  /* ------------------------------------------------------------------------
     Modal
     ------------------------------------------------------------------------ */

  const backdrop = document.getElementById("modal-backdrop");
  const modalTitle = document.getElementById("modal-title");
  const modalBody = document.getElementById("modal-body");
  const modalClose = document.getElementById("modal-close");
  let onModalClose = null;

  function openModal(title, html, onClose) {
    modalTitle.textContent = title;
    modalBody.innerHTML = html;
    onModalClose = onClose || null;
    backdrop.hidden = false;
    document.body.style.overflow = "hidden";
    const first = modalBody.querySelector("input, select, textarea, button");
    if (first) setTimeout(() => first.focus(), 50);
  }

  function closeModal() {
    backdrop.hidden = true;
    document.body.style.overflow = "";
    if (onModalClose) {
      const cb = onModalClose;
      onModalClose = null;
      cb();
    }
  }

  modalClose.addEventListener("click", closeModal);
  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) closeModal();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !backdrop.hidden) closeModal();
  });

  /* ------------------------------------------------------------------------
     Confirm dialog (promise based)
     ------------------------------------------------------------------------ */

  function confirmAction(message, { title = "Are you sure?", confirmText = "Delete" } = {}) {
    return new Promise((resolve) => {
      const html = `
        <p style="color:var(--text-muted);font-size:14px">${escapeHtml(message)}</p>
        <div class="form-actions">
          <button type="button" class="btn btn-secondary" data-confirm-no>Cancel</button>
          <button type="button" class="btn btn-primary" data-confirm-yes>${escapeHtml(confirmText)}</button>
        </div>`;
      openModal(title, html, () => resolve(false));
      const yes = modalBody.querySelector("[data-confirm-yes]");
      const no = modalBody.querySelector("[data-confirm-no]");
      yes.addEventListener("click", () => { closeModal(); resolve(true); });
      no.addEventListener("click", closeModal);
    });
  }

  /* ------------------------------------------------------------------------
     Sidebar (mobile)
     ------------------------------------------------------------------------ */

  const sidebar = document.getElementById("sidebar");
  const backdropEl = document.getElementById("sidebar-backdrop");
  const toggle = document.getElementById("sidebar-toggle");

  function closeSidebar() {
    if (!sidebar) return;
    sidebar.classList.remove("open");
    if (backdropEl) backdropEl.classList.remove("show");
  }

  if (toggle) {
    toggle.addEventListener("click", () => {
      sidebar.classList.toggle("open");
      if (backdropEl) backdropEl.classList.toggle("show");
    });
  }
  if (backdropEl) backdropEl.addEventListener("click", closeSidebar);
  sidebar && sidebar.querySelectorAll(".nav-link").forEach((l) =>
    l.addEventListener("click", closeSidebar)
  );

  /* ------------------------------------------------------------------------
     Shared select helpers
     ------------------------------------------------------------------------ */

  function populateMonths(select, selected) {
    if (!select) return;
    select.innerHTML = "";
    MONTH_NAMES.forEach((name, i) => {
      const opt = document.createElement("option");
      opt.value = String(i + 1);
      opt.textContent = name;
      if (String(i + 1) === String(selected)) opt.selected = true;
      select.appendChild(opt);
    });
  }

  function populateYears(select, selected, startYear = 2020) {
    if (!select) return;
    const current = new Date().getFullYear();
    select.innerHTML = "";
    for (let y = current + 1; y >= startYear; y--) {
      const opt = document.createElement("option");
      opt.value = String(y);
      opt.textContent = String(y);
      if (String(y) === String(selected)) opt.selected = true;
      select.appendChild(opt);
    }
  }

  function fillCategories(select, categories, selected) {
    if (!select) return;
    select.innerHTML = "";
    categories.forEach((c) => {
      const opt = document.createElement("option");
      opt.value = c;
      opt.textContent = c;
      if (c === selected) opt.selected = true;
      select.appendChild(opt);
    });
  }

  /* ------------------------------------------------------------------------
     Chart helpers
     ------------------------------------------------------------------------ */

  function makeChart(canvasId, config) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return null;
    const existing = Chart.getChart(canvas);
    if (existing) existing.destroy();
    return new Chart(canvas, config);
  }

  const CHART_COLORS = [
    "#4f46e5", "#f59e0b", "#10b981", "#ef4444", "#0ea5e9",
    "#8b5cf6", "#ec4899", "#14b8a6", "#f97316", "#6366f1",
  ];

  const chartDefaults = {
    font: { family: "Inter, system-ui, sans-serif" },
    color: "#64748b",
  };

  /* ------------------------------------------------------------------------
     Boot
     ------------------------------------------------------------------------ */

  const dateEl = document.getElementById("topbar-date");
  if (dateEl) {
    const d = new Date();
    dateEl.textContent = `${d.toLocaleDateString("en-US", {
      weekday: "long", year: "numeric", month: "long", day: "numeric",
    })}`;
  }

  window.App = {
    api,
    showToast,
    openModal,
    closeModal,
    confirmAction,
    escapeHtml,
    fmtMoney,
    fmtDate,
    todayISO,
    debounce,
    populateMonths,
    populateYears,
    fillCategories,
    makeChart,
    CHART_COLORS,
    chartDefaults,
    MONTH_SHORT,
  };
})();
