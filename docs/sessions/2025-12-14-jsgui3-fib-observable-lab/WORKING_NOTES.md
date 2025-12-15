# Working Notes

## What shipped

- Implemented Experiment 024 using:
	- Server-side `fnl.observable` Fibonacci generator on a 330ms timer
	- SSE publisher (`text/event-stream`) for subscription
	- jsgui3 client that updates `data.model` on tick; mirrors to `view.data.model` and renders

## Commands / Evidence

- Ran deterministic check:
	- `node src/ui/lab/experiments/024-fib-observable-mvvm/check.js`
	- Result: ✅ SSR ok, bundles ok, activation ok, index reached ≥ 5, and value matched `fib(index)`

- Verified manifest JSON parses:
	- `node -e "const fs=require('fs'); JSON.parse(fs.readFileSync('src/ui/lab/manifest.json','utf8')); console.log('manifest ok');"`

## Notes

- SSE is hosted on a separate ephemeral port from the jsgui3 server; CORS is enabled on the SSE response.
- Browser console still shows some generic-control warnings during activation; checks avoid relying on control instances.
# Working Notes – jsgui3 Fibonacci Observable MVVM Lab

- 2025-12-14 — Session created via CLI. Add incremental notes here.
