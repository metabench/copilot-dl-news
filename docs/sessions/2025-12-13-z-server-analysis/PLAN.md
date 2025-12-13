# Plan – z-server analysis

## Objective
Analyze z-server build/run surface and identify issues + mitigation options

## Done When
- [x] Key deliverables are complete and documented in `SESSION_SUMMARY.md`.
- [x] Evidence links and file references are captured in `WORKING_NOTES.md`.
- [x] Follow-ups are recorded in `FOLLOW_UPS.md`.

## Change Set (initial sketch)
- docs/sessions/2025-12-13-z-server-analysis/PLAN.md
- docs/sessions/2025-12-13-z-server-analysis/WORKING_NOTES.md
- docs/sessions/2025-12-13-z-server-analysis/SESSION_SUMMARY.md
- docs/sessions/2025-12-13-z-server-analysis/FOLLOW_UPS.md
- docs/sessions/2025-12-13-z-server-analysis/DECISIONS.md

## Risks & Mitigations
- Risk: "analysis" drifts into an unbounded refactor.
	- Mitigation: keep remediation as scoped options; identify smallest high-ROI changes and the contract boundary they affect (IPC + process management).
- Risk: Windows-only process inspection (`wmic`, `tasklist`) becomes brittle/unsupported.
	- Mitigation: prefer cross-platform sources (`ps-list`) and add a Windows fallback using PowerShell CIM only when needed.

## Tests / Validation
- Evidence for this session is code-level inspection plus existing tests:
	- z-server unit parsing tests: z-server/tests/unit/serverDetector.test.js
	- repo-level telemetry helper tests: tests/z-server/telemetryJsonl.test.js
	- z-server E2E test cleanup logic: z-server/tests/e2e/app.e2e.test.js
