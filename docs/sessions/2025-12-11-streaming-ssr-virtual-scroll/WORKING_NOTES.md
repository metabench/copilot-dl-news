# Working Notes – Streaming SSR + Virtual Scrolling

- 2025-12-11 — Session created via CLI.
- 2025-12-11 — Docs scan:
	- `docs/guides/JSGUI3_PERFORMANCE_PATTERNS.md` Pattern 4: Virtual Scrolling (render only viewport+buffer; threshold >1000 items; expected 90%+ improvement). Decision matrix covers size bands (<50 render all; 50–200 conditional; 200–1000 lazy; 1000+ virtual).
	- `docs/QUEUES_PAGE_OPTIMIZATION.md` notes streaming SSR for large queues/crawls (Oct 2025): stream table rows in chunks while browser begins activation immediately; references renderer `src/ui/express/views/queues/renderQueuesTable.js` and enhancer `src/ui/express/public/js/queues-enhancer.js`.
	- Session files initialized (PLAN/INDEX/etc.) now tracked in hub.
- 2025-12-11 — New lab harness 015 (streaming + virtual 2x2) added: `src/ui/lab/experiments/015-streaming-virtual-harness/check.js` (manifest updated). Metrics:
	- baseline (no streaming/virtual): rendered=2000, chunks=1, activationMs~0.087
	- streaming only: rendered=2000, chunks=10, activationMs~0.007 (more chunks, similar bytes)
	- virtual only: rendered=40, chunks=1, activationMs~0
	- streaming + virtual: rendered=40, chunks=1, activationMs~0
