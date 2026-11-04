# Ledgerly

Ledgerly is a company earnings-quality and credit screening project. Enter one or
more Yahoo Finance ticker symbols to compare the companies' latest available
annual statements, earnings-quality risk scores, and credit ratios. The project
keeps Python assessment logic separate from the browser interface so it is easier
to present and explain.

> **Important:** Ledgerly is an educational screening aid. It is not a credit
> rating, audit, investment recommendation, or replacement for reviewing company
> filings. Yahoo Finance data can be incomplete, restated, delayed, or unavailable.

## Project layout

```text
earnings_screener.py       Yahoo data retrieval, ratio calculations, scoring, CSV/JSON exports
app.py                     Local Flask server
api/assessment.py          Vercel Python API and multi-ticker request handling
public/index.html          Dashboard structure and form
public/styles.css          Colors, responsive layout, and animations
public/app.js              Form behavior, comparison tables, and interactive Plotly charts
tests/                     Offline unit tests (no Yahoo requests)
requirements.txt           Python package dependencies
vercel.json                Vercel Python function configuration
```

The user interface is **not embedded in the Python files**. `public/index.html`,
`public/styles.css`, and `public/app.js` are separate presentation files;
`earnings_screener.py` contains the Python-only financial logic.

## Run it locally

Use Python 3.10 or later. From the project folder, install the packages:

```bash
python -m pip install -r requirements.txt
```

Start the local web application:

```bash
python app.py
```

Open **http://127.0.0.1:5000** in your browser. Enter up to five tickers separated
by commas, for example:

```text
AAPL, MSFT, RELIANCE.NS
```

Use the ticker spelling shown by Yahoo Finance; exchange suffixes such as `.NS`
are needed for many international listings. Ledgerly compares companies in one
request, reports individual unavailable tickers without discarding successful
results, and lets you select a company for its detailed report.

### Why the screenshot showed an unreadable-response error

The page was opened directly as a local `file:///.../index.html` file, or the
Python API was not running. In either case the browser cannot reach the
`/api/assessment` endpoint and may receive a browser/server error page instead of
JSON. Do not double-click `index.html` to launch Ledgerly. Run `python app.py`
and open **http://127.0.0.1:5000** as above. The dashboard now detects this case
and displays a direct instruction instead of a JSON parsing error.

If the page is already running but the API fails, restart `python app.py` and
reload the local site. For a Vercel deployment, check the deployment and
function logs if the API endpoint returns an error.

## Run one assessment from Python

The assessment module can also run without the dashboard:

```bash
python earnings_screener.py AAPL
python earnings_screener.py RELIANCE.NS --output-dir reports
```

Each run saves:

- `<TICKER>_assessment.json` — full annual history, latest signal scores, and
  credit ratios.
- `<TICKER>_ratios.csv` — latest signal and credit ratios in a tabular format.

## Earnings-quality method

The prior CMIE spreadsheet pipeline used three-year rolling calculations. Ledgerly
now uses every annual period Yahoo Finance returns and scores each year from that
year's reported statement values. It does not require a fixed number of years.

| Signal | Calculation | Watch / red-flag threshold |
|---|---|---|
| Cash conversion | Operating cash flow / net income (only if net income is positive) | Below 0.80x / below 0.50x |
| Accruals | (Net income - operating cash flow) / average assets | Above 5% / above 10% |
| Stock build-up | Increase in inventory / revenue | Above 5% / above 10% |
| Margin jump | Current net margin - preceding available annual margin | Above 3 / above 6 percentage points |
| Cash stress | Negative operating cash flow; more severe when financing cash flow is positive | Watch / red flag |

Applicable checks receive 0 (within threshold), 1 (watch), or 2 (red flag) points.
The risk score is points received divided by the maximum points applicable to that
year. Ratings are Low (up to 25%), Moderate (up to 50%), High (up to 75%), and
Severe (above 75%). Missing inputs are marked not available and do not count as
zero. The original override for both weak cash conversion and high accruals is
preserved. Since the app assesses user-entered companies rather than a preloaded
sector, stock build-up is checked against the original thresholds, not a sector
median.

## Credit ratios and comparison charts

Ledgerly calculates the following when Yahoo provides the required statement
values:

- Current ratio = current assets / current liabilities
- Debt-to-equity = total debt / shareholders' equity
- Liabilities-to-assets = total liabilities / total assets
- Interest coverage = EBIT / interest expense
- Operating cash flow / debt
- Cash ratio = cash and equivalents / current liabilities
- Return on assets = net income / average total assets
- Net profit margin = net income / revenue
- Debt / EBITDA

The web dashboard uses Plotly.js charts for risk-score comparison, selectable
credit-ratio comparison, and each selected company's annual risk trend. The
comparison table also shows each company's latest fiscal period, rating, score,
current ratio, debt-to-equity, and net margin. Plotly.js is loaded from its
official CDN, so an internet connection is needed to display the interactive
charts.

## Libraries and Python functions

- **yfinance** — `yf.Ticker` creates the Yahoo Finance company object.
  `get_income_stmt`, `get_balance_sheet`, and `get_cashflow` retrieve annual
  income, balance-sheet, and cash-flow data.
- **pandas** — aligns statement rows and periods and writes the CSV report.
- **argparse** — reads the command-line ticker and output-folder arguments.
- **json** — writes the full assessment and handles API request/response data.
- **math** — checks that calculated ratios are finite numbers.
- **re** — normalizes statement labels and validates ticker symbols.
- **pathlib** — creates output paths for reports.
- **Flask** — serves the local dashboard and its JSON API.
- **Plotly.js** — draws the browser charts; no chart code is mixed into the
  financial calculation module.

Core functions in `earnings_screener.py`:

- `assess_ticker` fetches available statements and builds the company report.
- `_metric_records` aligns available Yahoo statement values by annual period.
- `_rate_record` applies the five earnings-quality checks.
- `_credit_ratios` computes the credit metrics from the same statements.
- `save_assessment` writes JSON and CSV reports.

The API's `build_assessment_payload` validates, deduplicates, and concurrently
assesses up to five companies. Its response includes successful `assessments` and
any per-company `failures`.

## Run the tests

The tests use sample statements and mocked Yahoo calls, so they do not depend on
network access:

```bash
python -m unittest discover -s tests -v
```

## Deploy to Vercel

1. Push the project folder to a GitHub repository.
2. Import that repository in Vercel.
3. Keep the project root at the repository root.
4. Deploy; Vercel serves `public/` and runs `api/assessment.py` as the Python API.

The API accepts a JSON request like:

```json
{
  "tickers": ["AAPL", "MSFT", "RELIANCE.NS"]
}
```

No Yahoo Finance API key is required. Vercel's configured function duration is
60 seconds to allow several company statement lookups in one request. Availability
of that duration depends on the Vercel plan.
