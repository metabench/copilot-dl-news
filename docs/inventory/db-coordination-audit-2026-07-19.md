# DB-Coordination Migration Map — copilot-dl-news → ncdb (2026-07-19)

Mission frame: **copilot-dl-news holds coordination** (policy, orchestration, scoring);
**all DB-shaped logic** (raw SQL, DDL, prepared statements) should live in **ncdb**
(`news-crawler-db`, required as `news-crawler-db`). This is an audit of the raw-SQL
still in copilot, produced by a multi-agent workflow (4 parallel mappers → synthesis →
adversarial verify). ~52 copilot `src` files still contain raw SQL.

## State of the migration

Copilot is **already very thin on the hot path**: `src/core/crawler` + `src/core/orchestration`
contain **zero live raw SQL** — ~40 `require('news-crawler-db')` sites and pure coordination
calls (`recordHubValidation`, `getDomainFetchPolicy`, `createPlaceHubUrlPatternsStore`,
`upsertLegacyArticleRecord`); the only SQL literal is a dead `query_telemetry` TODO comment
(`IntelligentCrawlerManager.js:652`). `src/server`/`src/api` are nearly there too — essentially
all remaining server SQL is in **one file** (`src/server/place-hub-review/registerPlaceHubReviewRoutes.js`)
plus a single `DELETE FROM background_tasks` (`src/api/routes/background-tasks.js:310`).
The genuine remaining DB-shaped surface is in **`src/tools`** (CLI utilities), **`src/intelligence`**
(matching/analysis), and **`src/shared/utils`** core-table access.

ncdb surface: a repository adapter via `createDbAdapter({type})` exposing ~55 async access
classes, **plus** a large flat set of `legacy-*` exports (module headers say "retired copilot X
surface" / "owns the FTS5 SQL previously embedded in copilot-dl-news"). So most copilot raw-SQL
sites have a ready db-first home keyed by the original copilot filename. **SQLite is fully built
out; Postgres covers only a small core** — the biggest structural gap.

## ⚠ Gotcha (hard-won): delegation ≠ free repoint

An ncdb export with a matching *name* may have **evolved different semantics**. Verify each
candidate adversarially (columns, filters, ordering, side-effects, return shape) against the
copilot raw SQL **before** repointing.

Worked example — the ranked "#1 safest" candidate was **rejected by adversarial verify**:
`src/tools/analysis-run.js:610` `SELECT COALESCE(MAX(analysis_version),0) FROM content_analysis`
→ `getLatestAnalysisRunVersion(db)`. The ncdb export reads `MAX` across **both** `analysis_runs`
**and** `content_analysis` (returns the higher) **and** runs `ensureAnalysisRunSchema` (DDL
side-effect on a read handle). After a dry/aborted run, `analysis_runs` holds a version
`content_analysis` never got → the auto-increment silently jumps. **NOT a semantics-preserving
swap.** To make it safe: add a dedicated single-table ncdb export
`getLatestContentAnalysisVersion(db)` (no schema side-effect) and repoint to *that* — i.e. this
one needs **ncdb-side work**, not a copilot repoint.

## Ranked delegation candidates (verify each before implementing)

### Tier A — existing ncdb export, isolated (still need per-candidate semantic verify)
- `src/tools/sync-site-geo.js:71-131` — `domain_locales` upsert (+www backfill), coverage count → `upsertDomainLocaleRows`, `createSqliteGeoImportAccess`, `countNewsWebsites`.
- `src/tools/add-planet-hub.js:35-63` — synthetic `places` + `place_names` insert → `GazetteerDatabase`/`createGazetteerDatabase` writers.
- `src/tools/analyze-single-page.js:118-332` — `MAX(analysis_version)` + `content_analysis` confidence UPDATE/INSERT → analysis exports (keep the *scoring* in copilot; delegate the I/O). (Same two-table MAX caveat as above.)

### Tier B — existing export, but DDL to delete / coverage to confirm (moderate)
- `src/tools/detect-articles.js:69-134` — canonical 4-table article read join (`urls⋈http_responses⋈content_storage⋈content_analysis@MAX(version)`); **duplicated** in `find-place-hubs.js:219` and `ArticlePlaceMatcher.js:55`. Repoint all three to one export (`SqliteUrlListingAccess.selectUrlPage` / `ArticleOperations` / article-search adapter).
- `src/tools/milestones.js:36-117` — delete duplicate `CREATE TABLE/INDEX crawl_milestones` DDL (ncdb owns the schema), repoint the INSERT → `insertCrawlMilestone`.
- `src/tools/gazetteer-cleanup.js:99-499` — row-level dedup over `places`/`place_names`/`place_external_ids` → `dedupePlaceSources`, `deleteNamelessPlaces`, `createClassicGazetteerDeduplicationStatements` (keep the maintenance orchestration in copilot).

## GAPS — copilot has DB logic, ncdb has NO export yet (future ncdb-side work)

- **Postgres parity (biggest hole).** `urlListing`, `taskEvents`, `remoteCrawler`, article FTS
  search, the whole gazetteer/placeHubs surface, and **all** flat `legacy-*` exports are
  **SQLite-only**. Article FTS is FTS5-only (no Postgres tsvector search).
- **place-hub-review write surface** (`registerPlaceHubReviewRoutes.js`, the densest raw-SQL file
  left): `:85` `place_hub_audit` insert (no owner → needs `recordPlaceHubAudit` + schema
  ownership, would retire the `PRAGMA table_info` guard at `:69`); `:260` `place_page_mappings`
  upsert (ncdb reads but has no writer — `upsertPlaceMapping` missing); `:234`/`:285` non-geo-slug
  upsert + unknown-term clear (needs `addNonGeoSlug`/`clearUnknownTerm`); `:256`
  `place_hub_candidates` `setValidationStatus`; `:118/:139/:169` review-queue list reads.
- **`src/api/routes/background-tasks.js:310`** `DELETE FROM background_tasks` — ncdb owns
  background_tasks CRUD **except delete** (`deleteBackgroundTask` missing). Only raw SQL in `src/api`.
- **Derived/materialized tables** (schema-shaped, should become ncdb builders):
  `populate-place-names.js:18-54` (`place_name_lookup` rebuild + indexes), `nonGeoTopicSlugs.js:20-57`
  (`CREATE TABLE non_geo_topic_slugs` + CRUD), `match-articles.js:71-179`
  (`article_matching_runs`/`article_place_matches`).
- **Rich `content_storage` CRUD.** `HttpRequestResponseFacade.js:224-380` (TTL/category/compression
  cache facade) has no 1:1 ncdb cache facade — delegate row I/O, keep policy, but the export must be built.

### Leave in copilot (not migrations)
- `crawl-query-benchmark.js:24-152` — raw SELECTs ARE the point (perf probes).
- `IntelligentCrawlerManager.js:652` — dead `query_telemetry` TODO; if ever built it becomes an
  ncdb telemetry writer (`adapter.telemetry.insertTaskEvent`), NOT a `db.prepare()` in copilot.
- Test-fixture DDL (`placeHubReviewApi.test.js:23`, `mountBackgroundTasks.test.js:36`) — rebuild
  from ncdb schema helpers if touched.

## Recommended next moves
1. **place-hub-review write surface** is the highest-leverage single-file cleanup, but it needs
   several NEW ncdb exports first (audit → build ncdb methods → repoint the one copilot file).
2. Tier B `milestones.js` DDL-delete + `insertCrawlMilestone` repoint is a plausible small
   same-repo slice — **verify the `insertCrawlMilestone` semantics + who owns the schema first**.
3. For any analysis-version delegation, first add a single-table `getLatestContentAnalysisVersion`
   to ncdb; the existing two-table `getLatestAnalysisRunVersion` is a behavior change here.

## Verified verdicts (2026-07-19 follow-up — adversarial per-candidate check)

Three candidates were adversarially verified against the runtime `dist/db/index.js` + call sites.
**All THREE are NOT_SAFE as same-repo repoints** — every one is a behavior change, not a no-op.
The through-line: the migration for these is **ncdb-side work** (add a NEW export whose SQL exactly
reproduces the copilot semantics), NOT reuse of an existing name-matching export.

- **A — `milestones.js` INSERT → `insertCrawlMilestone`: NOT_SAFE.** The ncdb export EXISTS
  (`dist/db/index.js:961`) with exact columns, BUT it binds `ts` as a caller-supplied positional
  param; copilot computes `ts` inside SQL as `datetime('now')` (UTC, second precision). No way to
  make ncdb emit `datetime('now')` internally → the stored timestamp changes. Also deleting
  `ensureMilestoneSchema` removes a safety net for the `AnalysisTask.js:385` call site (externally
  supplied `this.db`, not verified ncdb-ensured). UNBLOCK: add ncdb `insertCrawlMilestoneNow(db,
  {jobId,kind,scope,target,message,details})` that computes `ts=datetime('now')`, then repoint +
  confirm the AnalysisTask handle is schema-ensured before deleting the DDL. Smallest blast radius.
- **B — `sync-site-geo.js` upsert → `upsertDomainLocaleRows`: NOT_SAFE.** Copilot uses
  `ON CONFLICT(host) DO UPDATE SET country_code=COALESCE(excluded.country_code, …)` (PRESERVES
  existing non-null); ncdb export uses `INSERT OR REPLACE` (blind overwrite), omits `updated_at`,
  defaults `primary_langs='es'`, rewrites `confidence` → clobbers data. The www-canonicalization
  needs `DO NOTHING` + `DELETE` (INSERT OR REPLACE can't express). The two coverage counts match no
  ncdb export. UNBLOCK: new ncdb upsert reproducing the COALESCE-preserve semantics + a DO-NOTHING
  helper + the two filtered counts.
- **C — `detect-articles.js` 4-table join → article-read export: NOT_SAFE.** Copilot's load-bearing
  filter is the per-`content_id` correlated `ca.analysis_version = (SELECT MAX(...) WHERE content_id
  = cs.id)`; ncdb only has `MAX(analysis_version)` as a global scalar or against `analysis_runs` —
  never the per-content dedup. Swapping returns duplicate/arbitrary-version rows; `listArticlesWithContent`
  also uses INNER JOINs + omits `analysis_json`. Largest blast radius (3 call sites). UNBLOCK: new
  ncdb article-read export carrying the per-`content_id` MAX subquery + LEFT JOINs + `analysis_json`.

**Meta-lesson (reinforced):** among the audit's "plausible" small slices, the adversarial check
found 0/3 safe — every name-matching ncdb export had a real semantic divergence. Do NOT repoint
without a per-candidate semantic verification; the copilot→ncdb delegation is gated on ncdb-side
exports, not copilot edits.
