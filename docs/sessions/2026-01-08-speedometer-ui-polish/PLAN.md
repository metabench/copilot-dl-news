# Plan – Speedometer errors + queue UI polish

## Objective
Log crawl errors to DB and expose clearer UI state for speedometer app

## Done When
- [ ] Key deliverables are complete and documented in `SESSION_SUMMARY.md`.
- [ ] Tests and validations (if any) are captured in `WORKING_NOTES.md`.
- [ ] Follow-ups are recorded in `FOLLOW_UPS.md`.

## Change Set (initial sketch)
- [labs/distributed-crawl/speedometer-app.js](labs/distributed-crawl/speedometer-app.js): UI markup/CSS/JS for dashboard, SSE handling, error list, queue rendering.
- [tools/dev/task-events.js](tools/dev/task-events.js) (read-only for validation tooling if needed).
- Docs: update `WORKING_NOTES.md` with decisions/validation; summarize in `SESSION_SUMMARY.md`.

## Plan (UI polish + observability)
1) Error surfacing
	- Add severity badges + status code chips in the errors panel; include host/path fragment for quick triage.
	- Make error URLs copy-to-clipboard on click with tiny “copied” hint.
	- Expose a manual “refresh errors” control calling `/errors?limit=50` (backed by existing TaskEventWriter logs) and auto-refresh every 30–60s when connected.
2) Queue clarity
	- Add a compact legend for queue colors (queued/in-progress/done/error) and a toggle to sort view: “live order” (current) vs “status-first” (in-progress → queued → done/error).
	- Add hover tooltips on queue items showing full URL and last status code.
3) Progress framing
	- Show batch index + remaining count near the speedometer (e.g., “Batch 3 • 75 remaining”).
	- Add hover tooltip on the gauge with last batch stats (ok/errors/avg ms/throughput window).
4) Responsiveness/visibility
	- Collapse stat cards to 2-column on narrow screens; reduce chart height slightly so errors panel stays visible without scrolling.
	- Add SSE status badge (connected/disconnected + last event time) near the header.
5) Log hygiene
	- Add quick filters in the log panel (All | Errors | Batches) and fade older entries to highlight fresh ones.
6) Empty/CTA states
	- Improve empty queue/error copy with a CTA (“Start all queued URLs”) and show auto-start pending state when applicable.
7) Keyboard affordances
	- Add keyboard shortcuts: “s” to start default (20), “x” to stop; render a small hint bar.

## Risks & Mitigations
- CSS/JS bloat in single file: keep changes scoped, reuse existing styles, avoid large new dependencies.
- Event spam from frequent auto-refresh: throttle errors refresh (>=30s) and debounce SSE error inserts.
- Copy interactions in Electron: ensure `navigator.clipboard` fallback (document.execCommand) if unavailable.

## Tests / Validation
- Manual: launch `npx electron labs/distributed-crawl/speedometer-app.js`, start a crawl, induce an error (bad URL) and confirm:
  - Errors panel shows severity badge, status, host/path, copy hint works.
  - Queue legend/toggle and tooltips render correctly; batch/remaining label updates per batch.
  - SSE status badge updates on disconnect/reconnect.
- CLI spot-check: `node tools/dev/task-events.js --problems --limit 20` (or electron runtime) shows new error rows for task_type `distributed-crawl`.
