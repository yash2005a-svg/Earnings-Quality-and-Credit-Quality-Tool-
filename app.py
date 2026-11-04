"""Small local Flask server for trying the Vercel-ready frontend on your computer."""

from flask import Flask, jsonify, request, send_from_directory  # Serves the UI and its JSON API locally.

from api.assessment import build_assessment_payload  # Keeps local and deployed API behavior consistent.


app = Flask(__name__, static_folder="public", static_url_path="")


@app.get("/")
def home():
    """Serve the dashboard's main HTML page."""
    return send_from_directory(app.static_folder, "index.html")


@app.post("/api/assessment")
def assessment_endpoint():
    """Validate a ticker request and return its Yahoo Finance assessment."""
    payload = request.get_json(silent=True)
    try:
        return jsonify(build_assessment_payload(payload))
    except ValueError as error:
        return jsonify({"error": str(error)}), 400


if __name__ == "__main__":
    # Debug mode stays off so this local convenience server behaves safely by default.
    app.run(host="127.0.0.1", port=5000, debug=False)
