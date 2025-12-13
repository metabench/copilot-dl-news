# Follow Ups – Telemetry Setup Explainer + WLILO Diagram

- Align `/api/status` with the spec’s richer shape (or explicitly downgrade the spec to “minimum required”).
- Decide whether to keep `http.request` as a legacy alias (opt-in) or remove it entirely after downstream checks.
- Add a small “status contract snapshot” test that asserts stable keys and forbids removals (drift:query-budget / drift:decision-trace-shape style).
- Evaluate file-based JSONL tailing (`tmp/telemetry/*.jsonl`) for externally-started servers.
