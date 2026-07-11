# Hub Loop — Run 2: P1 schema PROVEN; P0 activation gap DIAGNOSED (redo next)

## P1 — hubs/hub_members N-ary model: PROVEN on sample DB

Schema (schema.ts), DDL (legacy defs + `ensureHubAndCacheTables`), and accessors (`upsertHub` with inline members + onConflictDoUpdate idempotency, `replaceHubMembers`, `getHubWithMembers(host,slug)`, `findHubs({hubKind,host,memberSlug})`, `backfillHubsFromPlaceHubs`) all in news-crawler-db. **tsc exit 0.** (Note: co-developed — a fuller implementation was already present; I removed my duplicate definitions and aligned schema/DDL/types to it: `hub_members` carries both `place_id` and `place_slug`, `UNIQUE(host,canonical_slug)`, `UNIQUE(hub_id,position)`.)

Proof (`p1-hub-schema-proof.js`, sample db, PASS): **composite `russia-ukraine-war` stored as ordered `[place:russia@0, place:ukraine@1, topic:war@2]`**; idempotent re-upsert (one row, members replaced not appended); place + topic hubs also created; `findHubs({hubKind:'composite'})` returns exactly one. Flexibility requirement met — place, topic, and arbitrary-arity composite hubs share one representation.

## P0 — sitemap cache: code + unit tests done, but LIVE ACTIVATION FAILED (diagnosed)

UI restarted (worker mode, pid 219284). Activation crawl (guardian, 8pp, sitemap ON) completed, and it **fetched 140 sitemaps in the last hour** — yet `sitemap_cache` was never created in news.db ("no such table"). Diagnosis (`p0-activation-diagnose.js`): the news-crawler-db adapter DOES expose `coverage.getSitemapCache`, so the module is fine — but the LIVE crawl's `RobotsAndSitemapCoordinator._sitemapCache()` checks `this.dbAdapter.coverage`, and **the coordinator's runtime dbAdapter is the crawler's internal DB wrapper (CrawlerDb/dbClient), which has no `.coverage` namespace** → `_sitemapCache()` returns null → sitemaps fetch unconditionally, table never touched.

Consequence: the conditional-fetch benefit (304s) is NOT active in live crawls, and the file cache is already removed — so live crawls currently have NO sitemap cache at all. This is the top redo.

**Fix (next run):** in CrawlerServiceWiring / wherever the coordinator is constructed, pass a coverage-capable adapter (the news-crawler-db adapter for the crawl's DB) so `_sitemapCache()` resolves. Then re-run the activation crawl and confirm `sitemap_cache` populates + 304s appear on a second run. Only after that is P0 truly done.

## Gates NOT taken (correctly)
Did not delete tmp/sitemap-cache dirs (gated deletion; harmless to leave). No production schema was force-applied — the additive table only appears once the wiring fix lands and a real crawl exercises it.

## Files changed this run (UNCOMMITTED)
news-crawler-db: schema.ts, legacy-sqlite-schema-definitions.ts, coverage.ts (dedup + align), types.ts. copilot-dl-news: tools/crawl/{p1-hub-schema-proof.js, p0-activation-check.js, p0-activation-diagnose.js, build-db-module.js} (new). All prior run-1 files still uncommitted.
