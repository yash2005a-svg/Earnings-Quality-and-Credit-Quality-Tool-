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
public/app.js              Form behavior, briefing assistant, comparison tables, and Plotly charts
tests/                     Offline unit tests (no Yahoo requests)
requirements.txt           Python package dependencies
vercel.json                Vercel Python function configuration
```

The user interface is **not embedded in the Python files**. `public/index.html`,
`public/styles.css`, and `public/app.js` are separate presentation files;
`earnings_screener.py` contains the Python-only financial logic.

## Python concepts used in this project

This section is a guide to the Python ideas visible in the assessment code. The
main examples are in `earnings_screener.py`; the browser files use JavaScript,
HTML, and CSS rather than Python.

### Variables and constants

Variables give useful names to values, so later code can use them:

```python
ticker = ticker_symbol.strip().upper()
company = ticker_factory(ticker)
```

`ticker` and `company` are variables: their values are assigned while the program
runs. Uppercase names such as `MAX_TICKERS` and `STATEMENT_LABELS` represent
constants—values that the code intends to keep fixed.

### Data types and data structures

- **Strings (`str`)** represent ticker symbols, statement names, and messages.
- **Integers (`int`)** represent fiscal years and point scores.
- **Floating-point numbers (`float`)** represent financial values and ratios.
- **Booleans (`bool`)** represent yes/no conditions such as whether cash flow is negative.
- **`None`** represents a missing value; the code does not treat unavailable Yahoo data as zero.
- **Lists** store ordered items, such as a company's yearly records.
- **Dictionaries** map names to values, such as the statement line aliases or an assessment report.
- **Tuples** group fixed items, such as the five named earnings-quality checks.
- **Sets** collect distinct fiscal years.

Pandas `DataFrame` objects are another important data structure: Yahoo Finance
statements are returned as tables, and pandas helps align their rows and columns.

### Input, output, and type conversion

`argparse` reads the ticker and optional output folder from the command line.
`input` is not used: a command-line argument makes the run easy to repeat. The
program outputs a short summary with `print`, writes report files with
`Path.write_text` and `DataFrame.to_csv`, and converts statement entries to
numeric values with `pandas.to_numeric`.

### Conditions and comparisons

An `if` statement chooses what the program should do when a condition is true.
`elif` checks another possibility, and `else` handles the remaining case. For
example, `_ratio` checks that the numerator and denominator exist and that the
denominator is not zero before dividing. Comparisons such as `score > 0.75`
select a risk rating.

### Loops and comprehensions

A `for` loop repeats an operation for each item. The assessment loops over fiscal
years and statement lines to create a record for each annual period. List and set
comprehensions provide shorter ways to build collections; for example, the code
uses a set comprehension to gather distinct statement years.

### Functions, parameters, and return values

A function packages a task under a name. Parameters provide its inputs, and
`return` sends its result back to its caller. For example:

```python
def _ratio(numerator, denominator):
    if numerator is None or denominator is None or denominator == 0:
        return None
    return numerator / denominator
```

This helper keeps the same missing-value and divide-by-zero rule wherever the
assessment calculates a ratio. Other functions separate data retrieval, scoring,
credit-ratio calculations, and report saving into explainable steps.

### Imports, modules, and libraries

Python's `import` statement makes code from a module available in a file. Standard
library modules used here include `argparse`, `json`, `math`, `re`, `pathlib`,
`http.server`, and `concurrent.futures`. Installed libraries include:

- **yfinance** to request annual company financial statements.
- **pandas** to read, align, and export statement data.
- **Flask** to serve the local webpage and API.

The charts are made by **Plotly.js** in the separate browser frontend; Python does
not calculate or draw those charts.

### Errors and validation

`try` and `except` allow a program to handle a specific operation that can fail.
For example, the API reports a clear error if request JSON cannot be read or a
ticker is invalid. `raise ValueError(...)` stops an invalid assessment with an
explanation rather than returning an incomplete report that looks successful.

### Files, command-line execution, and reusable code

`pathlib.Path` creates report file paths and saves the results. The condition
`if __name__ == "__main__":` runs the command-line interface only when
`earnings_screener.py` is started as a script; another file can import its
functions without starting that interface.

### Classes and API request handlers

The Vercel endpoint defines a `handler` class based on Python's
`BaseHTTPRequestHandler`. The class groups request-handling behavior, and its
`do_POST` method processes an HTTP POST request. The local Flask API provides a
second, convenient way to serve the same assessment on a computer.

### Concurrent work

The multi-company endpoint uses `ThreadPoolExecutor` to request assessments for
several tickers at the same time. `as_completed` processes results as each Yahoo
request finishes. The output is reordered to match the user's ticker list, so
concurrent completion does not scramble the comparison table.

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

The web dashboard uses Plotly.js charts for:

1. A bar chart comparing the latest earnings-quality risk score for each company.
2. A trend-analysis line graph comparing every company's annual risk scores on a
   shared fiscal-year axis. Each line is a separate ticker. Missing annual
   scores are displayed as gaps, not zeros. This is a risk-score trend, not a
   share-price trend or a prediction.
3. A selectable credit-ratio comparison.
4. An individual company's annual risk-score line graph.

The comparison table also shows each company's latest fiscal period, rating,
score, current ratio, debt-to-equity, and net margin. Plotly.js is loaded from
its official CDN, so an internet connection is needed to display the interactive
charts.

## Ratio briefing chatbot

The dashboard includes a chat-style assistant. It summarizes the currently
selected company's calculated risk score, annual history, and credit ratios in
response to prompts such as “brief this company,” “what should I watch?”, “show
the trend,” or “explain the credit ratios.” Selecting a different company
changes the data used for the next answer.

The current assistant is intentionally **rule-based**: it summarizes values
already returned by Ledgerly and applies transparent, simple checks such as a
current ratio below 1x. It is designed to respond to varied questions about
individual ratios, earnings-quality checks, annual trends, company comparisons,
positive signals, risks, data gaps, and practical follow-up checks. Questions
about live news, future share prices, or valuation are identified as outside the
available data instead of receiving a made-up answer.

The assistant’s observations are derived from the rules and report data; they
are not open-ended AI reasoning. It does not call an AI model and does not
provide personalized investment or credit advice. This lets the chat interface
work while a separate recommendation service is being prepared.

### Connecting the recommendation API later

The chat interface and briefing logic are in `public/app.js`. Once the
recommendation API is ready, replace the `buildRatioBriefing` response path with
a request to that API. Keep private API keys in Vercel environment variables
and send requests from a Vercel server-side function—not browser JavaScript—so
secrets are not exposed to visitors. To connect it correctly, the project will
need the API URL, expected JSON request fields, response shape, and
authentication method. Until those details are supplied, the rule-based
briefing remains the working fallback. Adding a key to Vercel by itself does
not change the chat behavior.

### Optional Gemini API setup for a future AI briefing

The current Vercel deployment does **not** make AI calls: setting an environment
variable alone will not change the rule-based chat. First, a server-side chat
endpoint must be implemented to read the key and call Gemini. After that endpoint
is deployed, configure the key as follows:

1. Create a Gemini API key in [Google AI Studio](https://aistudio.google.com/api-keys).
   Review Google's current free-tier quotas and data-use terms before sending
   company data.
2. Open the Ledgerly project in Vercel and select **Settings → Environment
   Variables**.
3. Add a variable named `GEMINI_API_KEY`, paste the key as its value, and select
   the environments where the chat endpoint will run (usually **Production**;
   add **Preview** if preview deployments need AI chat too).
4. Save the variable and redeploy the project so the server-side function can
   read it.
5. Test the deployed chat endpoint. Never add the real key to `public/app.js`,
   another browser file, a checked-in `.env` file, or a GitHub commit.

The static frontend cannot safely use a secret key directly. The browser should
send the user's message and selected company's calculated ratios to the
server-side endpoint; that endpoint reads `GEMINI_API_KEY` from its environment
and returns the briefing. Do not send Yahoo statements that are not needed for
the answer. The current rule-based briefing continues to work while the AI
endpoint is not implemented or configured.

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
- **JavaScript** — handles browser forms, company selection, chat briefings,
  comparison tables, and Plotly charts. JavaScript comments use `//`; Python
  comments use `#`.

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

## Course-faculty walkthrough

For a short demonstration, start `python app.py` and compare at least two
tickers. Explain the dashboard in this order:

1. **Input:** the user enters Yahoo Finance ticker symbols. The browser sends
   them to the Python API as JSON.
2. **Data retrieval:** `assess_ticker` creates a `yfinance.Ticker` object and
   requests annual income, balance-sheet, and cash-flow statements.
3. **Data preparation:** pandas tables are mapped by fiscal year. Helper
   functions align the financial values and use `None` when a required value
   is missing.
4. **Calculations:** Python functions calculate earnings-quality signals and
   credit ratios. `if`/`elif` conditions apply thresholds, and loops process
   companies and annual statement periods.
5. **Results:** the API returns JSON. JavaScript renders the comparison table,
   interactive charts, selected-company details, and ratio briefing.

Python concepts demonstrated include variables and constants,
strings/numbers/booleans/`None`, lists/tuples/dictionaries/sets, `for` loops,
comprehensions, conditionals, functions and return values, imports, exceptions,
regular expressions, file output, a command-line interface, a request-handler
class, and concurrent requests with `ThreadPoolExecutor`. The “Python concepts”
section above includes examples and explanations.

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

Adding `GEMINI_API_KEY` is optional and is only needed after a server-side Gemini
chat endpoint is implemented. It is not required for deployment, Yahoo Finance
assessments, trend charts, or the current rule-based Ledgerly Briefings.

## Push the project to GitHub

The repository is initialized locally on the `main` branch. In PowerShell, first
change into the project directory; Git commands run from another directory may
show `fatal: not a git repository`:

```powershell
Set-Location "C:\Users\Yash\OneDrive\Documents\python project"
git status
git push -u origin main
```

If GitHub requests an account, authenticate as the account that owns the
repository. `.gitignore` keeps the old company CSV files, generated reports,
charts, and Python cache out of the commit.
