# Follow Ups – UI Data Explorer

- Add lightweight integration tests (supertest) to cover `/crawls` and `/errors` responses once we have a seeded test DB. (`/urls/:id` + `/domains/:host` now covered via in-memory fixtures.)
- Consider an additional summary for recent article/compression stats so operators can inspect payload sizes without dumping HTML.
- Implement the `/urls/:id` detail route with descending fetch history, sparkline control, and metadata cards. ✅ (Shipped with sparkline + breadcrumbs; keep iterating on UI polish.)
- Design and stub the proposed jsgui3 controls (Sparkline, Timeline, Badge, CardGrid, JsonBlock) with snapshot coverage.
- Build router/service modules so each view’s SQL access stays isolated and easier to test.
- Refresh the anonymized `baseline` snapshot (and `data/news.db`) so `articles`, `errors.url`, and `crawl_jobs.url` exist, unblocking the remaining benchmark stats and the `domains.top_hosts_window` worker task.
- Enhance `scripts/perf/ui-aggregates-bench.js` to emit PASS/WARN/FAIL labels automatically once per-stat thresholds move into code instead of Markdown.
- Investigate why `src/ui/render-url-table.js` references `buildIndexCell` without importing/defining it; requiring the server module now throws at load time even though the Express entry point itself parses cleanly.
