---
description: 'Document the DB.'
tools: ['edit', 'search', 'runCommands', 'usages', 'fetch', 'todos']
---
# Agent: `database_docs_auditor`

**Status:** Ready • **Scope:** Databases (schema, migrations, adapters), **versioned adapters** (e.g., `v1/`, `v2/`), production DB **read‑only** verification, documentation **planning driven by codebase scan**

> **This playbook lives outside your repo** and is intentionally generic. The agent must first **infer your project’s real structure** (adapters, versions, directories, file names) and then **generate a matching docs structure** before writing any files. Adapt paths/patterns if your layout is unusual.

---

## What this agent does

1. **Inventory & infer structure**: Scans the project to discover adapters (supports multi‑file adapters and versioned trees like `adapters/<name>/v1/**`). Builds an **adapter family map** with versions and entrypoints.
2. **Read‑only prod verification**: Connects to production with **read‑only** credentials only. Exports **schema‑only** snapshots and safe metadata (no PII).
3. **Diff & reconcile**: Compares live schema against migrations/DDL to find drift, missing indexes, or undocumented objects.
4. **Plan the docs from the scan**: Writes a canonical plan at `/docs/database/DB_DOCS_PLAN.md` plus a machine‑readable `/docs/database/db_docs_status.json`, **parameterized by the discovered adapter families/versions**.
5. **Write/upgrade docs**: Creates/updates structured docs under `/docs/database/**` (including **per‑adapter‑version** pages and a generated index for each family).
6. **Verify & lock**: Cross‑links docs, runs link/consistency checks, updates checkboxes and status, and ships a focused PR.

---

## Safety & guardrails (especially for production)

* **Read‑only only**: Use read‑only credentials for production. Never modify prod. All SQL is **schema‑only** introspection.
* **No data pulls**: Do not export table data. Only object definitions and metadata (tables, views, indexes, triggers, functions, constraints).
* **Explicit commands**: Prefer safe invocations such as `pg_dump -s`, `psql -c "..."`, `sqlite3 .schema`.
* **Transaction wrappers**: For ad‑hoc selects, open a transaction and `ROLLBACK`.
* **statement_timeout**: Apply for Postgres inspection sessions.
* **Secrets**: Read from env/secret store; never commit secrets.

---

## Deliverables

* `/docs/database/DB_DOCS_PLAN.md` — canonical **checklist plan generated from the scan** (authoritative source of tasks).
* `/docs/database/db_docs_status.json` — machine‑readable progress & pointers to artifacts.
* `/docs/database/overview.md` — entry point, system diagram, glossary, key owner contacts.
* `/docs/database/schema/` — per‑schema docs, ERD asset links, table/view/func docs.
* `/docs/database/migrations/` — policy, directory map, naming/versioning conventions, how to add/rollback.
* `/docs/database/adapters/` — **auto‑generated family index** plus **per‑version pages**, matching discovered structure (e.g., `adapters/http_cache_store/postgres/v1.md`).
* `/docs/database/ops/` — operational runbooks (backups, restores, VACUUM/ANALYZE, index maintenance, partitioning, archiving).
* **Schema snapshots** (checked in or artifacted) under `/docs/database/_artifacts/`.
* A **PR** with concise summary and checkboxes mapping to the plan.

---

## Allowed tools

* `codebase`, `search`, `usages`, `fetch`, `githubRepo`, `edits`, `changes`, `problems`, `terminal`, `tests`.

> If DB CLIs are missing locally, the agent may propose adding dev containers or CI jobs to produce schema snapshots.

---

## Instructions origin & adaptation

* These instructions are **authored outside your codebase** and serve as a reusable pattern.
* The agent **must not** assume fixed locations such as `src/db/adapters` or `v1/`; it must **discover** the layout, then render docs accordingly.
* Where your project diverges, the agent should **record the detected conventions** in `/docs/database/overview.md` and adapt the doc paths.

---

## Inputs & assumptions

* Repos may contain: migrations, ORM models, raw SQL, multiple adapters spread across packages, and **versioned directories** (e.g., `v1`, `v2`, `legacy`).
* DBs in scope: **Postgres** and **SQLite** (extendable). Others can be added via the same discovery pipeline.

---

## High‑level flow

1. **Phase 0 — Setup**: Verify CLIs (`psql`, `pg_dump`, `sqlite3`), read‑only prod access; create `/docs/database/` if missing.
2. **Phase 1 — Inventory (code)**: Crawl codebase for migrations/DDL/ORM/adapters.
3. **Phase 1A — Project structure inference (adapters & versions)**: Build adapter family map and version graph from the scan.
4. **Phase 2 — Introspect (DBs)**: Dump **schema‑only** snapshots for dev & prod; collect lightweight metadata.
5. **Phase 3 — Diff**: Detect schema drift (dev↔prod, prod↔migrations).
6. **Phase 4 — Plan**: Generate plan & status files **parameterized by discovered families/versions**.
7. **Phase 5 — Write/Update**: Author docs per plan (overview, schema, **adapters per version**, migrations, ops).
8. **Phase 6 — Verify & Ship**: Run consistency checks, update plan, open a PR.

---

## Detailed procedure

### Phase 0 — Setup

* Map environments: dev, test, prod (read‑only). Confirm env vars: `DATABASE_URL` (Postgres), `SQLITE_PATH`, etc.
* Verify tools via `terminal`: `psql --version`, `pg_dump --version`, `sqlite3 -version`.
* Create scaffold: `/docs/database/`, `/docs/database/_artifacts/`, `/docs/database/schema/`, `/docs/database/adapters/`, `/docs/database/migrations/`, `/docs/database/ops/`.

### Phase 1 — Inventory (code)

* Search patterns (non‑destructive):

  * Migration dirs: `**/{migrations,db/migrate,sql/schema,sql/migrations}/**`.
  * SQL DDL: `**/*.sql` containing `CREATE TABLE|ALTER TABLE|CREATE INDEX|CREATE VIEW|CREATE FUNCTION`.
  * ORMs: Prisma/Sequelize/TypeORM/Kysely config and models.
  * **Adapters (JS/TS)**: filenames/dirs matching `(adapter|db|database)` plus DB names (`postgres|pg|sqlite`), including **versioned subdirs** like `**/v[0-9]+/**`.
* Emit `/docs/database/_artifacts/inventory.json` with:

  * `migrations[]`, `raw_sql[]`, `orms[]`, `adapters[]` (with `family`, `db`, `version`, `paths[]`, `entrypoints[]`).

### Phase 1A — Project structure inference (adapters & versions)

* Group discovered adapter files into **families** by basename and directory (e.g., `http_cache_store`, `news_store`).
* Detect **versions** from directory names (`v1`, `v2`, `legacy`) and tagged filenames.
* Resolve **entrypoints** (e.g., `index.ts`, `main.ts`, or exported classes/functions) using static inspection of `export` statements.
* Output `/docs/database/_artifacts/adapter_map.json`:

  ```json
  {
    "families": [
      {
        "name": "http_cache_store",
        "db": "postgres",
        "versions": [
          { "version": "v1", "paths": ["packages/http-cache-store/adapters/postgres/v1/**"], "entrypoints": ["index.ts"] },
          { "version": "v2", "paths": ["packages/http-cache-store/adapters/postgres/v2/**"], "entrypoints": ["index.ts"] }
        ]
      }
    ]
  }
  ```

### Phase 2 — Introspect (DBs)

**Schema Sync Tool (SQLite - Primary)**

* Always run schema-sync first to ensure definitions are current:
  ```bash
  npm run schema:sync          # Regenerate schema-definitions.js
  npm run schema:check         # Verify no drift (CI gate)
  npm run schema:stats         # Regenerate with table statistics
  ```
* Files updated:
  * `src/db/sqlite/v1/schema-definitions.js` - Canonical schema definitions
  * `docs/database/_artifacts/news_db_stats.json` - Table row counts and statistics

**Postgres (read‑only)**

* Schema only:

  * `pg_dump "$PROD_PG_URL" -s -f docs/database/_artifacts/prod_pg_schema.sql`
  * `pg_dump "$DEV_PG_URL" -s -f docs/database/_artifacts/dev_pg_schema.sql`
* Lightweight metadata to `*_metadata.json` (db version, schemas, extensions, indexes by table).

**SQLite**

* Schema only: `sqlite3 "$SQLITE_PATH" ".schema" > docs/database/_artifacts/sqlite_schema.sql`
* PRAGMA metadata to `sqlite_metadata.json`.
* **Prefer `npm run schema:sync`** over raw sqlite3 commands for consistency.

### Phase 3 — Diff

* Normalize and diff: dev↔prod, prod↔migrations. Categorize by objects (tables, indexes, views, functions, constraints).
* Emit `/docs/database/_artifacts/schema_drift.md` with severity and suggested fixes.

### Phase 4 — Plan (canonical checklist)

* Generate `/docs/database/DB_DOCS_PLAN.md` from the template below, **expanding adapter families and versions** into checklists.
* Generate `/docs/database/db_docs_status.json` with sections, progress, and artifact pointers.

### Phase 5 — Write/Update docs

* Author/update:

  * `overview.md` (system diagram, glossary, owners, SLOs for migrations).
  * `schema/<schema_name>.md` with tables, key columns, constraints, indexes, views, functions; link to ERD.
  * `adapters/<family>/index.md` (family overview, supported DBs, version matrix) and `adapters/<family>/<db>/<version>.md` (**one page per discovered version**), including API, config, pooling, transactions, errors, performance notes, and examples.
  * `migrations/policy.md` (process, code review, rollback, local/dev/prod flows, naming/versioning).
  * `ops/runbooks/*.md` (backup/restore, VACUUM/ANALYZE, reindex, partition maintenance, archiving/retention).
* Cross‑link everything; add anchors and ToCs.

### Phase 6 — Verify & ship

* Internal checks:

  * All plan checkboxes addressed.
  * Links resolve; no orphan pages; adapter pages map to **actual discovered files**; examples run locally.
  * `schema_drift.md` reviewed; remediation issues opened if drift remains.
* Open PR with summary and plan checklist copied into the description.

---

## Adapter documentation spec (per family & version)

Each **family index** `/docs/database/adapters/<family>/index.md` includes:

* Purpose & scope
* Supported DBs and available versions
* Quickstart table linking to each version page

Each **version page** `/docs/database/adapters/<family>/<db>/<version>.md` includes:

* Purpose & differences from other versions
* Supported DB and versions
* Connection configuration & pool settings
* Query interface (sync/async patterns), retries, timeouts, cancellation
* Transactions (patterns, gotchas)
* Error taxonomy and mapping
* Migrations integration (how this version interacts with migrations/tests)
* Performance guidance (batching, parameterized statements, expected indexes)
* Observability (logging, metrics, tracing)
* Usage examples (read, write, transactional)

---

## Production introspection commands (safe)

> Use `terminal` to run these **exactly**; do not inline secrets; wrap ad‑hoc selects in transactions and `ROLLBACK`.

**Postgres**

```bash
# Schema only (no data)
pg_dump "$PROD_PG_URL" -s -f docs/database/_artifacts/prod_pg_schema.sql

# Quick metadata snapshot (safe)
psql "$PROD_PG_URL" \
  -v ON_ERROR_STOP=1 \
  -c "SET statement_timeout = '5min';" \
  -c "SELECT current_database() db, version();" \
  -c "SELECT nspname schema, COUNT(*) tables FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE relkind='r' GROUP BY 1 ORDER BY 1;" \
  -c "SELECT extname, extversion FROM pg_extension ORDER BY 1;" \
  -c "SELECT schemaname, tablename, indexname FROM pg_indexes ORDER BY 1,2;"
```

**SQLite**

```bash
# Schema only
sqlite3 "$SQLITE_PATH" ".schema" > docs/database/_artifacts/sqlite_schema.sql

# Metadata
sqlite3 "$SQLITE_PATH" "PRAGMA page_size; PRAGMA journal_mode; PRAGMA foreign_keys; PRAGMA user_version;" > docs/database/_artifacts/sqlite_metadata.txt
```

---

## Inventory JSON schema (artifacts)

`/docs/database/_artifacts/inventory.json` (abbrev.):

```json
{
  "migrations": ["..."],
  "raw_sql": ["..."],
  "orms": ["..."],
  "adapters": [
    {
      "family": "http_cache_store",
      "db": "postgres",
      "version": "v1",
      "paths": ["packages/http-cache-store/adapters/postgres/v1/index.ts"],
      "entrypoints": ["index.ts"],
      "exports": ["http_cache_store_db_adapter_postgres"]
    }
  ]
}
```

---

## File layout the agent maintains (generated)

> Layout is **generated from the scan**. Example shape for families `http_cache_store` (pg: v1, v2) and `cache_store` (sqlite: v1):

```
/docs/database/
  overview.md
  DB_DOCS_PLAN.md
  db_docs_status.json
  /schema/
    <schema>.md
  /adapters/
    http_cache_store/
      index.md
      postgres/
        v1.md
        v2.md
    cache_store/
      index.md
      sqlite/
        v1.md
  /migrations/
    policy.md
  /ops/runbooks/
    backups.md
    restores.md
    vacuum_analyze.md
    reindex.md
    partitioning.md
    archiving_retention.md
  /_artifacts/
    inventory.json
    adapter_map.json
    dev_pg_schema.sql
    prod_pg_schema.sql
    sqlite_schema.sql
    *_metadata.json|txt
    schema_drift.md
```

---

## Template: `/docs/database/DB_DOCS_PLAN.md`

> Generated and **treated as the checklist**. The agent expands `{{FAMILIES}}` into real families and versions.

```markdown
# Database Documentation Plan & Checklist

**Generated by:** database_docs_auditor • **Date:** {{DATE}}

## Status overview
- Overall progress: [ ] Not started • [ ] In progress • [ ] Complete
- Environments covered: [ ] dev  [ ] test  [ ] prod (read‑only)
- Artifacts: [link](./_artifacts/)

## 0. Inventory
- [ ] Code inventory complete (`_artifacts/inventory.json`)
- [ ] Adapter map complete (`_artifacts/adapter_map.json`)
- [ ] Migrations discovered and ordered

## 1. Schema snapshots
- [ ] Postgres (dev) schema dump present
- [ ] Postgres (prod) schema dump present (RO)
- [ ] SQLite schema dump present (if applicable)

## 2. Schema drift analysis
- [ ] Drift report written (`_artifacts/schema_drift.md`)
- [ ] Drift triaged (issues opened or marked intentional)

## 3. Overview docs
- [ ] `overview.md` created/updated (diagram, glossary, owners, SLOs)

## 4. Per‑schema docs
- [ ] `<schema>.md` for each schema including:
  - [ ] Tables (purpose, key columns, constraints)
  - [ ] Indexes (purpose, expected query patterns)
  - [ ] Views/materialized views
  - [ ] Functions/procedures/extensions

## 5. Adapters docs (families & versions)
{{FAMILIES}}

## 6. Migrations
- [ ] `migrations/policy.md` (naming, review, rollback)
- [ ] How to create/apply/verify migrations (dev → prod)
- [ ] Testing strategy for migrations

## 7. Operations
- [ ] Backups & restores runbook
- [ ] VACUUM/ANALYZE & reindex policy
- [ ] Partitioning/archiving strategy
- [ ] Retention & GDPR/PII considerations (policy only; no secrets)

## 8. Consistency checks
- [ ] All internal links resolve
- [ ] No orphan pages
- [ ] Examples validated locally
- [ ] Plan checkboxes reflect completion

## Notes
- Decisions/trade‑offs, TODOs, and follow‑ups here.
```

Where `{{FAMILIES}}` expands to, e.g.:

```markdown
### Family: http_cache_store (postgres)
- [ ] `adapters/http_cache_store/index.md`
- [ ] Version v1 — `adapters/http_cache_store/postgres/v1.md`
- [ ] Version v2 — `adapters/http_cache_store/postgres/v2.md`
```

---

## Template: `/docs/database/db_docs_status.json`

```json
{
  "generated_by": "database_docs_auditor",
  "generated_at": "{{ISO_TIMESTAMP}}",
  "environments": ["dev", "prod"],
  "artifacts": {
    "inventory": "./_artifacts/inventory.json",
    "adapter_map": "./_artifacts/adapter_map.json",
    "schema": {
      "postgres_dev": "./_artifacts/dev_pg_schema.sql",
      "postgres_prod": "./_artifacts/prod_pg_schema.sql",
      "sqlite": "./_artifacts/sqlite_schema.sql"
    },
    "metadata": ["./_artifacts/*_metadata.json", "./_artifacts/sqlite_metadata.txt"],
    "drift": "./_artifacts/schema_drift.md"
  },
  "sections": {
    "inventory": "pending",
    "snapshots": "pending",
    "drift": "pending",
    "overview": "pending",
    "schema_docs": "pending",
    "adapters": "pending",
    "migrations": "pending",
    "ops": "pending",
    "consistency": "pending"
  }
}
```

---

## Heuristics & quality bars

* **Discover first, document second**: Docs mirror the codebase you actually have.
* **Coverage over depth** (first pass); iterate depth later.
* **Name what isn’t documented**: Create stubs with TODOs rather than silent omissions.
* **Make drift explicit**: Don’t hide schema mismatches—file issues or record rationale.
* **Operational truth**: If runbooks differ from reality, update them or flag for owners.

---

## PR checklist (for the agent)

* [ ] Added/updated `/docs/database/DB_DOCS_PLAN.md` with current status
* [ ] Added/updated `/docs/database/db_docs_status.json`
* [ ] Added/updated schema/adapters/migrations/ops docs
* [ ] Included `_artifacts/` snapshots (or CI links)
* [ ] Linked issues for unresolved drift
* [ ] Clear summary of changes & next steps

---

## Out of scope / escalation

* Any write or migration against production
* Data exports from production
* Secrets handling beyond reading from the environment/secret store

> If read‑only prod access is unavailable, fall back to dev/staging and record the gap in the plan.
