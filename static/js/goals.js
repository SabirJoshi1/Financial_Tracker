/* ==========================================================================
   Goals page
   ========================================================================== */

(async function () {
  "use strict";

  const A = window.App;
  const state = { goals: [], editingId: null };

  const els = {
    addBtn: document.getElementById("btn-add-goal"),
    cards: document.getElementById("goal-cards"),
    emptyMsg: document.getElementById("goal-empty-msg"),
  };

  function daysUntil(dateStr) {
    if (!dateStr) return null;
    const target = new Date(dateStr + "T00:00:00");
    const diff = Math.ceil((target - new Date()) / (1000 * 60 * 60 * 24));
    return diff;
  }

  function render() {
    els.cards.innerHTML = "";
    if (state.goals.length === 0) {
      els.cards.innerHTML = `
        <div class="card" style="grid-column: 1 / -1; text-align:center; padding: 40px">
          <div class="empty-state" style="padding:0">
            <div class="empty-icon">◎</div>
            <p>No financial goals yet.</p>
            <p style="margin-top:6px">Create a goal to start saving toward something.</p>
          </div>
        </div>`;
      return;
    }

    state.goals.forEach((g) => {
      const complete = g.percent >= 100;
      const due = daysUntil(g.target_date);
      const card = document.createElement("div");
      card.className = "card goal-card";
      card.innerHTML = `
        <div class="goal-head">
          <div>
            <div class="goal-name">${A.escapeHtml(g.goal_name)}</div>
            ${g.description ? `<div class="goal-desc">${A.escapeHtml(g.description)}</div>` : ""}
          </div>
          <div class="row-actions">
            <button class="icon-btn" data-edit="${g.id}" title="Edit" aria-label="Edit">✎</button>
            <button class="icon-btn" data-del="${g.id}" title="Delete" aria-label="Delete" style="color:var(--danger)">✕</button>
          </div>
        </div>
        <div class="goal-amounts">
          <strong>${A.fmtMoney(g.current_amount)}</strong> / ${A.fmtMoney(g.target_amount)}
          ${complete ? '<span class="goal-complete">✓ Complete</span>' : ""}
        </div>
        <div class="progress-track">
          <div class="progress-fill primary" style="width:${g.percent}%"></div>
        </div>
        <div class="progress-label">
          <span>${g.percent}% funded</span>
          <span>${A.fmtMoney(g.target_amount - g.current_amount)} to go</span>
        </div>
        ${g.target_date
          ? `<div class="goal-due">Target: ${A.escapeHtml(A.fmtDate(g.target_date))} · ${due < 0 ? "overdue" : due === 0 ? "due today" : due + " days left"}</div>`
          : ""}
        <button class="btn btn-secondary btn-sm btn-block" style="margin-top:14px" data-contribute="${g.id}">+ Add Money</button>`;
      card.querySelector("[data-edit]").addEventListener("click", () => openForm(g));
      card.querySelector("[data-del]").addEventListener("click", () => deleteGoal(g));
      card.querySelector("[data-contribute]").addEventListener("click", () => openContribute(g));
      els.cards.appendChild(card);
    });
  }

  async function loadGoals() {
    const data = await A.api("/api/goals");
    state.goals = data.goals;
    render();
  }

  /* ------------------------------------------------------------------------
     Forms
     ------------------------------------------------------------------------ */

  function buildForm(goal) {
    return `
      <form id="goal-form" novalidate>
        <div class="form-row">
          <label class="form-label" for="g-name">Goal Name <span class="req">*</span></label>
          <input type="text" class="form-control" id="g-name" maxlength="255" value="${goal ? A.escapeHtml(goal.goal_name) : ""}" placeholder="e.g. Emergency Fund">
          <div class="form-error" id="err-g-name"></div>
        </div>
        <div class="form-grid">
          <div class="form-row">
            <label class="form-label" for="g-target">Target Amount <span class="req">*</span></label>
            <input type="number" class="form-control" id="g-target" min="0.01" step="0.01" max="999999999999.99"
                   value="${goal ? goal.target_amount : ""}" placeholder="0.00" inputmode="decimal">
            <div class="form-error" id="err-g-target"></div>
          </div>
          <div class="form-row">
            <label class="form-label" for="g-current">Current Saved</label>
            <input type="number" class="form-control" id="g-current" min="0" step="0.01" max="999999999999.99"
                   value="${goal ? goal.current_amount : ""}" placeholder="0.00" inputmode="decimal">
            <div class="form-error" id="err-g-current"></div>
          </div>
        </div>
        <div class="form-row">
          <label class="form-label" for="g-date">Target Date</label>
          <input type="date" class="form-control" id="g-date" value="${goal ? goal.target_date || "" : ""}">
        </div>
        <div class="form-row">
          <label class="form-label" for="g-desc">Description</label>
          <textarea class="form-textarea" id="g-desc" maxlength="2000" placeholder="Optional description...">${goal ? A.escapeHtml(goal.description || "") : ""}</textarea>
        </div>
        <div class="form-actions">
          <button type="button" class="btn btn-secondary" data-modal-close-btn>Cancel</button>
          <button type="submit" class="btn btn-primary">${goal ? "Save Changes" : "Add Goal"}</button>
        </div>
      </form>`;
  }

  function openForm(goal) {
    state.editingId = goal ? goal.id : null;
    A.openModal(goal ? "Edit Goal" : "Add Goal", buildForm(goal));
    document.querySelector("[data-modal-close-btn]").addEventListener("click", A.closeModal);

    document.getElementById("goal-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      document.querySelectorAll(".form-error").forEach((el) => el.classList.remove("show"));
      document.querySelectorAll(".form-control.invalid").forEach((el) => el.classList.remove("invalid"));

      const name = document.getElementById("g-name").value.trim();
      const target = document.getElementById("g-target").value.trim();
      const current = document.getElementById("g-current").value.trim();
      const dateVal = document.getElementById("g-date").value;

      let ok = true;
      const tNum = parseFloat(target);
      const cNum = current === "" ? 0 : parseFloat(current);
      if (!name) {
        const err = document.getElementById("err-g-name");
        err.textContent = "Goal name is required.";
        err.classList.add("show");
        document.getElementById("g-name").classList.add("invalid");
        ok = false;
      }
      if (!target || isNaN(tNum) || tNum <= 0 || !/^\d+(\.\d{1,2})?$/.test(target)) {
        const err = document.getElementById("err-g-target");
        err.textContent = "Enter a positive target amount.";
        err.classList.add("show");
        document.getElementById("g-target").classList.add("invalid");
        ok = false;
      }
      if (current !== "" && (isNaN(cNum) || cNum < 0 || !/^\d+(\.\d{1,2})?$/.test(current))) {
        const err = document.getElementById("err-g-current");
        err.textContent = "Current saved must be a non-negative amount.";
        err.classList.add("show");
        document.getElementById("g-current").classList.add("invalid");
        ok = false;
      }
      if (!ok) return;

      const payload = {
        goal_name: name,
        target_amount: target,
        current_amount: current === "" ? 0 : current,
        target_date: dateVal || null,
        description: document.getElementById("g-desc").value.trim(),
      };

      try {
        if (state.editingId) {
          await A.api(`/api/goals/${state.editingId}`, { method: "PUT", body: payload });
          A.showToast("Goal updated.", "success");
        } else {
          await A.api("/api/goals", { method: "POST", body: payload });
          A.showToast("Goal created.", "success");
        }
        A.closeModal();
        await loadGoals();
      } catch (err) {
        A.showToast(err.message, "error", 5000);
      }
    });
  }

  function openContribute(goal) {
    const remaining = Math.max(goal.target_amount - goal.current_amount, 0);
    A.openModal("Add Money to Goal", `
      <form id="contrib-form" novalidate>
        <p style="color:var(--text-muted); font-size:14px; margin-bottom:14px">
          Add money to <strong style="color:var(--text)">${A.escapeHtml(goal.goal_name)}</strong>.
          ${remaining > 0 ? `${A.fmtMoney(remaining)} remaining to reach your target.` : "Target already reached."}
        </p>
        <div class="form-row">
          <label class="form-label" for="c-amount">Amount <span class="req">*</span></label>
          <input type="number" class="form-control" id="c-amount" min="0.01" step="0.01" max="999999999999.99" placeholder="0.00" inputmode="decimal">
          <div class="form-error" id="err-c-amount"></div>
        </div>
        <div class="form-actions">
          <button type="button" class="btn btn-secondary" data-modal-close-btn>Cancel</button>
          <button type="submit" class="btn btn-primary">Add Money</button>
        </div>
      </form>`);
    document.querySelector("[data-modal-close-btn]").addEventListener("click", A.closeModal);

    document.getElementById("contrib-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const amount = document.getElementById("c-amount").value.trim();
      const amtNum = parseFloat(amount);
      const errEl = document.getElementById("err-c-amount");
      errEl.classList.remove("show");
      document.getElementById("c-amount").classList.remove("invalid");
      if (!amount || isNaN(amtNum) || amtNum <= 0 || !/^\d+(\.\d{1,2})?$/.test(amount)) {
        errEl.textContent = "Enter a positive amount.";
        errEl.classList.add("show");
        document.getElementById("c-amount").classList.add("invalid");
        return;
      }
      try {
        await A.api(`/api/goals/${goal.id}/contribute`, { method: "POST", body: { amount } });
        A.showToast(`Added ${A.fmtMoney(amount)} to ${goal.goal_name}.`, "success");
        A.closeModal();
        await loadGoals();
      } catch (err) {
        A.showToast(err.message, "error", 5000);
      }
    });
  }

  async function deleteGoal(g) {
    const confirmed = await A.confirmAction(`Delete goal "${g.goal_name}"?`, { confirmText: "Delete" });
    if (!confirmed) return;
    try {
      await A.api(`/api/goals/${g.id}`, { method: "DELETE" });
      A.showToast("Goal deleted.", "success");
      await loadGoals();
    } catch (err) {
      A.showToast(err.message, "error", 5000);
    }
  }

  els.addBtn.addEventListener("click", () => openForm(null));

  try {
    await loadGoals();
  } catch (err) {
    A.showToast(err.message, "error", 5000);
    if (els.emptyMsg) els.emptyMsg.textContent = "Could not load goals.";
  }
})();
