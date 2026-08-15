/* ==========================================================================
   Settings page
   ========================================================================== */

(function () {
  "use strict";

  const A = window.App;

  async function loadHealth() {
    const badge = document.getElementById("db-status-badge");
    const details = document.getElementById("db-details");
    try {
      const h = await A.api("/api/health");
      if (h.status === "ok") {
        badge.textContent = "Connected";
        badge.className = "badge badge-income";
        details.innerHTML = `
          <div class="settings-item">
            <span class="settings-key">Status</span>
            <span class="settings-val"><span class="status-dot ok"></span> Connected</span>
          </div>
          <div class="settings-item">
            <span class="settings-key">Host</span>
            <span class="settings-val">${A.escapeHtml(h.host)}</span>
          </div>
          <div class="settings-item">
            <span class="settings-key">Database</span>
            <span class="settings-val">${A.escapeHtml(h.database)}</span>
          </div>`;
      } else {
        badge.textContent = "Unavailable";
        badge.className = "badge badge-expense";
        details.innerHTML = `
          <p style="color:var(--text-muted)">
            Cannot reach the MySQL database. Check your credentials in <code>.env</code>
            and make sure the database is running. See the README for setup steps.
          </p>`;
      }
    } catch (err) {
      badge.textContent = "Unavailable";
      badge.className = "badge badge-expense";
      details.innerHTML = `<p style="color:var(--text-muted)">${A.escapeHtml(err.message)}</p>`;
    }
  }

  const expType = document.getElementById("exp-type");
  const expMonth = document.getElementById("exp-month");

  A.populateMonths(expMonth, new Date().getMonth() + 1);

  document.getElementById("btn-export").addEventListener("click", async () => {
    const params = new URLSearchParams();
    if (expType.value) params.set("type", expType.value);
    params.set("month", expMonth.value);
    const now = new Date();
    params.set("year", String(now.getFullYear()));
    try {
      const res = await fetch("/api/export/transactions.csv?" + params.toString());
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error((data && data.error) || "Export failed");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `transactions_${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      A.showToast("CSV exported.", "success");
    } catch (err) {
      A.showToast(err.message, "error", 5000);
    }
  });

  loadHealth();
})();
