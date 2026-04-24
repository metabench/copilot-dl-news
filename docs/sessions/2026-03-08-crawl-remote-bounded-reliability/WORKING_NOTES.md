# Working Notes – Crawl Remote Bounded Reliability

- 2026-03-08 — Session created via CLI. Add incremental notes here.
- 2026-03-08 — Reproduced operator pain directly against Oracle multi-domain server: `POST /api/crawl/start` launched only the first 5 domains, and the second wave never started.
- 2026-03-08 — Root cause in `multi-domain-server.js`: orchestrator only scheduled idle domains when `pending > 0`, but idle workers are PM2 stubs with zero pending before startup. Secondary bug: concurrency check used a constant `currentRunning`, which would over-schedule once the first bug was fixed.
- 2026-03-08 — Additional usability issue: per-domain stats became empty after status files aged out, making completed bounded runs hard to inspect.
- 2026-03-08 — Planned fix set: extract scheduler helpers, preserve last known domain status until next start, add `crawl-remote.js bounded` command with explicit start/wait/timeout behavior, and cover the regression with a focused Jest test.
