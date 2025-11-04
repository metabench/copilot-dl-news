# Database Overview

_Last updated: 2025-11-04_

## Purpose
The data layer for **copilot-dl-news** is backed by SQLite and powers every stage of the news ingestion pipeline—URL discovery, crawling, content normalization, coverage analytics, and gazetteer enrichment. This document provides an operator-focused guide to the databases in use, how they fit together, and the operational expectations around them.

SQLite was selected because the crawler runs in a single-node footprint with heavy write bursts, and better-sqlite3 gives predictable latency with a minimal operational surface. WAL mode is enabled everywhere to support concurrent readers and the background analysis workload.

## Top-Level Databases
| File | Role | Default Location | Notes |
| --- | --- | --- | --- |
| `news.db` | Primary operational store for crawl jobs, URLs, content blobs, queue telemetry, planner knowledge, coverage analytics, and gazetteer data. | `data/news.db` | Opened through `src/db/sqlite/v1` helpers; schema snapshot stored at `docs/database/_artifacts/news_db_schema.sql`.
| `gazetteer.db` | Export/import scratchpad for stand‑alone gazetteer tooling (bulk QA, offline builds). | `data/gazetteer.db` | Optional. Tools in `src/tools/` fall back to this file; prod workflow uses the tables embedded in `news.db`.
| `urls.db` | Legacy lightweight cache of URL metadata used during migration experiments. | `data/urls.db` | Not referenced by current services; keep around as historical backup only.
| `db.sqlite` | Default path used by older maintenance scripts. | `data/db.sqlite` | Redirect scripts to `news.db` unless you are replaying a historical experiment.

## Connection & Adapter Conventions
- **Entry point:** `src/db/sqlite/v1/index.js` exposes `createSQLiteDatabase`, `ensureDatabase`, and telemetry wrappers.
- **Pragmas:** `openDatabase()` enforces WAL mode, foreign key checking, a 5s busy timeout, and `synchronous = NORMAL` for balanced durability/perf.
- **Instrumentation:** `wrapWithTelemetry()` funnels through `src/db/queryTelemetry.js`, tagging long-running statements for the UI.
- **Enhanced adapter:** `src/db/EnhancedDatabaseAdapter.js` composes `QueueDatabase`, `PlannerDatabase`, and `CoverageDatabase` on top of the base `NewsDatabase`.

## Ownership & Contacts
| Area | Owner | Contact |
| --- | --- | --- |
| SQLite schema & migrations | Database Normalization effort | Mention `#news-db-normalization` in Slack (see `AGENTS.md` contact section). |
| Queue/planner/coverage modules | Crawler Infrastructure | Same Slack channel; reviewers listed in CODEOWNERS (queue/planner). |
| Migration CLI (`tools/migration-cli.js`) | Migration Taskforce | File issues in `docs/CHANGE_PLAN.md` > Phase 0 section.

## Operational SLOs
| Workflow | Target | Measurement |
| --- | --- | --- |
| Schema bootstrap on cold start | < 90 seconds | `ensureDatabase` fast-path logs (`[schema] Fast path` indicator). |
| Migration execution | < 10 minutes per run | `node tools/migration-cli.js migrate` logs; fallback to manual chunking if exceeded. |
| WAL checkpoint debt | < 1 GB | Monitor `pragma wal_checkpoint(TRUNCATE)` weekly; schedule vacuum if >1 GB. |
| Backup freshness | ≤ 24 hours | `data/backups/news-backup-*.db` timestamps (see `AGENTS.md` for policy).

## Related Documentation
- `docs/DATABASE_NORMALIZATION_PLAN.md` – Long-term roadmap for URL foreign key cleanup.
- `docs/DATABASE_MIGRATION_GUIDE_FOR_AGENTS.md` – End-to-end migration procedure.
- `docs/TESTING_FOCUSED_WORKFLOW.md` – How to validate database-dependent features in CI.
- `docs/database/_artifacts/` – Live snapshots referenced throughout this folder.
- `docs/database/ops/runbooks/` – Backup, restore, maintenance, and retention playbooks.

Use this file as the entry point before drilling into schema groupings, adapter behaviour, or operational runbooks.
