# Session Summary – Lab 041: Batch vs Single SSE Transport

## Accomplishments
- Extended Lab 041 to support and report `--mode batch|single` in the headless Puppeteer check.
- Client now consumes the server-sent `config` payload so the UI reflects the actual run parameters.
- Added extra experiment knobs: `--batch-size` (chunk batched messages) and `--payload-bytes` (inflate node payloads).

## Metrics / Evidence
- Ran:
	- `node src/ui/lab/experiments/041-jsgui3-live-graph-perf/check.js --mode batch`
	- `node src/ui/lab/experiments/041-jsgui3-live-graph-perf/check.js --mode single`

- Results (1000 nodes in 1000ms, tick=20ms, maxPerFrame=120):
	- Batch:
		- Server emitted `done` at `seq=40` (few messages)
		- `received=1000`, `applied=1000`, `firstNodeMs=141`, `finishedMs=1122`, `maxFrameMs=0`
	- Single:
		- Server emitted `done` at `seq=1006` (~1000 messages)
		- `received=1000`, `applied=1000`, `firstNodeMs=162`, `finishedMs=1152`, `maxFrameMs=0`

Interpretation: at this scale, both transports are viable with Canvas + rAF draining; single-message overhead is visible in message count, but not yet in frame-time or completion-time.

## Decisions
- Prefer batched SSE messages by default for real imports/telemetry; it preserves headroom as payload sizes and update rates grow.

## Next Steps
- Stress transport overhead:
	- `--mode single --payload-bytes 256` vs `--mode batch --payload-bytes 256`.
	- Increase volume: `--nodes 10000 --ms 5000` (and optionally `--tick 10`).
- Explore batch sizing sweet spots:
	- `--mode batch --batch-size 10|50|200` (measures per-message overhead vs latency).
- Add renderer comparison:
	- DOM/SVG variant (for “pretty graph”) to find when Canvas becomes mandatory.
