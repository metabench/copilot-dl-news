# Plan – Phase 2: Structure Miner + Layout Signature Storage

## Objective
Plan and stage implementation for (A) a production-ready Structure Miner tool (batch clustering of pages by structure/template) and (B) durable DB storage for layout signatures and templates, including tests/checks and schema-sync workflow.

Scope note:
- `layout_signatures` already exists in the current DB and in the canonical schema definitions.
- `layout_templates` does not currently exist.
- A legacy/experimental miner exists at `tools/structure-miner.js` but it creates extra tables ad-hoc (`layout_masks`) that are not present in the canonical schema.

## Done When
- [ ] A concrete schema + query plan exists for `layout_templates` (and any supporting tables), with explicit indexes and example queries.
- [ ] A concrete tool plan exists for Structure Miner (CLI surface, data sources, output artifacts, error handling, perf constraints).
- [ ] Test/validation plan is executable and specific (`npm run test:by-path ...`, `npm run schema:check`, plus a small `checks/*.check.js`).
- [ ] Risks + rollout strategy are documented (how we avoid breaking existing crawls and avoid schema drift).
- [ ] `SESSION_SUMMARY.md` records what’s already present (so future work doesn’t re-invent tables/tools).

## Change Set (initial sketch)
Planning-only deliverables (this session):
- docs/sessions/2025-12-20-phase2-structure-miner-layout-signatures/PLAN.md (this file)
- docs/sessions/2025-12-20-phase2-structure-miner-layout-signatures/WORKING_NOTES.md (commands + evidence)
- docs/sessions/2025-12-20-phase2-structure-miner-layout-signatures/FOLLOW_UPS.md (implementation backlog)

Expected implementation files (next session / execution phase):
- tools/structure-miner.js (either promote/modernize or replace with a new CLI while keeping compatibility)
- src/db/sqlite/v1/schema-definitions.js (via `npm run schema:sync` after applying real DB schema changes)
- src/db/sqlite/v1/queries/layoutSignatures.js (new)
- src/db/sqlite/v1/queries/layoutTemplates.js (new)
- src/db/sqlite/v1/queries/layoutMasks.js (already exists; will align with schema if we keep masks)
- tests/db/sqlite/layoutSignatures.test.js (new)
- tests/tools/structure-miner.test.js or equivalent (new)
- checks/structure-miner.check.js (new)

## Risks & Mitigations
- Schema drift risk (tables created by tools but not added to canonical schema):
	- Mitigation: no tool should `CREATE TABLE` in production mode; schema changes happen explicitly then `npm run schema:sync`.
- Signature “level” semantics mismatch across implementations:
	- Observation: `src/analysis/structure/SkeletonHash` documents Level 1 as “template (high specificity)” and Level 2 as “structure (low specificity)”.
	- Observation: the newer `src/teacher/SkeletonHasher` uses L1 as coarse (tags only) and L2 as finer.
	- Mitigation: store additional metadata in DB (`algorithm`, `variant`, `kind`), and don’t rely on an ambiguous integer `level` alone.
- Performance risk when scanning large `http_responses` / `content_storage`:
	- Mitigation: miner supports `--limit`, `--since`, batching, and read-only default; use indexed predicates and avoid loading giant blobs unnecessarily.
- WAL mode + tests: multiple SQLite connections cause invisible writes.
	- Mitigation: tests use a single handle from `ensureDatabase()` and clean up `-wal/-shm` files.

## Current Reality (what exists today)
- DB table `layout_signatures` exists:
	- Columns: `signature_hash` (PK), `level` (INTEGER), `signature` (TEXT), `first_seen_url` (TEXT), `seen_count`, `created_at`, `last_seen_at`
	- Index: `idx_layout_signatures_level ON layout_signatures(level)`
- There is no `layout_templates` table in the DB.
- `layout_masks` table is not present in the DB, but a query module exists at `src/db/sqlite/v1/queries/layoutMasks.js` and the legacy tool creates `layout_masks` ad-hoc.
- Legacy miner: `tools/structure-miner.js`:
	- Reads recent HTML from `http_responses` + `content_storage`.
	- Computes signatures using `src/analysis/structure/SkeletonHash`.
	- Upserts into `layout_signatures`.
	- Optionally generates “dynamic node masks” using `src/analysis/structure/SkeletonDiff` and writes `layout_masks` (currently ad-hoc).

## A) Structure Miner — Detailed Plan

### Goal
Given a batch of fetched pages (raw HTML and/or Teacher-rendered HTML), compute structural signatures, cluster pages by template, and emit both:
1) DB upserts (signatures + template metadata), and
2) human-usable artifacts (top clusters, example URLs, optional masks).

### Inputs (data sources)
Minimum viable:
- `http_responses` → `content_storage` blobs (already used by legacy miner).

Optional enhancements:
- Teacher-rendered HTML (if we later persist rendered HTML or visual skeletons) for JS-only pages.

### Algorithms
Keep two independent “producers” (for now) but make them explicit:
- Producer `static-skeletonhash-v1` (fast): `src/analysis/structure/SkeletonHash`.
- Producer `teacher-skeletonhasher-v1` (slower, JS capable): `src/teacher/SkeletonHasher` + `TeacherService` (requires rendering and a different data representation).

Important: the DB must store producer metadata so we can compare/cluster within the same producer/variant.

### CLI surface (proposed)
Add a supported CLI entry (either modernize existing `tools/structure-miner.js` or wrap it):
- `node tools/structure-miner.js --db <path> --limit <n> --since <iso|unix> --levels 1,2`
- `--producer static|teacher` (default `static`)
- `--dry-run` default true; require `--write` to persist
- `--json` to emit machine-readable summary
- `--mask` options gated behind `--write` and presence of schema tables

Output summary fields (text and JSON):
- scanned pages, skipped pages (decompression errors, missing blobs), signatures inserted/updated
- top clusters for each `kind` (coarse vs template)
- sample URLs per cluster

### Safety
- Read-only by default.
- If `--write`, must verify schema presence for all required tables (fail fast with a clear message).
- Never `CREATE TABLE` as a side effect in the production path; only allow a local dev-only “bootstrap” flag if we truly need it (prefer not).

### Integration checkpoints
- Provide one focused `checks/structure-miner.check.js` that runs against a temporary DB seeded with 3–5 HTML samples and asserts:
	- signatures computed deterministically
	- cluster counts match expectations
	- upserts update `seen_count` and `last_seen_at`

## B) Signature + Template Storage — Detailed Plan

### Goal
Make `layout_signatures` useful long-term (stable semantics, query helpers), and introduce `layout_templates` to store curated template-level knowledge (e.g., extraction config, masks, notes).

### Schema design (proposed)
1) Keep `layout_signatures` but evolve it (non-breaking if possible):
	 - Add columns:
		 - `producer TEXT NOT NULL DEFAULT 'static-skeletonhash-v1'` (or `algorithm`)
		 - `kind TEXT NOT NULL DEFAULT 'l2'` with CHECK in ('l1','l2') (or rename `level` usage)
		 - (Optional) `signature_version INTEGER NOT NULL DEFAULT 1`
	 - Add indexes:
		 - `(producer, kind)` for fast cluster scans
		 - `(producer, kind, seen_count DESC)` for “top clusters” queries

2) Add `layout_templates` (new):
	 - Purpose: “curated clusters” / templates derived from signatures.
	 - Columns (initial):
		 - `id INTEGER PRIMARY KEY AUTOINCREMENT`
		 - `producer TEXT NOT NULL`
		 - `signature_hash TEXT NOT NULL` (FK → layout_signatures.signature_hash)
		 - `host TEXT` (optional scoping)
		 - `label TEXT`, `notes TEXT`
		 - `example_url TEXT` (or `example_url_id INTEGER` if we want FK to urls)
		 - `extraction_config_json TEXT` (future: readability selectors, etc.)
		 - `created_at`, `updated_at`
	 - Indexes:
		 - `(producer, signature_hash)` unique
		 - `(host)` if we expect host-scoped template lookup

3) Decide on masks:
	 - Option A (recommended): model masks as part of templates (columns on `layout_templates`)
	 - Option B: keep separate `layout_masks` table (requires adding it to schema + DB) and keep existing query module.

Given current repo state (query module exists), Option B may be lower friction if masks are actively useful; but it must be made “real” (present in DB + canonical schema) to avoid drift.

### Query modules
Create query wrappers so application/tool code stops writing raw SQL:
- `createLayoutSignaturesQueries(db)`:
	- `upsertSignature({signature_hash, producer, kind, signature, first_seen_url})`
	- `getTopClusters({producer, kind, limit})`
	- `touchObservation({signature_hash, url, seenAt})` (optional)
- `createLayoutTemplatesQueries(db)`:
	- `upsertTemplate({producer, signature_hash, host, label, notes, example_url, extraction_config_json})`
	- `getByHost({host})` / `getBySignature({signature_hash})`

### Migration workflow (how we keep schema canonical)
- Apply schema changes to the real DB.
- Run `npm run schema:sync` to regenerate `src/db/sqlite/v1/schema-definitions.js`.
- Run `npm run schema:check` to ensure no drift.

### Tests / Validation
Targeted tests (must use `npm run test:by-path`):
- Query module tests for upsert/get logic using a temp DB.
- A small Structure Miner check script (see above).

## Evidence / Commands (to record in WORKING_NOTES.md)
- `node tools/db-schema.js table layout_signatures`
- `node tools/db-schema.js table layout_templates` (after migration)
- `npm run schema:check`
- `npm run test:by-path <new tests>`

## Tests / Validation
Planning-stage validations (now):
- Confirm DB reality matches assumptions using `node tools/db-schema.js`.

Execution-stage validations (next):
- `npm run schema:check`
- `npm run test:by-path tests/...`
- `node checks/structure-miner.check.js`
