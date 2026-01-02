# Working Notes – Lab Coverage Risk Review

- 2026-01-01 — Session created via CLI.
- Key nuance: “labs” live in multiple places.
	- Root `labs/` is small (e.g., batch clustering), but there is substantial UI “lab” coverage under `src/ui/lab/experiments/*` (e.g., SSE + RemoteObservable Labs 041–043).
- Initial gap inventory (UI servers with `server.js` but no co-located `checks/` or `__tests__/`):
	- analyticsHub, controlHarness, crawlerMonitor, crawlerProfiles, qualityDashboard, templateTeacher, testStudio, visualDiff
	- Important correction: several of these DO have tests elsewhere (e.g., `tests/ui/**`, `tests/server/**`). The gap is “co-location / discoverability”, not total absence.
- High-risk patterns observed while scanning:
	- Background task mutation routes (`src/api/routes/background-tasks.js`): many branches + special `RateLimitError` → 429 shape; worth a focused contract check.
	- Streaming/real-time: SSE + RemoteObservable + WebSocket exist across API + UI; proved in labs but still easy to regress (headers/heartbeats/cleanup/reconnect semantics).
	- Unified app iframe wiring + shared API paths: easy for route changes to break silently; benefits from smoke checks.

## Evidence runs (prove-it-works)

- Added smoke checks:
	- `checks/template-teacher.check.js`
	- `checks/control-harness.check.js`
- Tightened RateLimit contract assertions:
	- `tests/server/api/background-tasks.test.js` now asserts full 429 payload shape (`error.{code,message,retryAfter,context}`, top-level `retryAfter/context`, and `proposedActions[].{action,reason,description,severity,priority}`).

### Commands + results

- `node checks/template-teacher.check.js` → ✅ All 8 checks passed
- `node checks/control-harness.check.js` → ✅ All 6 checks passed
- `npm run test:by-path tests/server/api/background-tasks.test.js` → ✅ 1 suite passed (22 tests)
	- Test Studio artifact emitted: `data/test-results/run-2026-01-01-074305949-f0b85.json`
	- Note: saw `(node) Warning: --localstorage-file was provided without a valid path` during Jest startup; tests still passed.
