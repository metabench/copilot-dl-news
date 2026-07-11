# Cycle 15 — Conditional Sitemap Fetching: SHIPPED + PROVEN LIVE

## Change

`src/core/crawler/sitemap.js`: `loadSitemaps` now does RobotsCache-style conditional fetching. File-backed body cache (`opts.cacheDir`, default `$CWD/tmp/sitemap-cache`, env `CRAWLER_SITEMAP_CACHE_DIR`) stores `{etag, lastModified, fetchedAt, body}` per URL. Warm cache → `If-None-Match`/`If-Modified-Since`; **304 → body reused, discovery intact, ledger row records 304/0-bytes**. Optional TTL (`opts.cacheTtlSeconds`, env `CRAWLER_SITEMAP_CACHE_TTL_SECONDS`, default 0 = always revalidate — correct for news sitemaps) skips the network entirely within-window (no synthetic ledger row). `opts.fetchImpl` injection added for tests. Cache failures are best-effort and never break loading. UNCOMMITTED (commits are operator-gated).

New: `src/core/crawler/__tests__/sitemap.cache.test.js` (4 tests). Suites: 10/10 green (incl. RobotsAndSitemapCoordinator 6/6 with c13 knob guard).

## Live proof (2026-07-07, sandbox shadow repo)

1. Full `crawl:sample` pair vs theguardian.com/world (`--keep-db`, bounded 3 pages): both runs fetched news.xml+video.xml; ledger shows 200s both times — legitimate: Guardian's etag/content actually changed in the 2-minute gap (news.xml grew 530500→531646; etags rotated). Discovery intact (502/503 URLs enqueued). Correct behavior: revalidate, re-download only when changed.
2. Engine-direct pair seconds apart (video.xml): run1 `200, 21776 bytes, 21 urls` → run2 **`304, 0 bytes, 21 urls`**. The 574KB-class re-download waste (c8/c9) is eliminated whenever content is unchanged.
3. Direct origin probe: Guardian honors `If-None-Match` (200→304 with same etag). Weak etags rotate with content — 304s are unattainable only when content truly changed.

## Sandbox shadow-repo recipe v2 (supersedes c11 notes; c11's cifix.js was pruned)

- npm CLI HANGS in this sandbox (registry reachable via node fetch — npm itself never progresses). Workaround: copy pure-JS deps from mounted `news-crawler-db/node_modules` / `copilot-dl-news/node_modules` / sibling repos into `/tmp/shim/node_modules`; iterate on `Cannot find module` (loop: require → parse missing → cp). NODE_PATH=/tmp/shim/node_modules catches requires from MOUNTED trees (jsgui3-html sibling needs lang-tools/obext/jsgui3-gfx-core).
- better-sqlite3 native: prebuilt GitHub download unreachable; built from npm tarball source. Node headers: resumable ranged download (~10MB at trickle speed) → `node-gyp configure --nodedir=...`. Big TUs exceed the 44s call cap and make deletes partial objects: capture `make -n` to a script, compile `sqlite3.o`/`better_sqlite3.o` manually at `-O1`, `ar crs` the archive, run link lines, skip test_extension. Binary at /tmp/shim/node_modules/better-sqlite3 (session-scoped — rebuild after reset following this recipe).
- Shadow copy gotchas: copy src TOP-LEVEL FILES too (cache.js, crawl.js — `src/*/` glob misses them); `src/ui` IS required (run.js dispatch boots unified UI; c11's "minus ui" is wrong since c13). cifix.js recreated at /tmp/work/cifix.js (case-insensitive require fallback; copy into repo tmp/ if wanted permanently).
- Sandbox network ≈ 100–300KB/s trickle; guardian robots+seed+sitemaps fit in watch-timeout 24–28 (calls capped 44s). Mount can serve stale bytes VM-side after host Writes: verify with wc -c; heredoc-rewrite VM-side to force.

## Follow-ups (not blockers)

- Scorecard timing anomaly in shadow runs: PROGRESS showed visited:1 downloaded:1 while scorecard read 0 downloads from the sample DB — diagnose whether the writer flushes after the watch window (affects sandbox proof runs only).
- Coordinator could pass a shared cacheDir per-crawl-db rather than CWD default (nice-to-have).
