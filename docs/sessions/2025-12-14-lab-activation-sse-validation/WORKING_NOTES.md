# Working Notes – Lab validation: activation + MVVM + SSE

- 2025-12-14 — Session created via CLI. Add incremental notes here.

## Evidence

- Ran lab checks:
	- `node src/ui/lab/experiments/025-mvvm-bindings-library/check.js` ✅
	- `node src/ui/lab/experiments/026-activation-contract-lab/check.js` ✅
	- `node src/ui/lab/experiments/027-progressbar-sse-telemetry/check.js` ✅
	- `node src/ui/lab/experiments/028-jsgui3-server-sse-telemetry/check.js` ✅

## Notes

- Labs 027/028 pass but emit console noise like `Missing context.map_Controls ... using generic Control` and repeated `&&& no corresponding control` messages during activation; consider tightening activation/registration to reduce noise if it becomes confusing.
