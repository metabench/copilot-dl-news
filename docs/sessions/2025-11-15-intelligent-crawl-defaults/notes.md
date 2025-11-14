# Session Notes — Intelligent Crawl Defaults (2025-11-15)

## Objective
Restore “intelligent crawl” usefulness by letting capped runs download article content by default, while preserving the structure-only workflow as an explicit opt-in.

## Actions
- Added `--hub-exclusive` flag to `tools/intelligent-crawl.js` so structure-only hub auditing remains available when needed.
- Retuned the script’s defaults to allow article downloads (structure-only toggles now gated by the new flag).
- Documented the new behavior in `README.md` and `tools/README.md` so operators know how to switch modes.
- Filtered country hub predictions using the crawl database’s HTTP history so known 404 endpoints are skipped before they hit the queue, and taught the fetch pipeline to treat 404/410 results as non-fatal (no host lock, no crawl abort).

## Follow-ups
- Monitor the next capped crawl for download counts to validate that 100 pages are reached before planner exhaustion.
- Consider surfacing the same toggle in the UI preset if operators request it.
