# Agent Guide: `src/data/db/` — Database Adapters & Access Layer

> **Read this file first** when working on database code, migrations, or query patterns.

---

## What This Directory Contains

The database access layer for the main `data/news.db` SQLite database. All persistence goes through adapters in this directory — **no inline SQL in services or modules** (this is a core directive from AGENTS.md).

### Key Files

| File | Purpose |
|------|---------|
| `index.js` | Main exports |
| `dbAccess.js` | Core DB access utilities |
| `sqlite/` | SQLite-specific adapters and schema |
| `postgres/` | PostgreSQL adapter (experimental) |
| `queries/` | Named query modules |
| `migrations/` | Schema migration scripts |
| `migration/` | Migration framework |
| `DualDatabaseFacade.js` | Dual DB facade (local + remote) |
| `EnhancedDatabaseAdapter.js` | Enhanced adapter with telemetry |
| `queryTelemetry.js` | Query performance tracking |
| `TaskEventWriter.js` | Background task event persistence |
| `QueueDatabase.js` | Queue-specific DB operations |
| `PlannerDatabase.js` | Planner-specific DB operations |
| `CoverageDatabase.js` | Coverage tracking DB |
| `DatabaseExporter.js` | Data export utilities |
| `newsCrawlerDbCompat.js` | Compatibility layer for news-crawler-db module |

---

## Essential Reading

1. **Database Quick Reference** (fast lookup for common patterns):
   [docs/DATABASE_QUICK_REFERENCE.md](../../../docs/DATABASE_QUICK_REFERENCE.md)

2. **Database Migration Guide**:
   [docs/DATABASE_MIGRATION_GUIDE_FOR_AGENTS.md](../../../docs/DATABASE_MIGRATION_GUIDE_FOR_AGENTS.md)

3. **Schema Definitions** (auto-generated, canonical reference):
   `src/db/sqlite/v1/schema-definitions.js`

---

## Critical Workflow: Schema Synchronization

**After ANY database schema change** (migrations, ALTER TABLE, new tables):

```bash
npm run schema:sync     # Regenerate schema-definitions.js
npm run schema:check    # Verify no drift (CI gate)
npm run schema:stats    # Regenerate with table statistics
```

**Files updated by sync:**
- `src/db/sqlite/v1/schema-definitions.js` — Canonical schema definitions
- `docs/database/_artifacts/news_db_stats.json` — Table row counts

**Integration points:**
1. After running migrations → always run `npm run schema:sync`
2. Before PR merge → run `npm run schema:check`
3. In DB adapter work → consult `schema-definitions.js` for current schema

---

## DB Adapter Checklist (From AGENTS.md)

Every change to this directory must satisfy:

- [ ] **Boundary**: No direct driver/ORM calls outside `src/data/db/`. Services depend on adapter interfaces.
- [ ] **Query shape**: Avoid `SELECT *`; return explicit columns/fields. Batch related reads (joins/`IN (...)`/eager loading).
- [ ] **N+1**: Proactively search for per-row subqueries; replace with bulk fetches.
- [ ] **Transactions**: Group multi-write operations; ensure atomicity and clear rollback behavior.
- [ ] **Indexes**: Query by indexed predicates; review plans (`EXPLAIN`) for hot paths.
- [ ] **Throughput**: Prefer bulk insert/update APIs. Avoid per-row loops.
- [ ] **Docs**: For non-trivial queries/migrations, add a comment block with intent, complexity, and expected row counts.

---

## Getting a Database Handle

```javascript
// Simple usage
const { ensureDatabase } = require('../db/sqlite');
const db = ensureDatabase('data/news.db');

// With query telemetry
const { ensureDatabase, wrapWithTelemetry } = require('../db/sqlite');
const db = wrapWithTelemetry(ensureDatabase('data/news.db'));
```

---

## Current Schema

**Version**: 37 (normalized architecture, ~75+ tables)
**Database**: `data/news.db` (~8GB)

Key tables: `urls` (740K rows), `http_responses` (148K), `content_storage` (50K), `errors` (4K), `links` (4.9M), `crawl_runs` (50), `news_websites` (48)

See `docs/database/schema/main.md` for human-readable schema docs.

---

## Related Paths

| Path | Relationship |
|------|-------------|
| `deploy/remote-crawler-v2/lib/schema.js` | V2 schema (9 tables, separate from main DB) |
| `src/core/crawler/dbClient.js` | Crawler's DB client wrapper |
| `tools/schema/` | Schema sync tooling |
| `docs/database/` | Database documentation |

---

## Related Agent Specs

| Agent | When to Use |
|-------|------------|
| 🗄️ DB Guardian Singularity | Schema migrations, adapter rewrites |
| 🔬🛠️ Diagnostic & Repair Singularity | DB forensics, data anomalies |
| 🧩 DB Injection Wrangler | Constructor/factory/adapter boundary issues |
