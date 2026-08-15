/* ==========================================================================
   Transactions page - list, search, filter, sort, CRUD
   ========================================================================== */

(async function () {
  "use strict";

  const A = window.App;
  const LIMIT = 50;

  const state = {
    page: 0,
    filters: { search: "", type: "", category: "", month: "", year: "", sort: "newest" },
    categories: { income: [], expense: [] },
    paymentMethods: [],
    editingId: null,
  };

  const els = {
    search: document.getElementById("f-search"),
    type: document.getElementById("f-type"),
    category: document.getElementById("f-category"),
    month: document.getElementById("f-month"),
    year: document.getElementById("f-year"),
    sort: document.getElementById("f-sort"),
    addBtn: document.getElementById("btn-add-tx"),
    tbody: document.getElementById("tx-tbody"),
    empty: document.getElementById("tx-empty"),
    prev: document.getElementById("btn-prev"),
    next: document.getElementById("btn-next"),
    pageInfo: document.getElementById("page-info"),
    chipIncome: document.getElementById("chip-income"),
    chipExpense: document.getElementById("chip-expense"),
    chipNet: document.getElementById("chip-net"),
  };

  /* ------------------------------------------------------------------------
     Form builder
     ------------------------------------------------------------------------ */

  function buildForm(tx) {
    const type = tx ? tx.type : state.filters.type || "expense";
    const cats = state.categories[type];
    const today = A.todayISO();
    const catOptions = cats
      .map((c) => `<option value="${A.escapeHtml(c)}" ${tx && tx.category === c ? "selected" : ""}>${A.escapeHtml(c)}</option>`)
      .join("");
    const payOptions = state.paymentMethods
      .map((p) => `<option value="${A.escapeHtml(p)}" ${tx && tx.payment_method === p ? "selected" : ""}>${A.escapeHtml(p)}</option>`)
      .join("");

    return `
      <form id="tx-form" novalidate>
        <div class="form-row">
          <label class="form-label">Transaction Type</label>
          <div class="segmented">
            <label><input type="radio" name="tx-type" value="income" ${type === "income" ? "checked" : ""}><span>Income</span></label>
            <label><input type="radio" name="tx-type" value="expense" ${type === "expense" ? "checked" : ""}><span>Expense</span></label>
          </div>
        </div>
        <div class="form-row">
          <label class="form-label" for="tx-desc">Description <span class="req">*</span></label>
          <input type="text" class="form-control" id="tx-desc" maxlength="255" value="${tx ? A.escapeHtml(tx.description) : ""}" placeholder="e.g. Weekly grocery shop">
          <div class="form-error" id="err-desc"></div>
        </div>
        <div class="form-grid">
          <div class="form-row">
            <label class="form-label" for="tx-amount">Amount <span class="req">*</span></label>
            <input type="number" class="form-control" id="tx-amount" min="0.01" max="999999999999.99" step="0.01"
                   value="${tx ? tx.amount : ""}" placeholder="0.00" inputmode="decimal">
            <div class="form-error" id="err-amount"></div>
          </div>
          <div class="form-row">
            <label class="form-label" for="tx-category">Category <span class="req">*</span></label>
            <select class="form-select" id="tx-category">${catOptions}</select>
          </div>
        </div>
        <div class="form-grid">
          <div class="form-row">
            <label class="form-label" for="tx-date">Date <span class="req">*</span></label>
            <input type="date" class="form-control" id="tx-date" value="${tx ? tx.transaction_date : today}">
            <div class="form-error" id="err-date"></div>
          </div>
          <div class="form-row">
            <label class="form-label" for="tx-pay">Payment Method</label>
            <select class="form-select" id="tx-pay">${payOptions}</select>
          </div>
        </div>
        <div class="form-row">
          <label class="form-label" for="tx-notes">Notes</label>
          <textarea class="form-textarea" id="tx-notes" maxlength="2000" placeholder="Optional notes...">${tx ? A.escapeHtml(tx.notes || "") : ""}</textarea>
        </div>
        <div class="form-actions">
          <button type="button" class="btn btn-secondary" data-modal-close-btn>Cancel</button>
          <button type="submit" class="btn btn-primary">${tx ? "Save Changes" : "Add Transaction"}</button>
        </div>
      </form>`;
  }

  function showError(fieldId, message) {
    const input = document.getElementById(fieldId);
    const errEl = document.getElementById("err-" + fieldId.replace("tx-", ""));
    if (input) input.classList.add("invalid");
    if (errEl) {
      errEl.textContent = message;
      errEl.classList.add("show");
    }
  }

  function clearErrors() {
    document.querySelectorAll(".form-error").forEach((e) => e.classList.remove("show"));
    document.querySelectorAll(".form-control.invalid").forEach((e) => e.classList.remove("invalid"));
  }

  function validateForm() {
    clearErrors();
    let ok = true;
    const type = document.querySelector("input[name='tx-type']:checked").value;
    const desc = document.getElementById("tx-desc").value.trim();
    const amount = parseFloat(document.getElementById("tx-amount").value);
    const dateVal = document.getElementById("tx-date").value;

    if (!desc) { showError("tx-desc", "Description is required."); ok = false; }
    if (!amount || isNaN(amount) || amount <= 0 || amount > 999999999999.99) {
      showError("tx-amount", "Enter a positive amount (up to 2 decimal places).");
      ok = false;
    } else if (!/^\d+(\.\d{1,2})?$/.test(String(document.getElementById("tx-amount").value).trim())) {
      showError("tx-amount", "Amount can only have up to 2 decimal places.");
      ok = false;
    }
    if (!dateVal) { showError("tx-date", "Date is required."); ok = false; }
    return { ok, type };
  }

  function attachFormEvents(type) {
    const form = document.getElementById("tx-form");
    const catSel = document.getElementById("tx-category");

    document.querySelectorAll("input[name='tx-type']").forEach((radio) => {
      radio.addEventListener("change", () => {
        const t = document.querySelector("input[name='tx-type']:checked").value;
        A.fillCategories(catSel, state.categories[t], catSel.value);
      });
    });

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const v = validateForm();
      if (!v.ok) return;

      const payload = {
        type: v.type,
        description: document.getElementById("tx-desc").value.trim(),
        amount: document.getElementById("tx-amount").value.trim(),
        category: document.getElementById("tx-category").value,
        transaction_date: document.getElementById("tx-date").value,
        payment_method: document.getElementById("tx-pay").value,
        notes: document.getElementById("tx-notes").value.trim(),
      };

      try {
        if (state.editingId) {
          await A.api(`/api/transactions/${state.editingId}`, { method: "PUT", body: payload });
          A.showToast("Transaction updated.", "success");
        } else {
          await A.api("/api/transactions", { method: "POST", body: payload });
          A.showToast("Transaction added.", "success");
        }
        A.closeModal();
        await loadTransactions();
      } catch (err) {
        A.showToast(err.message, "error", 5000);
      }
    });
  }

  function openForm(tx) {
    state.editingId = tx ? tx.id : null;
    A.openModal(tx ? "Edit Transaction" : "Add Transaction", buildForm(tx), () => {});
    const closeBtn = document.querySelector("[data-modal-close-btn]");
    if (closeBtn) closeBtn.addEventListener("click", A.closeModal);
    attachFormEvents(tx ? tx.type : state.filters.type || "expense");
  }

  /* ------------------------------------------------------------------------
     Loading / rendering
     ------------------------------------------------------------------------ */

  async function loadTransactions() {
    const params = new URLSearchParams({ ...state.filters, limit: LIMIT, offset: state.page * LIMIT });
    const data = await A.api("/api/transactions?" + params.toString());

    els.chipIncome.textContent = A.fmtMoney(data.filters.total_income);
    els.chipExpense.textContent = A.fmtMoney(data.filters.total_expense);
    const net = data.filters.net;
    els.chipNet.textContent = A.fmtMoney(net);
    els.chipNet.style.color = net >= 0 ? "var(--success)" : "var(--danger)";

    els.tbody.innerHTML = "";
    if (data.transactions.length === 0) {
      els.empty.hidden = false;
    } else {
      els.empty.hidden = true;
      data.transactions.forEach((t) => renderRow(t));
    }

    const pages = Math.max(1, Math.ceil(data.total / LIMIT));
    const start = data.total === 0 ? 0 : state.page * LIMIT + 1;
    const end = Math.min(data.total, (state.page + 1) * LIMIT);
    els.pageInfo.textContent = `${start}–${end} of ${data.total}`;
    els.prev.disabled = state.page === 0;
    els.next.disabled = state.page + 1 >= pages;
  }

  function renderRow(t) {
    const tr = document.createElement("tr");
    const isIncome = t.type === "income";
    tr.innerHTML = `
      <td>${A.escapeHtml(A.fmtDate(t.transaction_date))}</td>
      <td>
        <div class="cell-desc">${A.escapeHtml(t.description)}</div>
        ${t.notes ? `<div class="cell-sub">${A.escapeHtml(t.notes)}</div>` : ""}
      </td>
      <td><span class="badge ${isIncome ? "badge-income" : "badge-expense"}">${isIncome ? "Income" : "Expense"}</span></td>
      <td><span class="badge badge-muted">${A.escapeHtml(t.category)}</span></td>
      <td><span class="badge badge-muted">${A.escapeHtml(t.payment_method)}</span></td>
      <td style="text-align:right" class="amount-${isIncome ? "income" : "expense neg"}">
        ${isIncome ? "+" : "−"}${A.fmtMoney(t.amount)}
      </td>
      <td>
        <div class="row-actions" style="justify-content:flex-end">
          <button class="icon-btn" data-edit="${t.id}" title="Edit" aria-label="Edit">✎</button>
          <button class="icon-btn" data-del="${t.id}" title="Delete" aria-label="Delete" style="color:var(--danger)">✕</button>
        </div>
      </td>`;
    tr.querySelector("[data-edit]").addEventListener("click", () => openForm(t));
    tr.querySelector("[data-del]").addEventListener("click", () => deleteTransaction(t));
    els.tbody.appendChild(tr);
  }

  async function deleteTransaction(t) {
    const confirmed = await A.confirmAction(
      `Delete "${t.description}" (${A.fmtMoney(t.amount)})? This cannot be undone.`,
      { confirmText: "Delete" }
    );
    if (!confirmed) return;
    try {
      await A.api(`/api/transactions/${t.id}`, { method: "DELETE" });
      A.showToast("Transaction deleted.", "success");
      await loadTransactions();
    } catch (err) {
      A.showToast(err.message, "error", 5000);
    }
  }

  /* ------------------------------------------------------------------------
     Filters
     ------------------------------------------------------------------------ */

  function applyFilters() {
    state.page = 0;
    loadTransactions().catch((err) => A.showToast(err.message, "error", 5000));
  }

  els.search.addEventListener("input", A.debounce(() => {
    state.filters.search = els.search.value.trim();
    state.page = 0;
    loadTransactions().catch((err) => A.showToast(err.message, "error", 5000));
  }, 300));

  els.type.addEventListener("change", () => {
    state.filters.type = els.type.value;
    applyFilters();
  });
  els.category.addEventListener("change", () => {
    state.filters.category = els.category.value;
    applyFilters();
  });
  els.month.addEventListener("change", () => {
    state.filters.month = els.month.value;
    applyFilters();
  });
  els.year.addEventListener("change", () => {
    state.filters.year = els.year.value;
    applyFilters();
  });
  els.sort.addEventListener("change", () => {
    state.filters.sort = els.sort.value;
    state.page = 0;
    loadTransactions().catch((err) => A.showToast(err.message, "error", 5000));
  });
  els.prev.addEventListener("click", () => {
    if (state.page > 0) { state.page--; loadTransactions().catch((err) => A.showToast(err.message, "error", 5000)); }
  });
  els.next.addEventListener("click", () => {
    state.page++;
    loadTransactions().catch((err) => A.showToast(err.message, "error", 5000));
  });
  els.addBtn.addEventListener("click", () => openForm(null));

  /* ------------------------------------------------------------------------
     Init
     ------------------------------------------------------------------------ */

  try {
    const cats = await A.api("/api/categories");
    state.categories = cats;
    state.paymentMethods = cats.payment_methods;

    const today = new Date();
    A.populateMonths(els.month, today.getMonth() + 1);
    A.populateYears(els.year, today.getFullYear());

    const allCat = ["", ...cats.expense, ...cats.income];
    A.fillCategories(els.category, allCat);

    await loadTransactions();
  } catch (err) {
    A.showToast(err.message, "error", 5000);
  }
})();
