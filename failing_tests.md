# Failing Tests (from test-log-history)

Generated via `node tests/test-log-history.js --json --limit-logs 200` on 2025-12-10 (JSON now includes `retiredFailing`). The tool scans existing `testlogs/` chronologically and reports test files that are still failing in the most recent logs it sees. Updated after re-running `tests/tools/__tests__/js-scan.test.js` (now resolved in logs).

Updates on 2025-12-10:
- Added retirement handling to `tests/test-log-history.js` (auto-ignores deprecated suites older than 14 days; default pattern `/deprecated-ui/`).
- Updated `jest.careful.config.js` to skip `src/deprecated-ui/**` and `tests/deprecated-ui/**` so deprecated suites do not run in careful mode.

## Active failing tests
- [src/crawler/__tests__/phase-123-integration.test.js](src/crawler/__tests__/phase-123-integration.test.js) — failingCount: 4/9 (latest log: 2025-12-03T07:07:07.922Z_ALL.log)
- [src/crawler/__tests__/deepUrlAnalysis.test.js](src/crawler/__tests__/deepUrlAnalysis.test.js) — failingCount: 1/2 (latest log: 2025-12-03T07:07:07.922Z_ALL.log)
- [src/crawler/__tests__/AdaptiveExplorer.test.js](src/crawler/__tests__/AdaptiveExplorer.test.js) — failingCount: 1/26 (latest log: 2025-12-03T07:07:07.922Z_ALL.log)
- [src/crawler/__tests__/placeHubs.data.test.js](src/crawler/__tests__/placeHubs.data.test.js) — failingCount: 2/2 (latest log: 2025-12-03T07:07:07.922Z_ALL.log)
- [src/crawler/__tests__/OsmBoundaryIngestor.test.js](src/crawler/__tests__/OsmBoundaryIngestor.test.js) — failingCount: 1/1 (latest log: 2025-12-03T07:07:07.922Z_ALL.log)
- [src/db/migration/__tests__/orchestrator.test.js](src/db/migration/__tests__/orchestrator.test.js) — failingCount: 1/14 (latest log: 2025-10-31T04-24-33-403Z_ALL.log)
- [src/tools/__tests__/populate-gazetteer.test.js](src/tools/__tests__/populate-gazetteer.test.js) — failingCount: 2/2 (latest log: 2025-10-31T04-24-33-403Z_ALL.log)
- [src/db/migration/__tests__/validator.test.js](src/db/migration/__tests__/validator.test.js) — failingCount: 3/10 (latest log: 2025-10-31T04-24-33-403Z_ALL.log)
- [src/tools/__tests__/export-gazetteer.test.js](src/tools/__tests__/export-gazetteer.test.js) — failingCount: 1/2 (latest log: 2025-10-31T04-24-33-403Z_ALL.log)
- [src/tools/__tests__/guess-place-hubs.test.js](src/tools/__tests__/guess-place-hubs.test.js) — failingCount: 4/4 (latest log: 2025-10-31T04-24-33-403Z_ALL.log)
- [src/tools/__tests__/find-place-hubs.test.js](src/tools/__tests__/find-place-hubs.test.js) — failingCount: 2/2 (latest log: 2025-10-31T04-24-33-403Z_ALL.log)
- [src/__tests__/db.latest_fetch.test.js](src/__tests__/db.latest_fetch.test.js) — failingCount: 1/1 (latest log: 2025-10-31T04-24-33-403Z_ALL.log)
- [src/utils/__tests__/bucketCache.test.js](src/utils/__tests__/bucketCache.test.js) — failingCount: 19/19 (latest log: 2025-10-31T04-24-33-403Z_ALL.log)
- [src/tools/__tests__/analysis-run.logging.test.js](src/tools/__tests__/analysis-run.logging.test.js) — failingCount: 1/1 (latest log: 2025-10-31T04-24-33-403Z_ALL.log)
- [tests/e2e-features/geography-crawl/startup-and-telemetry.test.js](tests/e2e-features/geography-crawl/startup-and-telemetry.test.js) — failingCount: 1/1 (latest log: 2025-10-20T20-55-52-588Z_ALL.log)
- [tests/e2e-features/telemetry-flow/preparation-stages.test.js](tests/e2e-features/telemetry-flow/preparation-stages.test.js) — failingCount: 1/1 (latest log: 2025-10-20T20-55-52-588Z_ALL.log)

## Retired (deprecated >14 days; ignored going forward)
- [src/deprecated-ui/express/__tests__/geography.crawl.e2e.test.js](src/deprecated-ui/express/__tests__/geography.crawl.e2e.test.js) — failingCount: 2/6 (latest log: 2025-10-20T20-55-52-588Z_ALL.log)
- [src/deprecated-ui/express/__tests__/urls.test.js](src/deprecated-ui/express/__tests__/urls.test.js) — failingCount: 3/4 (latest log: 2025-10-20T20-55-52-588Z_ALL.log)
- [src/deprecated-ui/express/__tests__/health-metrics.api.test.js](src/deprecated-ui/express/__tests__/health-metrics.api.test.js) — failingCount: 2/5 (latest log: 2025-10-20T20-55-52-588Z_ALL.log)
- [src/deprecated-ui/express/__tests__/analysis.new-apis.test.js](src/deprecated-ui/express/__tests__/analysis.new-apis.test.js) — failingCount: 1/13 (latest log: 2025-10-20T20-55-52-588Z_ALL.log)
- [src/deprecated-ui/express/__tests__/resume-all.api.test.js](src/deprecated-ui/express/__tests__/resume-all.api.test.js) — failingCount: 11/11 (latest log: 2025-10-20T20-55-52-588Z_ALL.log)
- [src/deprecated-ui/express/__tests__/recent-domains.api.test.js](src/deprecated-ui/express/__tests__/recent-domains.api.test.js) — failingCount: 1/3 (latest log: 2025-10-20T20-55-52-588Z_ALL.log)
- [src/deprecated-ui/express/__tests__/analysis.api.ssr.test.js](src/deprecated-ui/express/__tests__/analysis.api.ssr.test.js) — failingCount: 1/3 (latest log: 2025-10-20T20-55-52-588Z_ALL.log)
- [src/deprecated-ui/express/__tests__/queues.ssr.http.test.js](src/deprecated-ui/express/__tests__/queues.ssr.http.test.js) — failingCount: 3/4 (latest log: 2025-10-20T20-55-52-588Z_ALL.log)
- [src/deprecated-ui/express/__tests__/gazetteer.api.test.js](src/deprecated-ui/express/__tests__/gazetteer.api.test.js) — failingCount: 8/8 (latest log: 2025-10-20T20-55-52-588Z_ALL.log)
- [src/deprecated-ui/express/__tests__/gazetteer.kind.storage.http.test.js](src/deprecated-ui/express/__tests__/gazetteer.kind.storage.http.test.js) — failingCount: 2/2 (latest log: 2025-10-20T20-55-52-588Z_ALL.log)
- [src/deprecated-ui/express/__tests__/gazetteer.country.storage.http.test.js](src/deprecated-ui/express/__tests__/gazetteer.country.storage.http.test.js) — failingCount: 3/3 (latest log: 2025-10-20T20-55-52-588Z_ALL.log)
- [src/deprecated-ui/express/__tests__/gazetteer.places.pager.storage.http.test.js](src/deprecated-ui/express/__tests__/gazetteer.places.pager.storage.http.test.js) — failingCount: 1/1 (latest log: 2025-10-20T20-55-52-588Z_ALL.log)
- [src/deprecated-ui/express/__tests__/gazetteer.ssr.http.test.js](src/deprecated-ui/express/__tests__/gazetteer.ssr.http.test.js) — failingCount: 3/3 (latest log: 2025-10-20T20-55-52-588Z_ALL.log)
- [src/deprecated-ui/express/__tests__/gazetteer.countries.http.test.js](src/deprecated-ui/express/__tests__/gazetteer.countries.http.test.js) — failingCount: 1/1 (latest log: 2025-10-20T20-55-52-588Z_ALL.log)
- [src/deprecated-ui/express/__tests__/gazetteer.smoke.http.test.js](src/deprecated-ui/express/__tests__/gazetteer.smoke.http.test.js) — failingCount: 1/1 (latest log: 2025-10-20T20-55-52-588Z_ALL.log)
- [src/deprecated-ui/express/__tests__/logs.colorization.test.js](src/deprecated-ui/express/__tests__/logs.colorization.test.js) — failingCount: 1/1 (latest log: 2025-10-20T20-55-52-588Z_ALL.log)
- [src/deprecated-ui/express/__tests__/gazetteer.places.storage.http.test.js](src/deprecated-ui/express/__tests__/gazetteer.places.storage.http.test.js) — failingCount: 3/3 (latest log: 2025-10-20T20-55-52-588Z_ALL.log)
- [src/deprecated-ui/express/__tests__/gazetteer.kind_country.http.test.js](src/deprecated-ui/express/__tests__/gazetteer.kind_country.http.test.js) — failingCount: 2/2 (latest log: 2025-10-20T20-55-52-588Z_ALL.log)
- [src/deprecated-ui/express/__tests__/crawl.e2e.http.test.js](src/deprecated-ui/express/__tests__/crawl.e2e.http.test.js) — failingCount: 1/2 (latest log: 2025-10-20T20-55-52-588Z_ALL.log)
- [src/deprecated-ui/__tests__/crawl.e2e.more.test.js](src/deprecated-ui/__tests__/crawl.e2e.more.test.js) — failingCount: 5/5 (latest log: 2025-10-20T20-55-52-588Z_ALL.log)
- [src/deprecated-ui/express/__tests__/problems.api.ssr.test.js](src/deprecated-ui/express/__tests__/problems.api.ssr.test.js) — failingCount: 1/1 (latest log: 2025-10-20T20-55-52-588Z_ALL.log)
- [src/deprecated-ui/express/__tests__/gazetteerPlace.data.test.js](src/deprecated-ui/express/__tests__/gazetteerPlace.data.test.js) — failingCount: 2/2 (latest log: 2025-10-20T20-55-52-588Z_ALL.log)
- [src/deprecated-ui/__tests__/queues.api.test.js](src/deprecated-ui/__tests__/queues.api.test.js) — failingCount: 2/2 (latest log: 2025-10-20T20-55-52-588Z_ALL.log)
- [src/deprecated-ui/__tests__/crawl.e2e.http.test.js](src/deprecated-ui/__tests__/crawl.e2e.http.test.js) — failingCount: 1/1 (latest log: 2025-10-20T20-55-52-588Z_ALL.log)
- [src/deprecated-ui/__tests__/crawl.jobid.test.js](src/deprecated-ui/__tests__/crawl.jobid.test.js) — failingCount: 1/1 (latest log: 2025-10-20T20-55-52-588Z_ALL.log)

## Analysis and estimated effort
- Deprecated UI/API suites — formally retired (ignored by `jest.careful.config.js` and `tests/test-log-history.js`).
- Crawler integration cluster — [src/crawler/__tests__/phase-123-integration.test.js](src/crawler/__tests__/phase-123-integration.test.js), [src/crawler/__tests__/deepUrlAnalysis.test.js](src/crawler/__tests__/deepUrlAnalysis.test.js), [src/crawler/__tests__/AdaptiveExplorer.test.js](src/crawler/__tests__/AdaptiveExplorer.test.js), [src/crawler/__tests__/placeHubs.data.test.js](src/crawler/__tests__/placeHubs.data.test.js), [src/crawler/__tests__/OsmBoundaryIngestor.test.js](src/crawler/__tests__/OsmBoundaryIngestor.test.js). Hypothesis: fixture/contract drift after planner or feature-flag changes; latest failures are recent (2025-12-03) so likely still relevant. Estimated effort: 0.5–1.5 days to review fixtures, align expectations, and add regression coverage; lower bound if failures share a single config mismatch.
- js-scan CLI — resolved on 2025-12-10; keep an eye on future formatter/hash changes but no action needed now.
- Migration and gazetteer tooling — [src/db/migration/__tests__/orchestrator.test.js](src/db/migration/__tests__/orchestrator.test.js), [src/db/migration/__tests__/validator.test.js](src/db/migration/__tests__/validator.test.js), [src/tools/__tests__/populate-gazetteer.test.js](src/tools/__tests__/populate-gazetteer.test.js), [src/tools/__tests__/export-gazetteer.test.js](src/tools/__tests__/export-gazetteer.test.js), [src/tools/__tests__/guess-place-hubs.test.js](src/tools/__tests__/guess-place-hubs.test.js), [src/tools/__tests__/find-place-hubs.test.js](src/tools/__tests__/find-place-hubs.test.js), [src/__tests__/db.latest_fetch.test.js](src/__tests__/db.latest_fetch.test.js). Hypothesis: schema drift, missing seed data, or contract changes in migration runner and gazetteer pipelines. Estimated effort: 1–2 days to inspect fixtures, regenerate seeds, and reconcile schema expectations; could stretch to 3 days if migrations need rework.
- Cache/utilities — [src/utils/__tests__/bucketCache.test.js](src/utils/__tests__/bucketCache.test.js). Hypothesis: cache semantics changed (TTL, bucket sizing, eviction) without fixture updates. Estimated effort: 3–6 hours to read implementation, update tests to new behavior or fix bug.
- Analysis logging — [src/tools/__tests__/analysis-run.logging.test.js](src/tools/__tests__/analysis-run.logging.test.js). Hypothesis: log format/output paths changed. Estimated effort: 1 hour.
- E2E telemetry/geography — [tests/e2e-features/geography-crawl/startup-and-telemetry.test.js](tests/e2e-features/geography-crawl/startup-and-telemetry.test.js), [tests/e2e-features/telemetry-flow/preparation-stages.test.js](tests/e2e-features/telemetry-flow/preparation-stages.test.js). Hypothesis: environment bootstrap missing (servers/data) or API contract drift. Estimated effort: 3–6 hours to repro with correct servers/data, then adjust fixtures.
- Overall estimate to clear all active (non-deprecated) failures — ~2–3 days assuming targeted reruns per cluster and no deep migration rewrites.
