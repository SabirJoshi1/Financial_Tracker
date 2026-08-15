/* ==========================================================================
   Reports page
   ========================================================================== */

(async function () {
  "use strict";

  const A = window.App;
  const today = new Date();

  const state = {
    month: today.getMonth() + 1,
    year: today.getFullYear(),
  };

  const els = {
    month: document.getElementById("rep-month"),
    year: document.getElementById("rep-year"),
    label: document.getElementById("rep-label"),
    income: document.getElementById("rep-income"),
    expense: document.getElementById("rep-expense"),
    net: document.getElementById("rep-net"),
    rate: document.getElementById("rep-rate"),
    avg: document.getElementById("rep-avg"),
    highest: document.getElementById("rep-highest"),
    highestSub: document.getElementById("rep-highest-sub"),
    dailyLabel: document.getElementById("rep-daily-label"),
    budgetTbody: document.getElementById("rep-budget-tbody"),
    budgetEmpty: document.getElementById("rep-budget-empty"),
    budgetChips: document.getElementById("rep-budget-chips"),
  };

  function renderBudgetChips(totals) {
    els.budgetChips.innerHTML = "";
    const chips = [
      { label: "Budget", value: A.fmtMoney(totals.budget), cls: "" },
      { label: "Spent", value: A.fmtMoney(totals.spent), cls: "expense" },
      { label: "Remaining", value: A.fmtMoney(totals.remaining), cls: totals.remaining < 0 ? "expense" : "income" },
    ];
    chips.forEach((c) => {
      const chip = document.createElement("span");
      chip.className = "chip";
      chip.innerHTML = `<span class="chip-label">${c.label}</span><span class="chip-value ${c.cls}">${c.value}</span>`;
      els.budgetChips.appendChild(chip);
    });
  }

  function renderBudgets(budgets) {
    els.budgetTbody.innerHTML = "";
    if (budgets.length === 0) {
      els.budgetEmpty.hidden = false;
      return;
    }
    els.budgetEmpty.hidden = true;
    budgets.forEach((b) => {
      const tr = document.createElement("tr");
      const statusMap = {
        ok: { cls: "ok", text: "On track" },
        warn: { cls: "warn", text: "Warning" },
        danger: { cls: "danger", text: "Almost over" },
        exceeded: { cls: "exceeded", text: "Exceeded" },
      };
      const st = statusMap[b.status] || statusMap.ok;
      tr.innerHTML = `
        <td><span class="badge badge-muted">${A.escapeHtml(b.category)}</span></td>
        <td style="text-align:right">${A.fmtMoney(b.budget_amount)}</td>
        <td style="text-align:right">${A.fmtMoney(b.spent)}</td>
        <td style="text-align:right; color:${b.remaining < 0 ? "var(--danger)" : "var(--text)"}">${A.fmtMoney(b.remaining)}</td>
        <td>
          <div style="display:flex; align-items:center; gap:8px">
            <div class="progress-track" style="flex:1"><div class="progress-fill ${b.status}" style="width:${Math.min(b.percent, 100)}%"></div></div>
            <span style="font-size:12.5px; font-weight:600; min-width:90px">${b.percent}% · ${st.text}</span>
          </div>
        </td>`;
      els.budgetTbody.appendChild(tr);
    });
  }

  async function loadReport() {
    const data = await A.api(`/api/reports?month=${state.month}&year=${state.year}`);
    const t = data.totals;

    els.label.textContent = data.month_label;
    els.income.textContent = A.fmtMoney(t.income);
    els.expense.textContent = A.fmtMoney(t.expense);
    els.net.textContent = A.fmtMoney(t.net);
    els.net.style.color = t.net >= 0 ? "var(--text)" : "var(--danger)";
    els.rate.textContent = t.savings_rate.toFixed(1) + "%";
    els.avg.textContent = A.fmtMoney(t.avg_daily_spending);

    if (data.highest_category) {
      els.highest.textContent = data.highest_category.category;
      els.highestSub.textContent = `${A.fmtMoney(data.highest_category.amount)} across ${data.highest_category.count} transaction${data.highest_category.count === 1 ? "" : "s"}`;
    } else {
      els.highest.textContent = "—";
      els.highestSub.textContent = "No expenses this month";
    }

    els.dailyLabel.textContent = `${data.daily_spending.length} spending day${data.daily_spending.length === 1 ? "" : "s"}`;

    const daily = data.daily_spending;
    const dailyLabels = daily.map((d) => A.fmtDate(d.date));
    const dailyData = daily.map((d) => d.amount);
    if (dailyLabels.length === 0) {
      A.makeChart("chart-daily", {
        type: "bar",
        data: { labels: ["No data"], datasets: [{ label: "Spending", data: [0], backgroundColor: "#e2e8f0" }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } },
      });
    } else {
      A.makeChart("chart-daily", {
        type: "bar",
        data: {
          labels: dailyLabels,
          datasets: [{ label: "Spending", data: dailyData, backgroundColor: "#4f46e5", borderRadius: 4, maxBarThickness: 28 }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            y: { beginAtZero: true, ticks: { callback: (v) => A.fmtMoney(v) }, grid: { color: "#eef1f6" } },
            x: { grid: { display: false } },
          },
          plugins: {
            legend: { display: false },
            tooltip: { callbacks: { label: (ctx) => ` Spending: ${A.fmtMoney(ctx.parsed.y)}` } },
          },
        },
      });
    }

    renderBudgetChips(data.budget_totals);
    renderBudgets(data.budgets);
  }

  els.month.addEventListener("change", () => { state.month = Number(els.month.value); loadReport().catch((err) => A.showToast(err.message, "error", 5000)); });
  els.year.addEventListener("change", () => { state.year = Number(els.year.value); loadReport().catch((err) => A.showToast(err.message, "error", 5000)); });

  try {
    A.populateMonths(els.month, state.month);
    A.populateYears(els.year, state.year);
    await loadReport();
  } catch (err) {
    A.showToast(err.message, "error", 5000);
  }
})();
