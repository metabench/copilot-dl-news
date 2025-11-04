# Archiving & Retention Policy

_Last verified: 2025-11-04_

## Data Classes
- **Operational telemetry** (`queue_events`, `crawler_settings`, `analysis_runs`): retain 12 months in primary DB.
- **Content payloads** (`content_storage`, `content_analysis`): retain indefinitely unless legal/takedown requests occur.
- **Place intelligence** (`places`, `place_names`): long-term reference data; never delete without seeding replacement.

## Retention Rules
1. **Queue telemetry**
   - Archive records older than 12 months to `archive_queue_events` or NDJSON (`data/exports/archives/YYYY/MM/`).
   - Keep per-job summaries in primary DB for analytics.
2. **Crawler errors**
   - Retain 6 months; older entries moved to `archive_errors` or deleted after export.
3. **Query telemetry**
   - Retain 90 days; export to CSV for trend analysis before purge.
4. **User-supplied takedowns**
   - Document request in ticketing system.
   - Delete associated `content_storage` row and cascade to `content_analysis`, `article_places` via migration script.

## Archival Workflow
1. **Plan** – Identify target tables/ranges; update `CHANGE_PLAN.md` with scope.
2. **Backup** – Capture fresh backup per policy.
3. **Export** – Use `node tools/migration-cli.js export --table ...` to generate NDJSON.
4. **Delete** – Apply chunked delete migration with verification queries.
5. **Log** – Store exports under `data/exports/archives/` with README describing contents and retention reason.
6. **Verify** – Recompute stats, run spot checks (`SELECT COUNT(*) FROM archive_*`).

## Compliance Notes
- No PII stored today; treat URLs/content as potentially sensitive intellectual property.
- Ensure archived files inherit repository permissions or encrypted storage if moved off host.
- Document requests and completions in incident log.

## Review Cadence
- Quarterly review of retention adherence.
- Update this policy whenever regulators or product owners adjust retention requirements.
