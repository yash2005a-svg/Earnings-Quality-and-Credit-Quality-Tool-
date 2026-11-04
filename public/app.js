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

// Add chat replies as plain text so ticker names and questions are not treated as HTML.
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

// Turn an available annual score series into a cautious description, not a forecast.
function describeTrend(report) {
    const history = report.history.filter((period) => period.score !== null);
    if (history.length < 2) {
      return `There is only ${history.length} scored annual period available for ${report.ticker}, so I can’t describe a direction yet.`;
    }
    const first = history[0];
    const latest = history.at(-1);
    const change = Math.round((latest.score - first.score) * 100);
    if (change > 0) {
      return `The screening score rose ${change} percentage points, from ${Math.round(first.score * 100)}% in ${first.period} to ${Math.round(latest.score * 100)}% in ${latest.period}. That means more of this screen’s checks were flagged; it is not evidence by itself that the business or share price will worsen.`;
    }
    if (change < 0) {
      return `The screening score fell ${Math.abs(change)} percentage points, from ${Math.round(first.score * 100)}% in ${first.period} to ${Math.round(latest.score * 100)}% in ${latest.period}. That is an improvement in this screen’s signals, not proof that every part of the business improved.`;
    }
    return `The available scores are unchanged at ${Math.round(latest.score * 100)}% from ${first.period} to ${latest.period}. The underlying ratios can still move, so check the individual signals as well.`;
}

// Find the specific statement signal a question refers to and explain its meaning.
function findAskedMetric(report, question) {
    const normalized = question.toLowerCase();
    const metricTerms = [
      { match: /cash conversion|cash convert|operating cash flow.*net income|cfo.*profit/, name: "Cash conversion", meaning: "It compares operating cash flow with positive net income. Low conversion can mean reported profit has not yet turned into operating cash; inspect working capital and the cash-flow statement before concluding why." },
      { match: /accrual/, name: "Accruals", meaning: "It compares net income not covered by operating cash flow with average assets. A high result is a prompt to inspect earnings quality and the underlying adjustments, not proof of manipulation." },
      { match: /inventory|inventories|stock build|stock buildup/, name: "Stock build-up", meaning: "It compares inventory growth with revenue. A high result can be consistent with stock building faster than sales, but seasonality and industry context matter." },
      { match: /margin jump|margin change|profit margin change/, name: "Margin jump", meaning: "It is the change in net profit margin from the previous available annual period. A sudden change deserves context: revenue mix, costs, tax, and one-off items can all affect it." },
      { match: /cash stress|cash flow stress|financing cash|negative cash flow/, name: "Cash stress", meaning: "This check looks for negative operating cash flow, especially when financing cash flow is positive. It is a funding-risk signal to investigate, not a diagnosis on its own." },
      { match: /current ratio|liquidity|short.term/, name: "Current ratio", meaning: "It compares current assets with current liabilities. Below 1x means current liabilities exceed reported current assets at that date; asset quality and liability timing still matter." },
      { match: /debt.to.equity|debt equity|leverage|borrowings?/, name: "Debt-to-equity", meaning: "It compares reported debt with shareholders’ equity. Higher leverage can increase repayment sensitivity; compare peers, debt maturities, and cash generation." },
      { match: /liabilities.to.assets|liabilities assets/, name: "Liabilities-to-assets", meaning: "It shows the share of reported assets funded by liabilities. Interpret it with the type and maturity of liabilities and the company’s business model." },
      { match: /interest cover|interest coverage|cover interest/, name: "Interest coverage", meaning: "It compares EBIT with interest expense. Lower coverage can mean less room to absorb weaker operating earnings; this value may be unavailable when Yahoo omits interest expense." },
      { match: /cash ratio|cash reserve/, name: "Cash ratio", meaning: "It compares cash and equivalents with current liabilities. It is a narrow liquidity measure and excludes receivables and inventory." },
      { match: /return on assets|roa|asset return/, name: "Return on assets", meaning: "It compares net income with average assets. It describes profit generated relative to the asset base; capital intensity and industry differences affect comparisons." },
      { match: /net margin|net profit margin|profitability/, name: "Net profit margin", meaning: "It is net income as a share of revenue. It shows how much reported profit remains per unit of revenue, but one-off items and business mix can change it." },
      { match: /debt.*ebitda|ebitda.*debt/, name: "Debt / EBITDA", meaning: "It compares reported debt with EBITDA. It is a simplified leverage indicator, not a repayment schedule; EBITDA excludes interest, tax, depreciation, and amortization." },
      { match: /cash flow.*debt|operating cash.*debt/, name: "Operating cash flow / debt", meaning: "It compares a year of operating cash flow with reported debt. It is a rough cash-generation indicator, not a promise that all cash can go to debt repayment." },
    ];
    const metric = metricTerms.find((item) => item.match.test(normalized));
    if (!metric) return null;

    const check = report.earnings_quality.checks.find((item) => item.name === metric.name);
    const ratio = getRatio(report, metric.name);
    const value = check ? check.value : ratio?.value;
    const unit = check ? check.unit : ratio?.unit;
    if (value === null || value === undefined) {
      return `${metric.name} for ${report.ticker} is not available in the returned annual data. ${metric.meaning} Check the source statements or use another period if Yahoo has more complete coverage.`;
    }
    const scoreText = check
      ? `Screen result: ${checkLabel(check)} (${check.points}/2 points).`
      : "";
    return `${metric.name} for ${report.ticker} is ${formatRatio(value, unit)}. ${scoreText} ${metric.meaning}`;
}

// Identify useful findings using the same transparent thresholds as the dashboard.
function analyzeCompany(report) {
    const flagged = report.earnings_quality.checks.filter((check) => check.points === 2);
    const watched = report.earnings_quality.checks.filter((check) => check.points === 1);
    const clean = report.earnings_quality.checks.filter((check) => check.points === 0);
    const unavailable = report.earnings_quality.checks.filter((check) => check.points === null);
    const priorities = [];
    if (flagged.length) priorities.push(`Highest-priority signal${flagged.length === 1 ? "" : "s"}: ${flagged.map((check) => check.name).join(", ")}.`);
    if (watched.length) priorities.push(`Worth monitoring: ${watched.map((check) => check.name).join(", ")}.`);
    const currentRatio = getRatio(report, "Current ratio");
    if (currentRatio?.value !== null && currentRatio?.value !== undefined) {
      if (currentRatio.value < 1) {
        priorities.push(`Current ratio is ${formatRatio(currentRatio.value, "x")}; short-term liquidity is a sensible area to investigate.`);
      }
    }
    const debtToEquity = getRatio(report, "Debt-to-equity");
    if (debtToEquity?.value !== null && debtToEquity?.value !== undefined && debtToEquity.value > 2) {
      priorities.push(`Debt-to-equity is ${formatRatio(debtToEquity.value, "x")}; review debt maturities and compare with similar businesses.`);
    }
    const history = report.history.filter((period) => period.score !== null);
    if (history.length >= 2 && history.at(-1).score > history[0].score) {
      priorities.push("The score is higher than at the start of the available history; inspect which individual checks changed year by year.");
    }
    if (unavailable.length) priorities.push(`Data gap: ${unavailable.map((check) => check.name).join(", ")} could not be scored.`);
    return { priorities, notFlagged: clean };
}

// Compare the currently assessed companies without calling one the best investment.
function compareCompanies() {
    const reports = [...reportsByTicker.values()];
    if (reports.length < 2) return "Enter at least two tickers in the comparison form to compare companies.";
    const ranked = [...reports].sort((first, second) =>
      first.earnings_quality.score - second.earnings_quality.score);
    const lowest = ranked[0];
    const highest = ranked.at(-1);
    if (lowest.earnings_quality.score === highest.earnings_quality.score) {
      return `The available companies have the same overall screening score (${Math.round(lowest.earnings_quality.score * 100)}%). Compare the individual signals and data gaps below; an equal score does not mean the companies are alike.`;
    }
    return `${lowest.ticker} has the lowest current screening score (${Math.round(lowest.earnings_quality.score * 100)}%), and ${highest.ticker} the highest (${Math.round(highest.earnings_quality.score * 100)}%). This compares only the available earnings-quality checks; it does not rank valuation, future returns, or overall business quality. Open the comparison table and select each company to inspect what drives the difference.`;
}

function buildRatioBriefing(report, question) {
    if (!report) {
      return "Run a company comparison first. Then I can explain a metric, describe the annual trend, compare tickers, or highlight signals and missing data.";
    }

    const normalizedQuestion = question.toLowerCase().replace(/[’‘]/g, "'");
    const rating = report.earnings_quality.rating;
    const score = `${Math.round(report.earnings_quality.score * 100)}%`;
    const trends = /trend|history|year.by.year|over time|changed/.test(normalizedQuestion);
    const compare = /compare|comparison|which company|between (these|them)|versus|\bvs\b|better than/.test(normalizedQuestion);
    const strengths = /strength|positive|good sign|what is going well|what looks good/.test(normalizedQuestion);
    const watch = /watch|risk|concern|weakness|red flag|investigate|worry|problem|issue|recommend|next step|what should i do|what should i check/.test(normalizedQuestion);
    const summary = /summary|summari[sz]e|brief|overall|overview|company doing|how is .* doing/.test(normalizedQuestion);
    const metricAnswer = findAskedMetric(report, normalizedQuestion);
    if (metricAnswer) return metricAnswer;
    if (compare) return compareCompanies();
    if (trends) return `${describeTrend(report)} ${report.ticker}'s latest rating is ${rating} (${score}).`;

    const analysis = analyzeCompany(report);
    if (strengths) {
      const cleanChecks = analysis.notFlagged;
      if (!cleanChecks.length) {
        return `${report.ticker} has no earnings-quality checks scored within their thresholds in the latest period. The current rating is ${rating} (${score}); review the flagged checks and missing data before treating any ratio as a strength.`;
      }
      return `Signals not flagged in the latest screen for ${report.ticker}: ${cleanChecks.map((check) => check.name).join(", ")}. This means those checks were within the screen's thresholds for the reported year; it does not establish that the business is strong overall.`;
    }
    if (watch) {
      return analysis.priorities.length
        ? `For ${report.ticker}, I would investigate these points first: ${analysis.priorities.slice(0, 4).join(" ")} Start with the source statements, then compare against prior years and similar companies; the screen alone can’t establish a cause.`
        : `${report.ticker} has a ${rating} screening rating (${score}) and no specific earnings checks flagged in the latest period. A useful next step is to review its full statements, debt maturities, and peer context; this screen cannot determine whether it is a good investment.`;
    }
    if (summary) {
      const cleanSummary = analysis.notFlagged.length
        ? `Not flagged by this screen: ${analysis.notFlagged.map((check) => check.name).join(", ")}.`
        : "";
      return `${report.ticker}'s latest earnings-quality rating is ${rating} (${score}). ${analysis.priorities.slice(0, 2).join(" ")} ${cleanSummary} ${describeTrend(report)} This is a preliminary screen from Yahoo's reported annual data, not a complete view of the company.`;
    }

    if (/forecast|future|share price|stock price|valuation|news|latest announcement|management|competitor|industry outlook|should i buy|should i sell/.test(normalizedQuestion)) {
      return `That needs information Ledgerly does not currently fetch (such as live news, market prices, valuation, or forecasts), so I can’t answer it reliably from this report. For ${report.ticker}, I can explain the available statements, the ${rating} screening score (${score}), a particular ratio, annual trend, or points to investigate.`;
    }
    const relevantObservation = analysis.priorities[0]
      || (analysis.notFlagged.length
        ? `The latest screen did not flag ${analysis.notFlagged.map((check) => check.name).join(", ")}.`
        : "Some checks may not have enough data to score.");
    return `I can help with that from ${report.ticker}'s available annual report, but this version is a transparent, rule-based briefing rather than a general AI. ${relevantObservation} Try asking “why is cash conversion flagged?”, “what changed over time?”, “compare the companies”, “what should I investigate?”, or “what does debt-to-equity mean?”.`;
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

// Example-question buttons let users explore different briefing topics quickly.
document.querySelectorAll(".briefing-prompts button").forEach((promptButton) => {
    promptButton.addEventListener("click", () => {
      const question = promptButton.dataset.prompt;
      createChatMessage(question, "user");
      createChatMessage(buildRatioBriefing(selectedReport, question), "assistant");
    });
});
