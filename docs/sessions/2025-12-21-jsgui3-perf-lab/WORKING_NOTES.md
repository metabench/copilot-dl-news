# Working Notes – jsgui3 Live Update Performance Lab

## Goal
Get real evidence for whether jsgui3 SSR + jsgui3-client activation can sustain very high update rates (e.g., 1000 nodes/sec) without UI crashes.

## Lab created
- `src/ui/lab/experiments/041-jsgui3-live-graph-perf/`
	- `server.js`: jsgui3-server + `/events` SSE
	- `client.js`: Canvas renderer + requestAnimationFrame batching
	- `check.js`: Puppeteer check + PERF_SUMMARY capture

## Key technique
- Client uses an in-memory queue and drains up to `maxPerFrame` nodes per animation frame.
- This makes it possible to represent “1000 discovered nodes per second” while protecting frame time.

## Commands
- `node src/ui/lab/experiments/041-jsgui3-live-graph-perf/check.js`
- `node src/ui/lab/experiments/041-jsgui3-live-graph-perf/check.js --mode batch`
- `node src/ui/lab/experiments/041-jsgui3-live-graph-perf/check.js --mode single`
