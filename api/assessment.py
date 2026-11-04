"""Vercel Python API endpoint for ticker-based financial assessments."""

import json  # Encodes API responses and decodes the JSON sent by the browser.
import re  # Checks ticker symbols before starting financial-data requests.
from concurrent.futures import ThreadPoolExecutor, as_completed  # Fetches company reports concurrently.
from http.server import BaseHTTPRequestHandler  # Provides Vercel's Python request-handler interface.

from earnings_screener import assess_ticker  # Reuses the same assessment logic as the CLI.

MAX_TICKERS = 5


def build_assessment_payload(payload, assessor=None):
    """Validate up to five tickers and return successful reports plus per-ticker errors."""
    if not isinstance(payload, dict):
        raise ValueError("Send a JSON object with a ticker or tickers field.")
    raw_tickers = payload.get("tickers", payload.get("ticker"))
    if isinstance(raw_tickers, str):
        requested = raw_tickers.split(",")
    elif isinstance(raw_tickers, list) and all(isinstance(item, str) for item in raw_tickers):
        requested = raw_tickers
    else:
        raise ValueError("Enter one or more ticker symbols, separated by commas.")

    tickers = list(dict.fromkeys(item.strip().upper() for item in requested if item.strip()))
    if not tickers:
        raise ValueError("Enter at least one ticker symbol.")
    if len(tickers) > MAX_TICKERS:
        raise ValueError(f"Compare up to {MAX_TICKERS} companies at a time.")
    invalid = [item for item in tickers if not re.fullmatch(r"[A-Z0-9.^=_-]{1,20}", item)]
    if invalid:
        raise ValueError(f"Invalid ticker symbol(s): {', '.join(invalid)}.")

    reports = {}
    failures = []
    with ThreadPoolExecutor(max_workers=len(tickers)) as executor:
        run_assessment = assessor or assess_ticker
        jobs = {executor.submit(run_assessment, item): item for item in tickers}
        for job in as_completed(jobs):
            ticker = jobs[job]
            try:
                reports[ticker] = job.result()
            except ValueError as error:
                failures.append({"ticker": ticker, "error": str(error)})

    if not reports:
        details = "; ".join(f"{item['ticker']}: {item['error']}" for item in failures)
        raise ValueError(f"No companies could be assessed. {details}")

    return {
        "assessments": [reports[ticker] for ticker in tickers if ticker in reports],
        "failures": failures,
    }


class handler(BaseHTTPRequestHandler):
    """Accept POST /api/assessment requests and return JSON assessment results."""

    def do_POST(self):
        """Parse the ticker request and return its annual earnings and credit ratios."""
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            self._send_json(400, {"error": "Invalid request length."})
            return
        if length <= 0 or length > 16_384:
            self._send_json(400, {"error": "Send a JSON request smaller than 16 KB."})
            return

        try:
            payload = json.loads(self.rfile.read(length))
            result = build_assessment_payload(payload)
        except (json.JSONDecodeError, UnicodeDecodeError, ValueError) as error:
            self._send_json(400, {"error": str(error)})
            return
        self._send_json(200, result)

    def _send_json(self, status, payload):
        """Write a JSON response with headers suitable for the same-origin frontend."""
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)
