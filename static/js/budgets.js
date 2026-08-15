/* ==========================================================================
   Budgets page
   ========================================================================== */

(async function () {
  "use strict";

  const A = window.App;
  const today = new Date();

  const state = {
    month: today.getMonth() + 1,
    year: today.getFullYear(),
    budgets: [],
    categories: [],
    editingId: null,
  };

  const els = {
    month: document.getElementById("budget-month"),
    year: document.getElementById("budget-year"),
    addBtn: document.getElementById("btn-add-budget"),
    cards: document.getElementById("budget-cards"),
    chipBudget: document.getElementById("chip-budget"),
    chipSpent: document.getElementById("chip-spent"),
    chipRemaining: document.getElementById("chip-remaining"),
    emptyMsg: document.getElementById("budget-empty-msg"),
  };

  const STATUS_META = {
    ok: { label: "On track", className: "ok" },
    warn: { label: "Warning", className: "warn" },
    danger: { label: "Almost over", className: "danger" },
    exceeded: { label: "Exceeded", className: "exceeded" },
  };

  function statusBadge(status) {
    const meta = STATUS_META[status] || STATUS_META.ok;
    const map = {
      ok: "badge-income",
      warn: "badge-muted",
      danger: "badge-muted",
      exceeded: "badge-expense",
    };
    return `<span class="badge ${map[status]}">${meta.label}</span>`;
  }

  function render() {
    els.cards.innerHTML = "";
    if (state.budgets.length === 0) {
      els.cards.innerHTML = `
        <div class="card" style="grid-column: 1 / -1; text-align:center; padding: 40px">
          <div class="empty-state" style="padding:0">
            <div class="empty-icon">◔</div>
            <p>No budgets set for ${A.MONTH_SHORT[state.month - 1]} ${state.year}.</p>
            <p style="margin-top:6px">Create a budget to track your monthly spending.</p>
          </div>
        </div>`;
      return;
    }
    state.budgets.forEach((b) => {
      const meta = STATUS_META[b.status] || STATUS_META.ok;
      const over = b.status === "exceeded" ? "Budget exceeded!" : `${A.fmtMoney(Math.max(b.remaining, 0))} remaining`;
      const card = document.createElement("div");
      card.className = "card budget-card";
      card.innerHTML = `
        <div class="card-header" style="margin-bottom:12px">
          <h2 class="card-title">${A.escapeHtml(b.category)}</h2>
          ${statusBadge(b.status)}
        </div>
        <div class="progress-label">
          <span>Budget: <strong>${A.fmtMoney(b.budget_amount)}</strong></span>
          <span style="color:${meta.className === "exceeded" ? "var(--danger)" : "var(--text)"}">${b.percent}%</span>
        </div>
        <div class="progress-track">
          <div class="progress-fill ${b.status}" style="width:${Math.min(b.percent, 100)}%"></div>
        </div>
        <div class="budget-meta">
          <span>Spent: <strong>${A.fmtMoney(b.spent)}</strong></span>
          <span style="color:${b.remaining < 0 ? "var(--danger)" : "var(--success)"}">${over}</span>
        </div>
        <div style="margin-top:12px; display:flex; gap:8px; justify-content:flex-end">
          <button class="btn btn-secondary btn-sm" data-edit="${b.id}">Edit</button>
          <button class="btn btn-danger-ghost btn-sm" data-del="${b.id}">Delete</button>
        </div>`;
      card.querySelector("[data-edit]").addEventListener("click", () => openForm(b));
      card.querySelector("[data-del]").addEventListener("click", () => deleteBudget(b));
      els.cards.appendChild(card);
    });
  }

  async function loadBudgets() {
    const data = await A.api(`/api/budgets?month=${state.month}&year=${state.year}`);
    state.budgets = data.budgets;
    els.chipBudget.textContent = A.fmtMoney(data.totals.budget);
    els.chipSpent.textContent = A.fmtMoney(data.totals.spent);
    els.chipRemaining.textContent = A.fmtMoney(data.totals.remaining);
    els.chipRemaining.style.color = data.totals.remaining < 0 ? "var(--danger)" : "var(--success)";
    render();
  }

  /* ------------------------------------------------------------------------
     Form
     ------------------------------------------------------------------------ */

  function buildForm(budget) {
    const budgetedCats = new Set(state.budgets.map((b) => b.category));
    let catOptions = "";
    state.categories.forEach((c) => {
      if (budget && budget.category === c) {
        catOptions += `<option value="${A.escapeHtml(c)}" selected>${A.escapeHtml(c)}</option>`;
      } else if (!budget && budgetedCats.has(c)) {
        return;
      } else {
        catOptions += `<option value="${A.escapeHtml(c)}">${A.escapeHtml(c)}</option>`;
      }
    });
    return `
      <form id="budget-form" novalidate>
        <div class="form-grid">
          <div class="form-row">
            <label class="form-label" for="bd-category">Category <span class="req">*</span></label>
            <select class="form-select" id="bd-category">${catOptions}</select>
            <div class="form-error" id="err-bd-category"></div>
          </div>
          <div class="form-row">
            <label class="form-label" for="bd-amount">Budget Limit <span class="req">*</span></label>
            <input type="number" class="form-control" id="bd-amount" min="0.01" step="0.01" max="999999999999.99"
                   value="${budget ? budget.budget_amount : ""}" placeholder="0.00" inputmode="decimal">
            <div class="form-error" id="err-bd-amount"></div>
          </div>
        </div>
        <div class="form-grid">
          <div class="form-row">
            <label class="form-label" for="bd-month">Month <span class="req">*</span></label>
            <select class="form-select" id="bd-month"></select>
          </div>
          <div class="form-row">
            <label class="form-label" for="bd-year">Year <span class="req">*</span></label>
            <select class="form-select" id="bd-year"></select>
          </div>
        </div>
        <div class="form-actions">
          <button type="button" class="btn btn-secondary" data-modal-close-btn>Cancel</button>
          <button type="submit" class="btn btn-primary">${budget ? "Save Changes" : "Add Budget"}</button>
        </div>
      </form>`;
  }

  function openForm(budget) {
    state.editingId = budget ? budget.id : null;
    A.openModal(budget ? "Edit Budget" : "Add Budget", buildForm(budget));
    const monthSel = document.getElementById("bd-month");
    const yearSel = document.getElementById("bd-year");
    A.populateMonths(monthSel, budget ? budget.month : state.month);
    A.populateYears(yearSel, budget ? budget.year : state.year);
    document.querySelector("[data-modal-close-btn]").addEventListener("click", A.closeModal);

    document.getElementById("budget-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const category = document.getElementById("bd-category").value;
      const amount = document.getElementById("bd-amount").value.trim();
      const month = document.getElementById("bd-month").value;
      const year = document.getElementById("bd-year").value;

      document.querySelectorAll(".form-error").forEach((el) => el.classList.remove("show"));
      document.querySelectorAll(".form-control.invalid").forEach((el) => el.classList.remove("invalid"));

      let ok = true;
      const amtNum = parseFloat(amount);
      if (!category) { ok = false; }
      if (!amount || isNaN(amtNum) || amtNum <= 0 || !/^\d+(\.\d{1,2})?$/.test(amount)) {
        const err = document.getElementById("err-bd-amount");
        err.textContent = "Enter a positive budget amount (max 2 decimals).";
        err.classList.add("show");
        document.getElementById("bd-amount").classList.add("invalid");
        ok = false;
      }

      if (!ok) return;

      const payload = { category, budget_amount: amount, month, year };
      try {
        if (state.editingId) {
          await A.api(`/api/budgets/${state.editingId}`, { method: "PUT", body: payload });
          A.showToast("Budget updated.", "success");
        } else {
          await A.api("/api/budgets", { method: "POST", body: payload });
          A.showToast("Budget created.", "success");
        }
        A.closeModal();
        await loadBudgets();
      } catch (err) {
        A.showToast(err.message, "error", 6000);
      }
    });
  }

  async function deleteBudget(b) {
    const confirmed = await A.confirmAction(
      `Delete the ${b.category} budget for ${A.MONTH_SHORT[b.month - 1]} ${b.year}?`,
      { confirmText: "Delete" }
    );
    if (!confirmed) return;
    try {
      await A.api(`/api/budgets/${b.id}`, { method: "DELETE" });
      A.showToast("Budget deleted.", "success");
      await loadBudgets();
    } catch (err) {
      A.showToast(err.message, "error", 5000);
    }
  }

  /* ------------------------------------------------------------------------
     Init
     ------------------------------------------------------------------------ */

  els.month.addEventListener("change", () => { state.month = Number(els.month.value); loadBudgets().catch((err) => A.showToast(err.message, "error", 5000)); });
  els.year.addEventListener("change", () => { state.year = Number(els.year.value); loadBudgets().catch((err) => A.showToast(err.message, "error", 5000)); });
  els.addBtn.addEventListener("click", () => openForm(null));

  try {
    const cats = await A.api("/api/categories");
    state.categories = cats.expense;
    A.populateMonths(els.month, state.month);
    A.populateYears(els.year, state.year);
    await loadBudgets();
  } catch (err) {
    A.showToast(err.message, "error", 5000);
    if (els.emptyMsg) els.emptyMsg.textContent = "Could not load budgets.";
  }
})();
