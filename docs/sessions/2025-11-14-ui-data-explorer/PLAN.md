# Plan – UI Data Explorer

## Objective
Deliver the next UI explorer slice by finishing the URL detail drilldown, adding the first domain view, and locking regression tests/benchmarks so future control work can proceed safely.

## Done When
- [ ] `/urls/:id` renders download history + sparkline with breadcrumb/back-link and has SuperTest coverage (HTML + JSON download redirect).
- [ ] A domain drilldown route (e.g., `/domains/:host`) exposes host summary cards + recent URLs/downloads and the `/urls` table links into it.
- [ ] Aggregate benchmark harness (`scripts/perf/ui-aggregates-bench.js`) runs cleanly against the refreshed baseline snapshot and reports go into `docs/sessions/...`.
- [ ] Session docs (plan + notes + follow-ups) describe the shipped views, known gaps, and required tooling follow-ups.

## Change Set
1. **Phase 2A – URL detail polish**: finalize `/urls/:id` layout (breadcrumbs, download table tweaks), add redirect for `/urls/:id/downloads`, and land route-level tests + sparkline control coverage.
2. **Phase 2B – Domain drilldowns**: introduce new DB query helpers (host summary + recent URLs/fetches), server route + renderer wiring, and table navigation from `/urls` to `/domains/:host`.
3. **Phase 2C – Bench + docs**: keep aggregate harness green, capture perf snapshots, and note future view work (crawls/errors/queues) in FOLLOW_UPS.
4. **Cross-cutting**: maintain renderer nav/link patterns, ensure views stay read-only, and document new controls/components.

## Tests / Validation
- Add Jest + SuperTest coverage for `/urls/:id` (sparkline presence, table rows, redirect) and any new domain route helpers.
- Re-run `scripts/perf/ui-aggregates-bench.js --snapshot baseline` after schema/data refresh; commit/report timings.
- Manual verification via HTTP for `/urls`, `/urls/:id`, `/domains`, and new routes, keeping HTML outputs sanitized (no raw article bodies).
