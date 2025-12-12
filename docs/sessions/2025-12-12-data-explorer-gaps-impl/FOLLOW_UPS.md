# Follow Ups – Data Explorer gaps: plan + first implementation

- Add an optional micro-benchmark script to compare old per-host counts vs batched counts on 50 hosts (record results, keep script or delete).
- Extend `/api/domains/counts` test coverage to include the 50-host cap behavior.
- Add consistent URL/Domains filters (classification, status, time window) with URL-shareable query strings.
- Add crawl/job drilldown pages backed by `src/db/sqlite/v1/queries/ui/crawls.js` (+ new query modules as needed).
- Replace `/api/events` stub with real SSE stream (source from crawl events or telemetry) with supertest validation.
