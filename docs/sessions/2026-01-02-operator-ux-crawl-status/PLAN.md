# Plan – Operator UX: Crawl Status & Errors

## Objective
Make crawl problems reliably visible in the Unified UI and z-server workflow.

## Done When
- [x] Unified UI exposes a single “crawl summary” source of truth for operators.
- [x] Home panel surfaces crawl health + last error (with safe fallbacks).
- [x] Deterministic server check validates the new contract.
- [x] Session summary + evidence captured.

## Change Set (initial sketch)
- `src/ui/server/unifiedApp/server.js` (add `/api/crawl/summary`; fix scheduler module placement)
- `src/ui/server/unifiedApp/subApps/registry.js` (home panel placeholders)
- `src/ui/server/unifiedApp/views/UnifiedShell.js` (home panel activator fetch + display)
- `src/ui/server/unifiedApp/checks/unified.server.check.js` (probe `/api/crawl/summary`)
- (Optional) `src/ui/server/unifiedApp/checks/api.check.js` (extra assertions when running a live server)

## Risks & Mitigations
- Risk: UI becomes noisy / alarming on transient errors.
	- Mitigation: show only the most recent error event; keep UI compact; provide a link to Crawl Status for details.
- Risk: Endpoint fails when telemetry/job registry unavailable.
	- Mitigation: endpoint returns stable `{status:'ok', ...}` shape and uses defensive null checks.

## Tests / Validation
- `node src/ui/server/unifiedApp/checks/unified.server.check.js`
