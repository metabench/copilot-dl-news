# Plan – Analysis Backfill Observable with Electron UI

## Objective
Create observable-wrapped analysis backfill with Electron progress UI, stats tracking, and e2e testing

## Done When
- [x] Old analysis tasks abandoned with `obsolete_analysis_version` reason
- [x] Observable wrapper for `analysePages` with progress streaming
- [x] Express server with SSE endpoint for real-time updates
- [x] Electron app for desktop progress monitoring
- [x] Bytes/records per second stats tracking with rolling windows
- [x] E2E test fixtures with limit=5 for validation
- [x] Book chapter 19 on rerunning analysis
- [x] AGENTS.md updated with Electron apps guidance

## Change Set
- `labs/analysis-observable/` — New lab directory:
  - `README.md` — Architecture and usage docs
  - `analysis-observable.js` — Core observable wrapper
  - `analysis-server.js` — Express SSE server
  - `electron-main.js` — Electron app entry
  - `public/index.html` — Progress display UI
  - `public/app.js` — Client-side SSE consumer
  - `run-lab.js` — CLI entry point
  - `e2e-test.js` — E2E test with limit 5
- `docs/sessions/2026-01-04-gazetteer-progress-ui/book/chapters/19-rerunning-analysis.md` — New book chapter
- `docs/sessions/2026-01-04-gazetteer-progress-ui/book/README.md` — Updated TOC
- `AGENTS.md` — Added Electron apps for long-running processes section

## Risks & Mitigations
- **Risk**: Observable events may not align with actual `analysePages` progress
  - **Mitigation**: E2E test validates event emission
- **Risk**: Electron app may not find correct electron binary path
  - **Mitigation**: Fallback to browser mode documented

## Tests / Validation
- Run `node labs/analysis-observable/e2e-test.js` to validate:
  - Observable events are emitted (>= 2 events)
  - Complete event is received
  - Bytes tracking is present
  - Records/sec tracking is present
  - SSE streaming works correctly

## Next Steps
- Run the e2e test to verify everything works
- Consider adding npm scripts for the lab
- Add more sophisticated ETA calculation based on page complexity
