"""Single-company earnings-quality and credit assessment using Yahoo Finance."""

import argparse  # Reads the ticker and output-folder options supplied in the terminal.
import json  # Saves the complete assessment as a portable JSON document.
import math  # Rejects infinite or invalid financial ratios before reporting them.
import re  # Normalizes Yahoo statement labels and validates ticker symbols.
from pathlib import Path  # Creates output paths in a way that works across operating systems.

import pandas as pd  # Aligns Yahoo's financial statement rows and handles missing values.
import yfinance as yf  # Downloads annual income, balance-sheet, and cash-flow statements.


# These are the Yahoo Finance statement labels used to locate equivalent accounting data.
STATEMENT_LABELS = {
    "revenue": ("Total Revenue", "Operating Revenue"),
    "net_income": (
        "Net Income",
        "Net Income Common Stockholders",
        "Net Income From Continuing Operation Net Minority Interest",
        "Net Income From Continuing Operations",
    ),
    "assets": ("Total Assets",),
    "current_assets": ("Current Assets",),
    "current_liabilities": ("Current Liabilities",),
    "equity": ("Stockholders Equity", "Total Stockholder Equity", "Common Stock Equity"),
    "liabilities": ("Total Liabilities Net Minority Interest", "Total Liabilities"),
    "debt": ("Total Debt",),
    "inventory": ("Inventory",),
    "cash": (
        "Cash Cash Equivalents And Short Term Investments",
        "Cash And Cash Equivalents",
        "Cash Cash Equivalents And Short Term Investments",
    ),
    "ebit": ("EBIT", "Operating Income"),
    "ebitda": ("EBITDA", "Normalized EBITDA"),
    "interest": ("Interest Expense Non Operating", "Interest Expense"),
    "operating_cash_flow": (
        "Operating Cash Flow",
        "Cash Flow From Continuing Operating Activities",
    ),
    "financing_cash_flow": (
        "Financing Cash Flow",
        "Cash Flow From Continuing Financing Activities",
    ),
    "change_in_inventory": ("Change In Inventory",),
}

# Labels and thresholds preserve the original five checks and their scoring cut-offs.
EARNINGS_CHECKS = (
    ("Cash conversion", "cash_conversion", "x"),
    ("Accruals", "accruals", "%"),
    ("Stock build-up", "inventory_build", "%"),
    ("Margin jump", "margin_jump", "percentage points"),
    ("Cash stress", "cash_stress", "flag"),
)


def _normalize_label(label):
    """Make Yahoo statement headings comparable despite spaces and punctuation."""
    return re.sub(r"[^a-z0-9]", "", str(label).lower())


def _yearly_values(statement, aliases):
    """Return one statement line as {fiscal year: value}, or an empty mapping."""
    if statement is None or statement.empty:
        return {}

    # Yahoo sometimes changes row headings; try the known equivalent labels in order.
    row_by_normalized_label = {_normalize_label(row): row for row in statement.index}
    matching_row = next(
        (
            row_by_normalized_label[_normalize_label(alias)]
            for alias in aliases
            if _normalize_label(alias) in row_by_normalized_label
        ),
        None,
    )
    if matching_row is None:
        return {}

    values = {}
    for column in statement.columns:
        period = pd.to_datetime(column, errors="coerce")
        value = pd.to_numeric(statement.at[matching_row, column], errors="coerce")
        if not pd.isna(period) and not pd.isna(value):
            values[period.year] = float(value)
    return values


def _ratio(numerator, denominator):
    """Divide financial statement values, returning None when the ratio is unusable."""
    if numerator is None or denominator is None or denominator == 0:
        return None
    result = numerator / denominator
    return result if math.isfinite(result) else None


def _metric_records(income_stmt, balance_sheet, cashflow_stmt):
    """Combine the available annual statements into year-by-year assessment inputs."""
    statement_groups = {
        "income": income_stmt,
        "balance": balance_sheet,
        "cashflow": cashflow_stmt,
    }
    lines = {}
    for line_name, aliases in STATEMENT_LABELS.items():
        statement_name = (
            "income"
            if line_name
            in {"revenue", "net_income", "ebit", "ebitda", "interest"}
            else "cashflow"
            if line_name
            in {"operating_cash_flow", "financing_cash_flow", "change_in_inventory"}
            else "balance"
        )
        lines[line_name] = _yearly_values(statement_groups[statement_name], aliases)

    # The union keeps all periods Yahoo supplies, even if a statement omits a year.
    # The latest complete assessment period must have annual revenue to calculate margins.
    years = sorted(lines["revenue"])
    records = []
    for index, year in enumerate(years):
        previous_year = years[index - 1] if index else None
        value = {
            name: values.get(year)
            for name, values in lines.items()
        }
        revenue = value["revenue"]
        net_income = value["net_income"]
        assets = value["assets"]
        prior_assets = lines["assets"].get(previous_year) if previous_year else None
        average_assets = (
            (assets + prior_assets) / 2
            if assets is not None and prior_assets is not None
            else assets
        )

        # A balance-sheet inventory increase is most intuitive; use the cash-flow
        # inventory movement with its sign reversed when an opening balance is absent.
        inventory = value["inventory"]
        prior_inventory = lines["inventory"].get(previous_year) if previous_year else None
        if inventory is not None and prior_inventory is not None:
            inventory_increase = inventory - prior_inventory
        elif value["change_in_inventory"] is not None:
            inventory_increase = -value["change_in_inventory"]
        else:
            inventory_increase = None

        records.append(
            {
                "year": year,
                "revenue": revenue,
                "net_income": net_income,
                "assets": assets,
                "average_assets": average_assets,
                "current_assets": value["current_assets"],
                "current_liabilities": value["current_liabilities"],
                "equity": value["equity"],
                "liabilities": value["liabilities"],
                "debt": value["debt"],
                "cash": value["cash"],
                "ebit": value["ebit"],
                "ebitda": value["ebitda"],
                "interest": value["interest"],
                "operating_cash_flow": value["operating_cash_flow"],
                "financing_cash_flow": value["financing_cash_flow"],
                "cash_conversion": _ratio(
                    value["operating_cash_flow"],
                    net_income if net_income is not None and net_income > 0 else None,
                ),
                "accruals": _ratio(
                    net_income - value["operating_cash_flow"]
                    if net_income is not None and value["operating_cash_flow"] is not None
                    else None,
                    average_assets,
                ),
                "inventory_build": _ratio(inventory_increase, revenue),
                "net_margin": _ratio(net_income, revenue),
                "margin_jump": None,
            }
        )

    # Compare each annual margin with the immediately preceding available annual period.
    for index, record in enumerate(records):
        if index and record["net_margin"] is not None:
            previous_margin = records[index - 1]["net_margin"]
            if previous_margin is not None:
                record["margin_jump"] = record["net_margin"] - previous_margin
    return records


def _rate_record(record):
    """Score the original five earnings-quality checks for one fiscal year."""
    cash_conversion = record["cash_conversion"]
    accruals = record["accruals"]
    inventory_build = record["inventory_build"]
    margin_jump = record["margin_jump"]
    operating_cash_flow = record["operating_cash_flow"]
    financing_cash_flow = record["financing_cash_flow"]

    # Lower cash conversion is worse; the other three ratio thresholds are upper bounds.
    cash_points = (
        None
        if cash_conversion is None
        else 2
        if cash_conversion < 0.5
        else 1
        if cash_conversion < 0.8
        else 0
    )
    accrual_points = (
        None
        if accruals is None
        else 2
        if accruals > 0.10
        else 1
        if accruals > 0.05
        else 0
    )
    inventory_points = (
        None
        if inventory_build is None
        else 2
        if inventory_build > 0.10
        else 1
        if inventory_build > 0.05
        else 0
    )
    margin_points = (
        None
        if margin_jump is None
        else 2
        if margin_jump > 0.06
        else 1
        if margin_jump > 0.03
        else 0
    )
    cash_stress_points = (
        None
        if operating_cash_flow is None
        else 2
        if operating_cash_flow < 0 and financing_cash_flow is not None and financing_cash_flow > 0
        else 1
        if operating_cash_flow < 0
        else 0
    )
    points = (cash_points, accrual_points, inventory_points, margin_points, cash_stress_points)
    applicable = [point for point in points if point is not None]
    score = sum(applicable) / (len(applicable) * 2) if applicable else None

    # Retain the original override: weak cash conversion plus high accruals is at least High.
    if cash_points == 2 and accrual_points == 2 and score is not None:
        score = max(score, 0.60)
    rating = (
        None
        if score is None
        else "Low"
        if score <= 0.25
        else "Moderate"
        if score <= 0.50
        else "High"
        if score <= 0.75
        else "Severe"
    )
    check_values = (
        cash_conversion,
        accruals,
        inventory_build,
        margin_jump,
        None if operating_cash_flow is None else float(operating_cash_flow < 0),
    )
    check_points = points
    checks = [
        {
            "name": label,
            "value": check_values[index],
            "unit": unit,
            "points": check_points[index],
            "max_points": 2,
        }
        for index, (label, _, unit) in enumerate(EARNINGS_CHECKS)
    ]
    return {"score": score, "rating": rating, "checks": checks}


def _credit_ratios(record):
    """Calculate standard liquidity, leverage, coverage, and profitability ratios."""
    debt = record["debt"]
    equity = record["equity"]
    interest = abs(record["interest"]) if record["interest"] is not None else None
    return [
        {
            "name": "Current ratio",
            "value": _ratio(record["current_assets"], record["current_liabilities"]),
            "unit": "x",
            "formula": "Current assets / current liabilities",
        },
        {
            "name": "Debt-to-equity",
            "value": _ratio(debt, equity),
            "unit": "x",
            "formula": "Total debt / shareholders' equity",
        },
        {
            "name": "Liabilities-to-assets",
            "value": _ratio(record["liabilities"], record["assets"]),
            "unit": "%",
            "formula": "Total liabilities / total assets",
        },
        {
            "name": "Interest coverage",
            "value": _ratio(record["ebit"], interest),
            "unit": "x",
            "formula": "EBIT / interest expense",
        },
        {
            "name": "Operating cash flow / debt",
            "value": _ratio(record["operating_cash_flow"], debt),
            "unit": "%",
            "formula": "Operating cash flow / total debt",
        },
        {
            "name": "Cash ratio",
            "value": _ratio(record["cash"], record["current_liabilities"]),
            "unit": "x",
            "formula": "Cash and equivalents / current liabilities",
        },
        {
            "name": "Return on assets",
            "value": _ratio(record["net_income"], record["average_assets"]),
            "unit": "%",
            "formula": "Net income / average total assets",
        },
        {
            "name": "Net profit margin",
            "value": record["net_margin"],
            "unit": "%",
            "formula": "Net income / total revenue",
        },
        {
            "name": "Debt / EBITDA",
            "value": _ratio(debt, record["ebitda"]),
            "unit": "x",
            "formula": "Total debt / EBITDA",
        },
    ]


def assess_ticker(ticker_symbol, ticker_factory=None):
    """Fetch Yahoo annual statements and return an earnings-quality and credit report."""
    ticker = ticker_symbol.strip().upper()
    if not ticker or len(ticker) > 20 or not re.fullmatch(r"[A-Z0-9.^=_-]+", ticker):
        raise ValueError("Enter a valid Yahoo Finance ticker, for example AAPL or RELIANCE.NS.")

    # Request every annual period Yahoo currently makes available, rather than a fixed window.
    company = (ticker_factory or yf.Ticker)(ticker)
    income_stmt = company.get_income_stmt(freq="yearly")
    balance_sheet = company.get_balance_sheet(freq="yearly")
    cashflow_stmt = company.get_cashflow(freq="yearly")
    records = _metric_records(income_stmt, balance_sheet, cashflow_stmt)
    if not records or not any(record["revenue"] is not None for record in records):
        raise ValueError(
            f"Yahoo Finance did not return usable annual income-statement data for {ticker}. "
            "Check the ticker (including its exchange suffix) and try again."
        )

    rated_records = []
    for record in records:
        rated = _rate_record(record)
        rated_records.append(
            {"period": record["year"], "score": rated["score"], "rating": rated["rating"]}
        )

    latest_record = records[-1]
    latest_rated = _rate_record(latest_record)
    if latest_rated["rating"] is None:
        raise ValueError(
            f"Yahoo Finance returned no applicable earnings-quality ratios for {ticker} "
            f"in {latest_record['year']}."
        )
    return {
        "ticker": ticker,
        "latest_period": latest_record["year"],
        "available_periods": [record["year"] for record in records],
        "earnings_quality": {
            "score": latest_rated["score"],
            "rating": latest_rated["rating"],
            "checks": latest_rated["checks"],
        },
        "credit_ratios": _credit_ratios(latest_record),
        "history": rated_records,
        "disclaimer": (
            "Screening indicators only, not a credit rating or investment recommendation. "
            "Yahoo Finance may omit or revise statement line items; unavailable ratios are "
            "shown as not available."
        ),
    }


def save_assessment(assessment, output_dir="."):
    """Write the full report as JSON and its earnings/credit ratios as a CSV."""
    destination = Path(output_dir)
    destination.mkdir(parents=True, exist_ok=True)
    safe_ticker = assessment["ticker"].replace(".", "_")
    json_path = destination / f"{safe_ticker}_assessment.json"
    csv_path = destination / f"{safe_ticker}_ratios.csv"

    # JSON retains the yearly history and scoring details; CSV is convenient for spreadsheets.
    json_path.write_text(json.dumps(assessment, indent=2), encoding="utf-8")
    rows = [
        {
            "category": "Earnings quality",
            "ratio": check["name"],
            "value": check["value"],
            "unit": check["unit"],
            "points": check["points"],
        }
        for check in assessment["earnings_quality"]["checks"]
    ]
    rows.extend(
        {
            "category": "Credit",
            "ratio": ratio["name"],
            "value": ratio["value"],
            "unit": ratio["unit"],
            "points": "",
        }
        for ratio in assessment["credit_ratios"]
    )
    pd.DataFrame(rows).to_csv(csv_path, index=False)
    return json_path, csv_path


def main():
    """Run a one-company assessment from the command line and save its report."""
    parser = argparse.ArgumentParser(
        description="Assess a company's earnings quality and credit ratios with Yahoo Finance."
    )
    parser.add_argument("ticker", help="Yahoo Finance ticker (for example AAPL or RELIANCE.NS)")
    parser.add_argument("--output-dir", default=".", help="Folder for the JSON and CSV reports")
    args = parser.parse_args()

    assessment = assess_ticker(args.ticker)
    json_path, csv_path = save_assessment(assessment, args.output_dir)
    print(
        f"{assessment['ticker']} | {assessment['latest_period']} | "
        f"{assessment['earnings_quality']['rating']} earnings-quality risk "
        f"(score {assessment['earnings_quality']['score']:.0%})"
    )
    print(f"Saved assessment: {json_path}")
    print(f"Saved ratios: {csv_path}")


if __name__ == "__main__":
    main()
