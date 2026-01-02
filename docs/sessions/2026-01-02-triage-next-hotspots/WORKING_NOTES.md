# Working Notes – Triage Next System Hotspots

- 2026-01-02 — Session created via `node tools/dev/session-init.js --slug "triage-next-hotspots" ...`

## Hotspot selection
- API contract drift risk: background tasks router 429 RateLimitError payload appears in two catch blocks.
- Ingestion robustness risk: Test Studio pulls `data/test-results/*.json` via `TestResultService.refreshFromDisk()`.

## Changes
- Refactored RateLimitError response payload into a shared helper in `src/api/routes/background-tasks.js`.
- Added deterministic checks:
	- `node checks/background-tasks.rate-limit.check.js`
	- `node checks/test-studio.refresh-from-disk.check.js`
- Added Jest coverage for Test Studio refresh-from-disk ingestion:
	- `tests/ui/testStudio/TestResultService.test.js` (new `refreshFromDisk` describe)

## Validation / Evidence

### Deterministic checks
- `node checks/background-tasks.rate-limit.check.js`
	- ✅ POST `/123/start` returns 429 + contract matches
	- ✅ POST `/actions/execute` returns 429 + contract matches
- `node checks/test-studio.refresh-from-disk.check.js`
	- ✅ Imports 1 run from `latest.json`
	- ✅ Skips invalid JSON + missing runId
	- ✅ Idempotent on second refresh

### Focused Jest runs
- `npm run test:by-path tests/server/api/background-tasks.test.js`
	- ✅ PASS (22 tests)
	- Artifact: `data/test-results/run-2026-01-02-105757819-9a480.json`
- `npm run test:by-path tests/ui/testStudio/TestResultService.test.js`
	- ✅ PASS (24 tests)
	- Artifact: `data/test-results/run-2026-01-02-105821711-60b10.json`

## Notes
- Observed repeated warning during Jest runs: `Warning: --localstorage-file was provided without a valid path`.
