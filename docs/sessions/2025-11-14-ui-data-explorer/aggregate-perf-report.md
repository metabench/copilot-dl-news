# Aggregate Benchmark Report — Baseline Snapshot

_Run_: 2025-11-14 20:14 UTC · Snapshot `baseline` (`data/perf-snapshots/baseline/news.db`) · Iterations 25 · Warm-up 1

| Stat key | Median (ms) | Threshold (ms) | Status | Notes |
| --- | --- | --- | --- | --- |
| `urls.total_count` | 67.0 | 5 | ❌ needs cache | Full-table count hits ~67 ms median / 89 ms p95; must stay cached.
| `urls.page_sample` | 1.39 | 5 | ✅ pass | 1k-row page query remains well under the 5 ms goal.
| `domains.recent_window` | — | 5 | ⚠️ missing table | `articles` snapshot absent; regenerate export so domain stats can run.
| `domains.article_count` | — | 5 | ⚠️ missing table | Same issue as above.
| `domains.fetch_count_join` | — | 5 | ⚠️ missing table | Same issue as above.
| `queues.listQueues` | — | 3 | ⚠️ schema mismatch | Snapshot lacks `url` column on `crawl_jobs`; need updated schema dump.
| `errors.listRecent` | — | 5 | ⚠️ schema mismatch | Snapshot missing `errors.url`; re-export with the latest migrations.
| `crawls.listRecent` | — | 5 | ⚠️ schema mismatch | `crawl_jobs` join expects `j.url`; absent in current dump.
| `gazetteer.country_counts` | 0.007 | 5 | ✅ pass | Country counts query is effectively instant even at baseline volume.

## Follow-ups
- Refresh the `baseline` snapshot with full schema (including `articles`, `errors.url`, `crawl_jobs.url`).
- Encode PASS/WARN/FAIL logic inside `scripts/perf/ui-aggregates-bench.js` so the CLI reports `needs_cache` vs `direct` per stat.
- Re-run the benchmark after snapshot refresh to populate the missing rows (domains/queues/errors/crawls).
