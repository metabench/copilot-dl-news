# Working Notes – Lab 041: Batch vs Single SSE Transport

- 2025-12-21 — Added `--mode` to Lab 041 check and ran comparisons.

## Commands
- `node src/ui/lab/experiments/041-jsgui3-live-graph-perf/check.js --mode batch`
- `node src/ui/lab/experiments/041-jsgui3-live-graph-perf/check.js --mode single`

## Observations
- Batch run completes with far fewer SSE messages (`seq≈40`).
- Single run is ~1k messages (`seq≈1006`) but still completes within ~1.15s and stays within frame-time bounds with Canvas + rAF draining.
