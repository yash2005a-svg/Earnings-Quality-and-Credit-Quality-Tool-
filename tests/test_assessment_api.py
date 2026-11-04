"""Tests for multi-company API validation and partial assessment results."""

import unittest  # Runs the API checks with the Python standard library.
from unittest.mock import Mock, patch  # Replaces data requests with deterministic results.

from api.assessment import build_assessment_payload
from app import app


class AssessmentApiTests(unittest.TestCase):
    """Verify batch ticker requests and local HTTP response behavior."""

    def test_multiple_tickers_are_assessed_and_returned_in_input_order(self):
        assessor = Mock(side_effect=lambda ticker: {"ticker": ticker})

        payload = build_assessment_payload({"tickers": ["msft", "AAPL", "MSFT"]}, assessor)

        self.assertEqual([report["ticker"] for report in payload["assessments"]], ["MSFT", "AAPL"])
        self.assertEqual(payload["failures"], [])
        self.assertEqual(assessor.call_count, 2)

    def test_one_unavailable_ticker_does_not_hide_other_company_results(self):
        def assess(ticker):
            if ticker == "MISSING":
                raise ValueError("No annual statements found.")
            return {"ticker": ticker}

        payload = build_assessment_payload({"tickers": ["AAPL", "MISSING"]}, assess)

        self.assertEqual([report["ticker"] for report in payload["assessments"]], ["AAPL"])
        self.assertEqual(payload["failures"][0]["ticker"], "MISSING")

    def test_more_than_five_tickers_are_rejected(self):
        with self.assertRaisesRegex(ValueError, "up to 5"):
            build_assessment_payload({"tickers": ["A", "B", "C", "D", "E", "F"]}, Mock())

    def test_local_api_returns_json_errors_for_invalid_requests(self):
        client = app.test_client()

        response = client.post("/api/assessment", json={"tickers": ["bad/ticker"]})

        self.assertEqual(response.status_code, 400)
        self.assertIn("error", response.get_json())

    @patch("api.assessment.assess_ticker", side_effect=lambda ticker: {"ticker": ticker})
    def test_local_api_returns_comparison_payload(self, assessor):
        client = app.test_client()

        response = client.post("/api/assessment", json={"tickers": ["AAPL", "MSFT"]})

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            [report["ticker"] for report in response.get_json()["assessments"]],
            ["AAPL", "MSFT"],
        )
        self.assertEqual(assessor.call_count, 2)


if __name__ == "__main__":
    unittest.main()
