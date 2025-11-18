# Plan: jsgui-forward

Objective: Ship the next round of jsgui UI upgrades (control registry hardening, Diagram Atlas telemetry-aware refresh, Data Explorer shared state) so SSR + hydration stay aligned with the Singularity workflow expectations.

Done when:
- Every server-rendered page seeds the control registry and client bundles activate without the manual fallback path.
- Diagram Atlas exposes refresh/state telemetry so the UI reports CLI progress instead of a binary loading spinner.
- URL/Data Explorer views share a lightweight listing state store, keeping toggles, tables, diagnostics, and pagers synchronized after `/api/urls` calls.
- Regression checks/tests (`diagramAtlas.check`, `dataExplorer.check`, targeted Jest suites) pass with the new flows documented.
- Session notes + /docs/agi references capture the workflow so future agents can repeat it.

Change set:
- `src/ui/server/diagramAtlasServer.js`, `src/ui/render-url-table.js`, `src/ui/server/dataExplorerServer.js`
- `src/ui/client/index.js`, `src/ui/controls/**`, new helper modules under `src/ui/controls/helpers/`
- Docs: `docs/JSGUI3_PATTERNS_ANALYSIS.md`, `docs/ANALYSIS_PAGE_ISSUES.md` (or new UI-focused notes), `docs/agi/WORKFLOWS.md`, session files.

Risks/assumptions:
- Removing the manual fallback too early could break activation if any page forgets to seed control maps—need discovery to enumerate all SSR entry points first.
- Diagram Atlas CLI refresh currently runs as a blocking child process with no intermediate state; may require a best-effort status endpoint before UI polish.
- The shared listing state must not introduce client-only persistence that drifts from SSR output; keep it derived from API payloads.

Tests:
- `node src/ui/server/checks/diagramAtlas.check.js`
- `node src/ui/server/checks/dataExplorer.check.js`
- `npm run test:by-path tests/ui/server/dataExplorerServer.test.js`
- `npm run test:by-path tests/ui/server/dataExplorerServer.production.test.js`
- Add/extend targeted client binding tests (if available) or smoke via `npm run gui`

Docs to update:
- This session folder (PLAN, WORKING_NOTES, summary)
- `docs/sessions/SESSIONS_HUB.md` entry linking to this effort
- `/docs/agi/WORKFLOWS.md` (UI remediation workflow) + `docs/JSGUI3_PATTERNS_ANALYSIS.md` with the new registry/state guidance

## Current Focus (2025-11-17)

1. Finalize the Diagram Atlas + listing store extraction write-up in this session folder and cite the helper modules inside `docs/CHANGE_PLAN.md` and `/docs/agi/WORKFLOWS.md`.
2. Run UI sanity checks:
	- `node src/ui/server/checks/diagramAtlas.check.js`
	- `node src/ui/server/checks/dataExplorer.check.js`
3. Re-run the production + dev Data Explorer Jest suites:
	- `npm run test:by-path tests/ui/server/dataExplorerServer.test.js`
	- `npm run test:by-path tests/ui/server/dataExplorerServer.production.test.js`
4. Capture any regressions + fixes in `src/ui/client/index.js`, `src/ui/client/diagramAtlas.js`, or the listing store helpers with targeted unit tests if needed.
5. Close the session with a WORKING_NOTES + SESSION_SUMMARY update once checks/tests pass, then reflect the workflow in `/docs/agi/journal/`.
6. Begin Phase 4 of `docs/CLIENT_MODULARIZATION_PLAN.md` by extracting the job list rendering + SSE wiring from `src/ui/client/index.js` into dedicated factories so the entry file stays orchestration-only; keep Diagram Atlas/listing store tests handy while iterating.
