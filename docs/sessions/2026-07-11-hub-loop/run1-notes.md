# Hub Loop — Run 1 (P0 hygiene): COMPLETE, activation gate named

## (a) Sitemap cache → DB (file cache eliminated)

- news-crawler-db: `sitemap_cache` drizzle schema + legacy DDL (CREATE IF NOT EXISTS) + `getSitemapCache`/`upsertSitemapCache` on `SqliteCoverageAccess` + optional interface entries in types.ts. **tsc exit 0.**
- copilot-dl-news: `sitemap.js` rewritten — file cache (fs/path/crypto, tmp/sitemap-cache, env dir) GONE; cache is now an injected async `{get,set}` contract. `RobotsAndSitemapCoordinator._sitemapCache()` wires it from the adapter's coverage namespace (null-safe: no accessors → unconditional fetching, never breaks).
- Tests: sitemap.cache suite rewritten for DB-cache DI — **5/5**; coordinator suite **6/6**; live smoke on a SAMPLE db (`hub-p0-sample.db`, copied from c6-fail-probe): accessors present, insert/get/update round-trip **OK**.
- **ACTIVATION (gate for next run):** the running UI still has the old module in memory; a UI restart activates the DB cache — and the additive `sitemap_cache` table will be auto-created in production news.db at the next writer init (CREATE IF NOT EXISTS, purely additive, no existing data touched). Per ground rule 2 this production schema addition is GATED — named on the next prompt's `next:`.
- Cleanup note: old `tmp/sitemap-cache/` dirs (sandbox + operator machine) can be deleted — deletion is gated; listed for the same gate.

## (b) throughput-meter → db module

`openLocalDb` now uses `openNewsCrawlerDb`; zero direct better-sqlite3 requires remain in `src/core/crawler` + `tools/crawl` (guard-proven).

## (c) Guards live — and immediately valuable

`tests/guards/db-access-guards.test.js` (**3/3**): bans better-sqlite3 requires and file-writers outside a shrinking allowlist. First run caught **10 unaudited file-writers** (CheckpointManager, 3× gazetteer Wikidata cache writers, 3× observatory config-set writers, PuppeteerDomainManager, lib/sync-ledger, run.js) — inventoried, frozen in the allowlist with migration notes, and added to plan §1's table. Any NEW writer now fails the suite.

## State for next run

Files changed (UNCOMMITTED): news-crawler-db {schema.ts, legacy-sqlite-schema-definitions.ts, coverage.ts, types.ts} · copilot-dl-news {sitemap.js, RobotsAndSitemapCoordinator.js, throughput-meter.js, tests/guards/*, tools/crawl/{build-db-module.js, p0-sitemap-cache-smoke.js}} · plan doc updated.
