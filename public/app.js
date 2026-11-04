// This browser-only file renders reports returned by the separate Python API.
const form = document.querySelector("#ticker-form");
const input = document.querySelector("#ticker");
const button = document.querySelector("#analyze-button");
const statusMessage = document.querySelector("#status-message");
const results = document.querySelector("#results");
const reportsByTicker = new Map();
const chartColors = ["#b7f36b", "#69cbb1", "#f0bf67", "#e99163", "#a695ed"];
let selectedReport = null;

const formatRatio = (value, unit) => {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return "Not available";
  const numeric = Number(value);
  if (unit === "%") return `${(numeric * 100).toFixed(1)}%`;
  if (unit === "percentage points") return `${(numeric * 100).toFixed(1)} pp`;
  if (unit === "flag") return numeric ? "Cash outflow" : "No outflow";
  return `${numeric.toFixed(2)}${unit === "x" ? "x" : ""}`;
};

const checkLabel = (check) => {
  if (check.points === null) return "Not enough data";
  return ["Within threshold", "Watch", "Red flag"][check.points];
};

function renderEarningsQuality(report) {
  const grid = document.querySelector("#earnings-grid");
  grid.replaceChildren();
  report.earnings_quality.checks.forEach((check) => {
    const card = document.createElement("article");
    const points = check.points === null ? "na" : String(check.points);
    card.className = "signal-card";
    card.dataset.points = points;
    card.innerHTML = `
      <div class="signal-top">
        <span class="signal-name">${check.name}</span>
        <span class="signal-points">${check.points === null ? "—" : `${check.points}/2`}</span>
      </div>
      <div class="signal-value">${formatRatio(check.value, check.unit)}</div>
      <span class="signal-status">${checkLabel(check)}</span>`;
    grid.append(card);
  });
}

function renderCreditRatios(report) {
  const grid = document.querySelector("#credit-grid");
  grid.replaceChildren();
  report.credit_ratios.forEach((ratio, index) => {
    const card = document.createElement("article");
    card.className = "credit-card";
    card.style.animationDelay = `${Math.min(index * 35, 245)}ms`;
    const value = formatRatio(ratio.value, ratio.unit);
    card.innerHTML = `
      <div class="credit-meta"><strong>${ratio.name}</strong><span>${ratio.formula}</span></div>
      <span class="credit-value${value === "Not available" ? " unavailable" : ""}">${value}</span>`;
    grid.append(card);
  });
}

function renderCompanyDetails(report) {
  selectedReport = report;
  document.querySelector("#detail-heading-title").textContent = `Details · ${report.ticker}`;
  document.querySelector("#detail-period-label").textContent =
    `Latest annual period: ${report.latest_period} · ${report.available_periods.length} period(s) available`;
  document.querySelector("#briefing-context").textContent = `Using ${report.ticker} ratios`;
  const ratingCard = document.querySelector(".rating-card");
  ratingCard.dataset.rating = report.earnings_quality.rating;
  document.querySelector("#rating-value").textContent = report.earnings_quality.rating;
  document.querySelector("#score-value").textContent =
    `${Math.round(report.earnings_quality.score * 100)}% earnings-quality risk`;
  document.querySelector("#disclaimer").textContent = report.disclaimer;
  renderEarningsQuality(report);
  renderCreditRatios(report);
  renderHistory(report);
}

function renderHistory(report) {
  const chart = document.querySelector("#history-chart");
  if (!window.Plotly) {
    chart.textContent = "The Plotly chart library could not be loaded. Check your internet connection.";
    return;
  }
  const trace = {
    x: report.history.map((period) => String(period.period)),
    y: report.history.map((period) => period.score === null ? null : Number(period.score) * 100),
    type: "scatter",
    mode: "lines+markers",
    line: { color: chartColors[0], width: 3, shape: "spline" },
    marker: { color: chartColors[0], size: 8 },
    hovertemplate: "%{x}<br>Risk score: %{y:.0f}%<extra></extra>",
  };
  window.Plotly.react(chart, [trace], chartLayout("Risk score (%)", 100), chartConfig());
}

function chartLayout(yTitle, maximum = undefined) {
  return {
    paper_bgcolor: "transparent",
    plot_bgcolor: "transparent",
    font: { family: "DM Sans, sans-serif", color: "#a9b5aa", size: 11 },
    margin: { t: 15, r: 18, b: 45, l: 54 },
    xaxis: { gridcolor: "rgba(224,239,226,.06)", linecolor: "rgba(224,239,226,.13)" },
    yaxis: {
      title: { text: yTitle, font: { size: 10 } },
      gridcolor: "rgba(224,239,226,.1)",
      zerolinecolor: "rgba(224,239,226,.15)",
      rangemode: "tozero",
      ...(maximum === undefined ? {} : { range: [0, maximum] }),
    },
    showlegend: false,
    hoverlabel: { bgcolor: "#1c251f", bordercolor: "#3a493c", font: { color: "#edf2eb" } },
    autosize: true,
  };
}

function chartConfig() {
  return { responsive: true, displayModeBar: false };
}

function renderComparisonChart(reports) {
  const chart = document.querySelector("#risk-chart");
  if (!window.Plotly) {
    chart.textContent = "The Plotly chart library could not be loaded. Check your internet connection.";
    return;
  }
  const trace = {
    x: reports.map((report) => report.ticker),
    y: reports.map((report) => Number(report.earnings_quality.score) * 100),
    type: "bar",
    marker: {
      color: reports.map((report, index) =>
        report.earnings_quality.rating === "Severe" || report.earnings_quality.rating === "High"
          ? "#e99163"
          : report.earnings_quality.rating === "Moderate" ? "#f0bf67" : chartColors[index % chartColors.length]),
      line: { width: 0 },
      cornerradius: 5,
    },
    text: reports.map((report) => report.earnings_quality.rating),
    textposition: "outside",
    cliponaxis: false,
    hovertemplate: "%{x}<br>Risk score: %{y:.0f}%<br>%{text}<extra></extra>",
  };
  window.Plotly.react(chart, [trace], {
    ...chartLayout("Earnings-quality risk (%)", 100),
    margin: { t: 24, r: 24, b: 48, l: 58 },
  }, chartConfig());
}

// Plot annual scores on the same year axis; null periods remain gaps rather than false zeroes.
function renderComparisonTrendChart(reports) {
  const chart = document.querySelector("#comparison-trend-chart");
  if (!window.Plotly) {
    chart.textContent = "The Plotly chart library could not be loaded. Check your internet connection.";
    return;
  }
  const years = [...new Set(reports.flatMap((report) =>
    report.history.map((period) => period.period)))].sort((first, second) => first - second);
  const traces = reports.map((report, index) => {
    const scoresByYear = new Map(report.history.map((period) => [period.period, period.score]));
    return {
      x: years.map(String),
      y: years.map((year) => {
        const score = scoresByYear.get(year);
        return score === null || score === undefined ? null : Number(score) * 100;
      }),
      name: report.ticker,
      type: "scatter",
      mode: "lines+markers",
      connectgaps: false,
      line: { color: chartColors[index % chartColors.length], width: 2.5, shape: "spline" },
      marker: { color: chartColors[index % chartColors.length], size: 7 },
      hovertemplate: `${report.ticker}<br>%{x}<br>Risk score: %{y:.0f}%<extra></extra>`,
    };
  });
  window.Plotly.react(chart, traces, {
    ...chartLayout("Earnings-quality risk (%)", 100),
    showlegend: true,
    legend: { orientation: "h", y: 1.16, x: 0, font: { size: 10 } },
    margin: { t: 42, r: 24, b: 48, l: 58 },
  }, chartConfig());
}

function renderRatioChart(reports, ratioName) {
  const chart = document.querySelector("#ratio-chart");
  if (!window.Plotly) return;
  const ratioByTicker = reports.map((report) =>
    report.credit_ratios.find((ratio) => ratio.name === ratioName));
  const unit = ratioByTicker.find((ratio) => ratio)?.unit || "";
  const trace = {
    x: reports.map((report) => report.ticker),
    y: ratioByTicker.map((ratio) => ratio && ratio.value !== null ? Number(ratio.value) : null),
    type: "bar",
    marker: {
      color: reports.map((_, index) => chartColors[index % chartColors.length]),
      cornerradius: 5,
    },
    hovertemplate: `%{x}<br>${ratioName}: %{y:.2f}${unit === "x" ? "x" : unit === "%" ? "%" : ""}<extra></extra>`,
  };
  window.Plotly.react(chart, [trace], chartLayout(`${ratioName}${unit ? ` (${unit})` : ""}`), chartConfig());
}

function renderComparisonTable(reports) {
  const head = document.querySelector("#comparison-head");
  const body = document.querySelector("#comparison-body");
  const columnRatios = ["Current ratio", "Debt-to-equity", "Net profit margin"];
  head.replaceChildren();
  body.replaceChildren();
  const headerRow = document.createElement("tr");
  ["Company", "Latest year", "Risk rating", "Risk score", ...columnRatios].forEach((label) => {
    const cell = document.createElement("th");
    cell.textContent = label;
    headerRow.append(cell);
  });
  head.append(headerRow);
  reports.forEach((report) => {
    const row = document.createElement("tr");
    const values = [
      report.ticker,
      String(report.latest_period),
      report.earnings_quality.rating,
      `${Math.round(report.earnings_quality.score * 100)}%`,
      ...columnRatios.map((name) => {
        const ratio = report.credit_ratios.find((item) => item.name === name);
        return ratio ? formatRatio(ratio.value, ratio.unit) : "Not available";
      }),
    ];
    values.forEach((value, index) => {
      const cell = document.createElement(index === 0 ? "th" : "td");
      cell.textContent = value;
      row.append(cell);
    });
    body.append(row);
  });
}

function renderComparison(reports, failures) {
  reportsByTicker.clear();
  reports.forEach((report) => reportsByTicker.set(report.ticker, report));

  const heading = document.querySelector("#company-heading");
  heading.textContent = `${reports.length} ${reports.length === 1 ? "company" : "companies"} assessed`;
  document.querySelector("#period-label").textContent =
    "Most recent annual statements available from Yahoo Finance";
  document.querySelector(".rating-card").removeAttribute("data-rating");
  document.querySelector("#rating-value").textContent = String(reports.length);
  document.querySelector("#score-value").textContent = "companies assessed";

  const failureMessage = document.querySelector("#failure-message");
  failureMessage.hidden = failures.length === 0;
  failureMessage.textContent = failures.length
    ? `Some companies could not be assessed: ${failures.map((item) => `${item.ticker} — ${item.error}`).join(" · ")}`
    : "";

  renderComparisonChart(reports);
  renderComparisonTrendChart(reports);
  renderComparisonTable(reports);

  const selector = document.querySelector("#ratio-selector");
  selector.replaceChildren();
  const ratiosByName = new Map();
  reports.forEach((report) => report.credit_ratios.forEach((ratio) => {
    if (ratio.value !== null && !ratiosByName.has(ratio.name)) ratiosByName.set(ratio.name, ratio);
  }));
  const availableRatios = [...ratiosByName.values()];
  availableRatios.forEach((ratio) => {
    const option = document.createElement("option");
    option.value = ratio.name;
    option.textContent = ratio.name;
    selector.append(option);
  });
  selector.onchange = () => renderRatioChart(reports, selector.value);
  renderRatioChart(reports, selector.value);

  const companySelector = document.querySelector("#company-selector");
  companySelector.replaceChildren();
  reports.forEach((report) => {
    const option = document.createElement("option");
    option.value = report.ticker;
    option.textContent = report.ticker;
    companySelector.append(option);
  });
  companySelector.onchange = () => {
    const selected = reportsByTicker.get(companySelector.value);
    if (selected) renderCompanyDetails(selected);
  };
  renderCompanyDetails(reports[0]);
  results.hidden = false;
  results.scrollIntoView({ behavior: "smooth", block: "start" });
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const tickers = [...new Set(input.value.split(",").map((ticker) => ticker.trim().toUpperCase()).filter(Boolean))];
  if (!tickers.length) return;
  if (tickers.length > 5) {
    statusMessage.textContent = "Compare up to 5 companies at a time.";
    statusMessage.classList.add("visible");
    return;
  }
  if (window.location.protocol === "file:") {
    statusMessage.textContent = "Open the dashboard through the local server: run `python app.py`, then visit http://127.0.0.1:5000. Opening index.html directly cannot reach the Python API.";
    statusMessage.classList.add("visible");
    return;
  }

  button.disabled = true;
  button.querySelector("span:first-child").textContent = "Comparing…";
  statusMessage.classList.remove("visible");
  statusMessage.textContent = "";
  try {
    const response = await fetch("/api/assessment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tickers }),
    });
    const responseText = await response.text();
    let payload;
    try {
      payload = JSON.parse(responseText);
    } catch {
      throw new Error(
        response.status === 404
          ? "The assessment API was not found. Run `python app.py` for local use, or check that the project is deployed on Vercel."
          : "The assessment API returned a non-JSON response. Open the dashboard through `python app.py` locally, or check the Vercel function logs."
      );
    }
    if (!response.ok) throw new Error(payload.error || "The assessment could not be completed.");
    if (!Array.isArray(payload.assessments) || payload.assessments.length === 0) {
      throw new Error("The assessment API returned no company reports.");
    }
    renderComparison(payload.assessments, payload.failures || []);
  } catch (error) {
    statusMessage.textContent =
      error instanceof TypeError
        ? "Could not reach the assessment service. Run `python app.py` locally and visit http://127.0.0.1:5000."
        : error.message;
    statusMessage.classList.add("visible");
  } finally {
    button.disabled = false;
    button.querySelector("span:first-child").textContent = "Compare";
  }
});

// Keep the briefing assistant grounded in the displayed company's calculated ratios.
function createChatMessage(message, role) {
    const bubble = document.createElement("div");
    bubble.className = `chat-message ${role}-message`;
    bubble.textContent = message;
    document.querySelector("#briefing-messages").append(bubble);
    bubble.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function getRatio(report, name) {
    return report.credit_ratios.find((ratio) => ratio.name === name);
}

function buildRatioBriefing(report, question) {
    if (!report) {
      return "Run a company comparison first. I can then summarize the selected company’s earnings-quality score, annual trend, and available credit ratios.";
    }

    const normalizedQuestion = question.toLowerCase();
    const rating = report.earnings_quality.rating;
    const score = `${Math.round(report.earnings_quality.score * 100)}%`;
    const currentRatio = getRatio(report, "Current ratio");
    const debtToEquity = getRatio(report, "Debt-to-equity");
    const cashFlowToDebt = getRatio(report, "Operating cash flow / debt");
    const history = report.history.filter((period) => period.score !== null);
    const firstScore = history[0];
    const latestScore = history.at(-1);
    const trendText = firstScore && latestScore
      ? firstScore.period === latestScore.period
        ? `Only ${latestScore.period} has a score to compare.`
        : `The annual risk score moved from ${Math.round(firstScore.score * 100)}% in ${firstScore.period} to ${Math.round(latestScore.score * 100)}% in ${latestScore.period}.`
      : "There is not enough scored annual history to describe a trend.";
    const ratioText = [
      currentRatio ? `Current ratio: ${formatRatio(currentRatio.value, currentRatio.unit)}.` : "Current ratio: not available.",
      debtToEquity ? `Debt-to-equity: ${formatRatio(debtToEquity.value, debtToEquity.unit)}.` : "Debt-to-equity: not available.",
      cashFlowToDebt ? `Operating cash flow/debt: ${formatRatio(cashFlowToDebt.value, cashFlowToDebt.unit)}.` : "Operating cash flow/debt: not available.",
    ].join(" ");

    if (/trend|history|year|change|over time/.test(normalizedQuestion)) {
      return `${report.ticker}: ${trendText} A rising score means more of the checks were flagged; it is a screening signal, not a forecast.`;
    }
    if (/credit|liquid|debt|ratio|borrow|leverage/.test(normalizedQuestion)) {
      const liquidityNote = currentRatio?.value !== null && currentRatio?.value !== undefined
        ? currentRatio.value < 1
          ? "The current ratio is below 1x, so short-term liquidity merits closer review."
          : "The current ratio is above 1x; compare it with peers and the company’s own history."
        : "Liquidity data is incomplete, so the current ratio cannot be interpreted.";
      const leverageNote = debtToEquity?.value !== null && debtToEquity?.value !== undefined
        ? debtToEquity.value > 2
          ? "Debt-to-equity is above 2x; check debt maturities and sector norms."
          : "Debt-to-equity is not above the simple 2x review threshold used in this briefing."
        : "Debt-to-equity is unavailable.";
      return `${report.ticker}: ${ratioText} ${liquidityNote} ${leverageNote} These are prompts for review, not universal credit limits.`;
    }
    return `${report.ticker} has a ${rating} earnings-quality risk rating (${score}). ${trendText} ${ratioText} Review the underlying statements and sector context before drawing conclusions; this screening summary is not a buy/sell recommendation.`;
}

const briefingPanel = document.querySelector("#briefing-panel");
const briefingToggle = document.querySelector("#briefing-toggle");

briefingToggle.addEventListener("click", () => {
    const isOpening = briefingPanel.hidden;
    briefingPanel.hidden = !isOpening;
    briefingToggle.setAttribute("aria-expanded", String(isOpening));
    if (isOpening) document.querySelector("#briefing-input").focus();
});

document.querySelector("#briefing-close").addEventListener("click", () => {
    briefingPanel.hidden = true;
    briefingToggle.setAttribute("aria-expanded", "false");
    briefingToggle.focus();
});

document.querySelector("#briefing-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const chatInput = document.querySelector("#briefing-input");
    const question = chatInput.value.trim();
    if (!question) return;
    createChatMessage(question, "user");
    createChatMessage(buildRatioBriefing(selectedReport, question), "assistant");
    chatInput.value = "";
});
