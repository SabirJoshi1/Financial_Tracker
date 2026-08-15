/* ==========================================================================
   Dashboard page
   ========================================================================== */

(async function () {
  "use strict";

  const A = window.App;

  function renderStat(id, text, subText, subClass) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
    if (subText) {
      const sub = document.getElementById(id + "-sub");
      if (sub) {
        sub.textContent = subText;
        if (subClass) sub.className = "stat-sub " + subClass;
      }
    }
  }

  function renderRecent(rows) {
    const tbody = document.getElementById("recent-tbody");
    const empty = document.getElementById("recent-empty");
    if (!tbody) return;
    tbody.innerHTML = "";
    if (!rows || rows.length === 0) {
      if (empty) empty.hidden = false;
      return;
    }
    if (empty) empty.hidden = true;
    rows.forEach((t) => {
      const tr = document.createElement("tr");
      const isIncome = t.type === "income";
      tr.innerHTML = `
        <td>${A.escapeHtml(A.fmtDate(t.transaction_date))}</td>
        <td>
          <div class="cell-desc">${A.escapeHtml(t.description)}</div>
          ${t.notes ? `<div class="cell-sub">${A.escapeHtml(t.notes)}</div>` : ""}
        </td>
        <td><span class="badge ${isIncome ? "badge-income" : "badge-expense"}">${A.escapeHtml(t.category)}</span></td>
        <td><span class="badge badge-muted">${A.escapeHtml(t.payment_method)}</span></td>
        <td style="text-align:right" class="amount-${isIncome ? "income" : "expense neg"}">
          ${isIncome ? "+" : "−"}${A.fmtMoney(t.amount)}
        </td>`;
      tbody.appendChild(tr);
    });
  }

  function emptyDoughnut(canvasId, message) {
    const chart = A.makeChart(canvasId, {
      type: "doughnut",
      data: { labels: ["No data"], datasets: [{ data: [1], backgroundColor: ["#e2e8f0"] }] },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { enabled: false },
        },
      },
    });
    return chart;
  }

  try {
    const data = await A.api("/api/dashboard");
    const now = new Date();
    const monthLabel = A.MONTH_SHORT[now.getMonth()];

    renderStat("stat-balance", A.fmtMoney(data.current_balance));
    renderStat("stat-income", A.fmtMoney(data.month.income), `${monthLabel} income`);
    renderStat("stat-expense", A.fmtMoney(data.month.expense), `${monthLabel} expenses`);
    renderStat(
      "stat-savings",
      A.fmtMoney(data.month.savings),
      data.month.savings >= 0 ? "Spent less than earned" : "Spent more than earned",
      data.month.savings >= 0 ? "up" : "down"
    );
    renderStat("stat-rate", data.month.savings_rate.toFixed(1) + "%");
    renderStat(
      "stat-budget",
      A.fmtMoney(data.month.budget_remaining),
      data.month.budget_remaining >= 0
        ? `of ${A.fmtMoney(data.month.budget_total)} budget left`
        : "Budget exceeded",
      data.month.budget_remaining >= 0 ? "up" : "down"
    );

    const doughnutMonth = document.getElementById("doughnut-month");
    if (doughnutMonth) doughnutMonth.textContent = monthLabel + " " + new Date().getFullYear();

    const cat = data.spending_by_category;
    const catKeys = Object.keys(cat);

    if (catKeys.length === 0) {
      emptyDoughnut("chart-doughnut");
    } else {
      A.makeChart("chart-doughnut", {
        type: "doughnut",
        data: {
          labels: catKeys,
          datasets: [
            {
              data: catKeys.map((k) => cat[k]),
              backgroundColor: A.CHART_COLORS,
              borderWidth: 2,
              borderColor: "#ffffff",
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: "right", labels: { boxWidth: 12, padding: 12, usePointStyle: true } },
            tooltip: {
              callbacks: {
                label: (ctx) => ` ${ctx.label}: ${A.fmtMoney(ctx.parsed)}`,
              },
            },
          },
        },
      });
    }

    A.makeChart("chart-bar", {
      type: "bar",
      data: {
        labels: data.trend.labels.map((l) => {
          const [y, m] = l.split("-");
          return A.MONTH_SHORT[Number(m) - 1] + " " + y.slice(2);
        }),
        datasets: [
          {
            label: "Income",
            data: data.trend.income,
            backgroundColor: "#10b981",
            borderRadius: 6,
            maxBarThickness: 34,
          },
          {
            label: "Expenses",
            data: data.trend.expense,
            backgroundColor: "#ef4444",
            borderRadius: 6,
            maxBarThickness: 34,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: { beginAtZero: true, ticks: { callback: (v) => A.fmtMoney(v) }, grid: { color: "#eef1f6" } },
          x: { grid: { display: false } },
        },
        plugins: {
          legend: { position: "top", align: "end", labels: { boxWidth: 12, usePointStyle: true } },
          tooltip: { callbacks: { label: (ctx) => ` ${ctx.dataset.label}: ${A.fmtMoney(ctx.parsed.y)}` } },
        },
      },
    });

    A.makeChart("chart-line", {
      type: "line",
      data: {
        labels: data.trend.labels.map((l) => {
          const [y, m] = l.split("-");
          return A.MONTH_SHORT[Number(m) - 1] + " " + y.slice(2);
        }),
        datasets: [
          {
            label: "Spending",
            data: data.trend.expense,
            borderColor: "#4f46e5",
            backgroundColor: "rgba(79, 70, 229, .08)",
            fill: true,
            tension: 0.35,
            pointRadius: 4,
            pointBackgroundColor: "#4f46e5",
          },
        ],
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

    renderRecent(data.recent_transactions);
  } catch (err) {
    A.showToast(err.message, "error", 5000);
  }
})();
