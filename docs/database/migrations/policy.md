# Migration Policy

_Last reviewed: 2025-11-04_

This document governs schema changes to the `news.db` SQLite database and any supporting export/import workflows.

## Naming & Versioning
- Place migration SQL files in `src/db/migrations/`.
- Use incremental prefixes (`006_`, `007_`, …) followed by a concise description, e.g. `009-url-alias-fk.sql`.
- Keep related follow-up fixups in the same numerical family (see the existing `008-*` trio).
- For schema fragments that live under `src/db/sqlite/v1/migrations/` (module-specific bootstrap pieces), align the numbering with the parent migration that introduced the feature.

## Authoring Checklist
1. **Design** – Capture intent in `CHANGE_PLAN.md` or the relevant normalization blueprint before writing SQL.
2. **Dry run** – Apply the migration against a temp copy (`cp data/news.db migration-temp/preflight.db`).
3. **Validation** – Execute `node tools/migration-cli.js migrate` followed by `node tools/migration-cli.js validate` to ensure exports/imports are stable.
4. **Regenerate schema snapshot** – Run the Phase 0 tooling to refresh `src/db/sqlite/v1/schema-definitions.js` and `docs/database/_artifacts/news_db_schema.sql`.
5. **Update docs** – Reflect the change in `docs/database/schema/main.md` and any adapter pages that expose the new tables/columns.

## Review & Approval
- Two reviewers minimum: one from the Database Normalization group, one from the consumer team (crawler/planner).
- Pull requests must include:
  - Migration SQL files.
  - Updated schema snapshot artifacts.
  - Updated documentation (schema + plan checklist).
  - Test results from `npx jest --config jest.careful.config.js --runTestsByPath src/db/migration/__tests__/*`.

## Local Workflow
```powershell
# 1. Create temp copy
Copy-Item data\news.db migration-temp\preflight.db -Force

# 2. Apply migration (manual example)
node tools/migration-cli.js migrate migration-temp\preflight.db --db-path data\news.db --export-dir migration-export

# 3. Validate counts and FKs
node tools/migration-cli.js validate migration-temp\preflight.db --source-db data\news.db

# 4. Refresh schema blueprints
node tools/migration-cli.js emit-schema --target docs/database/_artifacts/news_db_schema.sql
```

## Dev → Prod Promotion
1. **Prepare backup** – Follow `AGENTS.md` policy (24-hour freshness). Copy `data/news.db` to `data/backups/news-backup-YYYY-MM-DD-HHMMSS.db`.
2. **Run migration** – Use the Phase 0 CLI with `--export-dir migration-export` to capture artifacts.
3. **Run validator** – `node tools/migration-cli.js validate` comparing pre/post counts.
4. **Smoke tests** – Execute targeted Jest suites plus crawler smoke tests touching the modified tables.
5. **Checkpoint WAL** – `node tools/db-maintenance.js` (checkpoint + VACUUM), or `node tools/db-maintenance.js --checkpoint-only` if you only need to truncate the WAL.
6. **Update docs** – Refresh `docs/database/_artifacts/news_db_stats.json` and mark checkboxes in `DB_DOCS_PLAN.md`.

## Rollback Strategy
- SQLite migrations are not auto-reversible. Maintain the pre-migration backup and be ready to restore the file wholesale.
- If partial rollbacks are necessary, author explicit down-migration steps and manually apply them to the affected copy.
- Document every rollback event in `CHANGE_PLAN.md` with context and follow-up tasks.

## Testing Strategy
- Unit tests live under `src/db/migration/__tests__/` and rely on in-memory/temporary databases.
- For data-heavy changes, add fixtures to `migration-export/` and cover the new tables with importer/exporter regression tests.
- Always rerun `node tools/tests/run-migration-suite.js` (if available) or the Jest subset listed in the plan.

## Compliance
- Do not introduce application-layer SQL that bypasses the adapters. Route changes through migrations and adapter helpers to keep telemetry and URL normalization intact.
- Keep the migration CLI up to date with new operations (export/delete/backfill) so future operators have a single entry point.
