# Lab 041 — jsgui3 Live Graph Performance

This lab measures how well `jsgui3-server` (SSR) + `jsgui3-client` (activation) can sustain high-rate incremental updates (e.g., 1000 nodes/sec) while rendering a small graph-like view.

It is deliberately scoped to a **limited amount of data** and uses **batching + requestAnimationFrame draining** to avoid UI crashes.

## What it does
- Serves a jsgui3 page (`perf_graph_page`) that contains a demo control (`perf_graph_demo`).
- The server streams node discovery events over SSE (`/events`).
- The browser buffers updates in a queue and applies them in bounded batches each animation frame.
- Rendering is done with Canvas (fast path).

## Run the lab check

```powershell
node src/ui/lab/experiments/041-jsgui3-live-graph-perf/check.js
```

### Compare transport modes (recommended)

```powershell
# Batched arrays per SSE message
node src/ui/lab/experiments/041-jsgui3-live-graph-perf/check.js --mode batch

# One message per node
node src/ui/lab/experiments/041-jsgui3-live-graph-perf/check.js --mode single
```

The check prints a single-line `CHECK_RESULT {...}` JSON blob you can paste into session docs.

## Tuning
The server defaults to:
- `nodes=1000`
- `ms=1000`
- `tick=20`
- `mode=batch` (SSE sends arrays)

You can change these via check flags:

- `--nodes 1000`
- `--ms 1000`
- `--tick 20`
- `--mode batch|single`

Additional experiment knobs:
- `--batch-size 0` (batch mode only; `0` means “send all nodes discovered this tick in one message”)
- `--payload-bytes 0` (adds a `label` string of this size to each node)

## Output
The browser emits a `PERF_SUMMARY {...}` line to console when it finishes; the check asserts:
- SSR works, bundles are reachable
- Activation occurs
- All nodes are received + applied
- No page errors
- Frame time stays within a loose bound
