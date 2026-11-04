"""Unit tests for statement mapping, ratio formulas, and ticker validation."""

import unittest  # Runs the focused tests without requiring an extra test framework.
from unittest.mock import patch  # Replaces the Yahoo client so tests do not use the network.

import pandas as pd  # Builds small Yahoo-shaped financial statement fixtures.

from earnings_screener import assess_ticker


def statement(rows, columns):
    """Create a Yahoo-style statement DataFrame with fiscal years as columns."""
    return pd.DataFrame.from_dict(rows, orient="index", columns=columns.values())


class FakeTicker:
    """Supply deterministic annual statements in place of a live Yahoo request."""

    def get_income_stmt(self, freq="yearly"):
        """Return revenue, profit, EBITDA, EBIT, and interest for three years."""
        return statement(
            {
                "Total Revenue": [1000, 1100, 1200],
                "Net Income": [100, 110, 120],
                "EBIT": [150, 165, 180],
                "EBITDA": [200, 220, 240],
                "Interest Expense Non Operating": [-10, -10, -10],
            },
            {2024: pd.Timestamp("2024-12-31"), 2025: pd.Timestamp("2025-12-31"),
             2026: pd.Timestamp("2026-12-31")},
        )

    def get_balance_sheet(self, freq="yearly"):
        """Return the balance-sheet lines needed by earnings and credit ratios."""
        return statement(
            {
                "Total Assets": [1000, 1100, 1200],
                "Current Assets": [450, 480, 500],
                "Current Liabilities": [300, 300, 250],
                "Stockholders Equity": [500, 550, 600],
                "Total Liabilities Net Minority Interest": [500, 550, 600],
                "Total Debt": [200, 210, 240],
                "Inventory": [100, 110, 160],
                "Cash Cash Equivalents And Short Term Investments": [80, 90, 100],
            },
            {2024: pd.Timestamp("2024-12-31"), 2025: pd.Timestamp("2025-12-31"),
             2026: pd.Timestamp("2026-12-31")},
        )

    def get_cashflow(self, freq="yearly"):
        """Return operating and financing cash flow for three years."""
        return statement(
            {
                "Operating Cash Flow": [100, 90, 60],
                "Financing Cash Flow": [10, 0, -5],
            },
            {2024: pd.Timestamp("2024-12-31"), 2025: pd.Timestamp("2025-12-31"),
             2026: pd.Timestamp("2026-12-31")},
        )


class EarningsScreenerTests(unittest.TestCase):
    """Verify observable assessment results without reaching Yahoo Finance."""

    @patch("earnings_screener.yf.Ticker", return_value=FakeTicker())
    def test_assessment_uses_all_available_periods_and_calculates_ratios(self, ticker):
        """The latest period should use Yahoo data and the earlier years for comparisons."""
        result = assess_ticker(" test ")

        self.assertEqual(ticker.call_args.args, ("TEST",))
        self.assertEqual(result["available_periods"], [2024, 2025, 2026])
        self.assertEqual(result["latest_period"], 2026)
        self.assertEqual(result["earnings_quality"]["rating"], "Low")
        checks = {item["name"]: item for item in result["earnings_quality"]["checks"]}
        self.assertAlmostEqual(checks["Cash conversion"]["value"], 0.5)
        self.assertEqual(checks["Cash conversion"]["points"], 1)
        self.assertAlmostEqual(checks["Stock build-up"]["value"], 50 / 1200)
        ratios = {item["name"]: item for item in result["credit_ratios"]}
        self.assertEqual(ratios["Current ratio"]["value"], 2.0)
        self.assertEqual(ratios["Debt-to-equity"]["value"], 0.4)
        self.assertAlmostEqual(ratios["Interest coverage"]["value"], 18.0)
        self.assertEqual(len(result["history"]), 3)

    @patch("earnings_screener.yf.Ticker", return_value=FakeTicker())
    def test_invalid_ticker_is_rejected(self, ticker):
        """Malformed symbols should be rejected before the Yahoo client is called."""
        with self.assertRaises(ValueError):
            assess_ticker("../AAPL")
        ticker.assert_not_called()

    @patch("earnings_screener.yf.Ticker")
    def test_missing_revenue_has_a_clear_error(self, ticker):
        """A missing income statement should not produce a success-shaped empty report."""
        company = ticker.return_value
        company.get_income_stmt.return_value = pd.DataFrame()
        company.get_balance_sheet.return_value = pd.DataFrame()
        company.get_cashflow.return_value = pd.DataFrame()
        with self.assertRaisesRegex(ValueError, "did not return usable annual"):
            assess_ticker("AAPL")


if __name__ == "__main__":
    unittest.main()
