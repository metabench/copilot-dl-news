# Hub Loop — Run 3: P0 ACTIVATED (sitemap cache live in production news.db)

## The bug (from run 2) and the two-part fix

The live crawl's sitemap loading goes NewsCrawler:1883 → coordinator.loadSitemapsAndEnqueue → loadSitemaps({cache}), so the cache opts WERE passed — but `_sitemapCache()` resolved to null at runtime. Two root causes, both fixed:

1. **Coverage namespace was one level too deep.** The live `crawler.dbAdapter` is `CrawlerDb`, whose coverage lives on `adapter.db.coverage` (that's how `CrawlerDb.getRobotsCache` reaches it), not `adapter.coverage`. Fixed `RobotsAndSitemapCoordinator._sitemapCache()` to resolve `adapter.coverage || adapter.db.coverage || adapter.db.access.coverage || adapter._getCoverageAccess()` — mirroring the proven robots-cache resolution. The drizzle `SqliteCoverageAccess.upsertSitemapCache` self-ensures the table.
2. **Raw-accessor fallback unwrapped only one level.** Hardened `sitemapCacheRaw.ts resolveHandle` to recurse (CrawlerDb → NewsDatabase → better-sqlite3) up to 5 levels — proven in isolation (`p0-resolve-handle-proof.js`: double-nested wrapper → leaf → round-trip PASS). This is the module-side belt-and-braces; the coverage path (#1) is what fires live.

## Activation PROVEN in production news.db

After UI restart + a 5pp guardian crawl: **sitemap_cache has 2 rows** — news.xml (548KB body + ETag) and video.xml (17KB + ETag). A second crawl a minute later: rows stayed at **2 (updated, not duplicated)**, fetchedAt advanced 06:53→06:54, and etags ROTATED (news.xml hash-2561…→hash9153…). That proves the full cycle: cache read → conditional request sent → Guardian returned 200 with a new etag (it genuinely changed its sitemap in the 1-min gap — documented behavior) → cache updated. 0 live 304s this pair is legitimate (origin changed); 304 reuse is proven at unit level (sitemap.cache 5/5) and was proven live earlier (working-well c15).

Regression check: sitemap.cache 5/5, RobotsAndSitemapCoordinator 6/6, db-access guards 3/3. tsc 0.

## P0 now truly COMPLETE. Files changed run 3 (UNCOMMITTED)
news-crawler-db: sitemapCacheRaw.ts (recursive resolveHandle). copilot-dl-news: src/core/crawler/RobotsAndSitemapCoordinator.js (coverage resolution) + tools/crawl/{p0-resolve-handle-proof, p0-wiring-diagnose, p0-crawlerdb-probe, p0-activation-check}.js. P2 (slug segmentation engine) not started — clean handoff.

## Note for next run
The functional raw-accessor path (#2) is now unused in the live path (coverage path #1 wins) but kept as a hardened fallback + it's independently tested. If simplifying later, the coverage path is the one that matters.
