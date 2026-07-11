# Plan: Top-Notch Hub Identification System

Written 2026-07-11 after a code/data audit. Goal: hub identification (place, topic, and composite hubs) that is accurate, measurable, continuously fresh, DB-only in its persistence, and accessed exclusively through the `news-crawler-db` module.

---

## 0. Where the system stands today (audited)

**Works:** 507 hubs identified in `place_hubs` (e.g., guardian/zimbabwe, kind=country, with nav/article link counts + evidence); `HubSeeder`, `GuessPlaceHubsOperation`, `PageExecutionService` placeHubPatterns feed it; hub-exclusive history crawls work end-to-end (proven on Zimbabwe 2026-07-11); writes already flow through `news-crawler-db` named accessors (`recordPlaceHubSeedRow`).

**Gaps found:**
- `article_places` (9,808 rows) has **zero `place_kind='country'` rows** — entity tagging and hub identification disagree about kinds; country analytics currently only work via hub URL prefixes.
- `place_hubs` supports place+topic columns but **cannot represent composite hubs** like `russia-ukraine-war` (two places + one topic).
- Hub-exclusive crawls leak ~20% off-hub pages (sidebar links).
- Analytics UI app renders blank; no hub coverage/quality dashboards.
- Persistence and DB-access discipline: see §1/§2 inventories.

---

## 1. Single store: the DB. Inventory of data-outside-DB offenders → migrations

Policy line first: **machine-readable crawl/analysis data lives in the DB, full stop.** Prose documentation (docs/) is fine. Operational plumbing (bridge inbox/outbox, pid/heartbeat files) is exempt but gets a prune policy. Everything else migrates:

| Offender (file-based today) | Migration |
|---|---|
| **Sitemap conditional-fetch cache** `tmp/sitemap-cache/*.json` (added 2026-07-07 — my own change, flagging it) | New `sitemap_cache` table + `getSitemapCache`/`upsertSitemapCache` accessors in news-crawler-db, exactly mirroring the existing `robots_cache` table (which already does this right). `loadSitemaps` gets a `cache` DI hook wired from the coordinator's dbAdapter. Delete the file cache. |
| `guardian-place-hubs.js`, `graph-feedback-live-seeds.js`, `crawl-packet.js`, `throughput-analyzer.js`, `monitored-small-crawl.js`, `sync-ledger.js`, `intelligent-crawl.js` — write JSON/report files into `tmp/` | Run outputs → `analysis_runs`/`analysis_run_events` (tables exist) or a new `tool_run_reports` table via one generic accessor pair (`recordToolRun`, `getToolRuns`). CLIs keep printing to stdout; the FILE outputs go. |
| `tmp/cycle*-notes.md`, forensics markdowns | Prose → allowed, but move to `docs/sessions/` (done for new work already); ban NEW machine-readable data under `tmp/`. |
| `campaign-status.json`, `campaign-stop`, screenshots in `tools/dev-bridge/state/` | Campaign runs/legs → `crawl_schedules`+`crawl_jobs`-adjacent new `campaign_runs`/`campaign_legs` tables via accessors (the runner then has no JSON state file; stop signal becomes a DB flag read via accessor, or stays a file as pure operational plumbing — decide at implementation; recommendation: DB). Screenshot PNGs: keep on disk (visual artifacts, not data) BUT add a `ui_screenshots` catalog table (path, taken_at, app, campaign_id) + a prune job (keep last N days). |
| `gazetteer.db`, `crawl-multi.db`, stray experiment DBs under `data/` | Consolidate: gazetteer into the main DB via the module (places tables already exist), or explicitly registered as attached DBs through one accessor; delete/archive experiment DBs after a listed review (GATED — deletion needs your sign-off). |
| `tmp/_unified-ui.log` etc. | Logs are operational; cap + rotate. Queue-drop TRACES that tools parse → telemetry events (already in DB via `crawl_wal`/telemetry history) — make the parsers read those instead. |
| **Found by the P0 guard test (2026-07-11), previously unaudited:** `CheckpointManager.js` (crawl checkpoints), gazetteer `Wikidata*Ingestor`/`WikidataService` (wikidata cache files), observatory `DecisionConfigSetRepository`/`PromotionService`/check (config sets on disk), `PuppeteerDomainManager.js` (domain state), `lib/sync-ledger.js` | Same treatment: checkpoints → `crawl_checkpoints` table (or `checkpoint` data in crawl_jobs); wikidata caches → gazetteer cache table; decision config sets → DB (they're config DATA, exactly the clutter class this plan removes); puppeteer domain state → `domain_classification_profiles`/behaviors. Inventoried + frozen in tests/guards/db-access-guards.test.js — new writers fail CI now. |

Enforcement so it stays clean: an eslint rule (`no-restricted-modules`: `fs` write APIs) scoped to `src/core/crawler/**` and `tools/crawl/**` with an allowlist (fixture server, dev-bridge), plus a CI grep test that fails on new `writeFileSync` in those trees.

## 2. Single access path: the db module only

Today there are 3½ ways code touches SQLite; the plan collapses them to one:

1. **`news-crawler-db` named accessors** (the target — `recordPlaceHubSeedRow`, `upsertRobotsCache`, `getCloudCrawlDatabaseSnapshot` are the good pattern).
2. `src/data/db/*` — a parallel in-repo layer (`CoverageDatabase`, `PlannerDatabase`, `QueueDatabase`, `EnhancedDatabaseAdapter`, `DualDatabaseFacade`). **Migrate:** move each domain's queries into news-crawler-db as accessor groups (coverage, planner, queue). Mechanical but large; do it domain-by-domain with the existing tests as the safety net. The facades become thin re-exports during transition, then die.
3. **Raw handle passing** (`resolveHandle`/`getHandle` pattern in `src/core/crawler/data/placeHubs.js` and friends) — replace with accessor calls; the handle never leaves the module.
4. **Inline SQL in tools** — `throughput-meter.js` requires better-sqlite3 directly (fix); my recent tools (`verify-crawl-delta`, `country-download-stats`, `place-hub-peek`, `recent-errors`, `db-schema-peek`) open via the adapter but embed SQL — promote each query into a named accessor (`getCrawlDeltaSince`, `getHubDownloadStatsByKind`, `findHubs`, `getRecentErrors`) and make the tools one-line wrappers.

Enforcement: eslint bans `require('better-sqlite3')` and `.prepare(` outside `news-crawler-db` (tests exempted); CI grep backs it up.

## 3. Flexible hub taxonomy — the schema centerpiece

Current `place_hubs` (place_slug + optional topic columns) can express place and place-topic but not `russia-ukraine-war`. Generalize to an N-ary membership model in news-crawler-db:

```
hubs        id, host, url_id, canonical_slug, hub_kind        -- 'place' | 'topic' | 'composite'
            title, status, confidence, evidence(json),
            nav_links_count, article_links_count,
            first_seen_at, last_seen_at, last_verified_at
hub_members hub_id, position, member_type                     -- 'place' | 'topic'
            place_id (FK places, NULL for topics),
            topic_slug (NULL for places), role                -- 'subject' | 'counterpart' | 'theme' ...
```

- Place hub = 1 place member. Topic hub = 1 topic member. Place-topic = place+topic. **`russia-ukraine-war` = members [place:russia, place:ukraine, topic:war]** — and the same model handles `israel-gaza-war`, `us-china-trade`, arbitrary arity.
- **Slug segmentation engine** (the identification brain): hyphen-token segmentation with longest-match lookups against (a) the gazetteer names in `places`/`place_names`, (b) `topic_keywords`/`non_geo_topic_slugs`; scores alternative parses (`new-caledonia` = one place, not `new`+`caledonia`; `russia-ukraine-war` = place+place+topic) and stores runner-up parses in evidence for review. Unresolvable tokens land in `place_hub_unknown_terms` (exists) with a burn-down workflow.
- **Migration:** backfill `hubs`+`hub_members` from `place_hubs` (place_kind → member rows); keep a `place_hubs` compatibility VIEW so nothing breaks; consumers move to `findHubs({kinds, members})` accessors; drop the view last. Schema changes to production news.db are **GATED** — developed and proven on a sample DB copy first, then applied with your sign-off.

## 3b. Topic lexicon is UNDER-POPULATED (found P2, 2026-07-11)

The segmentation engine's place side works against the real 737K-row gazetteer (new-caledonia → one place, real placeIds). But the topic lexicon is tiny — 73 `topic_keywords` + 12 `non_geo_topic_slugs` — and lacks common event/theme terms like **war, trade, crisis, election, protest, floods, earthquake, wildfire, ceasefire**. Consequence: composite slugs (russia-ukraine-war) currently resolve to places + an UNRESOLVED topic. Fix (bounded data task, additive): seed a curated event/theme topic set into `non_geo_topic_slugs` via a module accessor (sample-proven, then applied to production — a DATA write, not schema). This unblocks composite hubs end-to-end.

## 4. Identification pipeline — stages, all DB-only

1. **Candidate generation:** nav-link mining (exists), URL-pattern induction per publisher, sitemap-derived section URLs → `place_hub_candidates`.
2. **Interpretation:** segmentation engine parses slugs → proposed hub_kind + members (+confidence).
3. **Verification:** bounded structure-only visit (existing `ensureCountryHubs` machinery, generalized to all kinds) confirms the page is a live hub (nav/article link ratios) → `hub_validations`.
4. **Determination:** accept/reject with evidence → `hubs`/`hub_members` (+`place_hub_determinations` history).
5. **Continuous freshness:** re-verify hubs where `last_verified_at` > N days as low-priority legs inside normal campaigns; track pagination depth + `oldest_content_date` (columns exist in `place_page_mappings`) so history crawls know how deep each hub archive goes.
6. **Hub-exclusive crawl tightening:** planner honors hub URL prefix + article-URL patterns (fixes the ~20% leakage seen on Zimbabwe).

## 5. Measurement — "top-notch" must be checkable

- `hub_labels` table: hand-labeled ground truth (you label ~100 URLs per publisher once, via UI). Precision/recall computed per run and stored (`hub_ident_runs`).
- Targets: ≥95% precision on accepted hubs; coverage = % of a publisher's country/topic index pages identified (guardian has a known country list to check against); unknown-terms backlog trending down; composite detection proven on a seeded set (russia-ukraine-war, israel-gaza-war, us-china-trade).
- Freshness SLA: no accepted hub unverified > 30 days.

## 6. UI

- Fix the blank Analytics app (defect — diagnose why it renders nothing).
- **Hub Explorer** page: browse/filter hubs by kind (place/topic/composite), member chips, confidence, coverage stats; per-hub download/article counts and archive depth. Powered ONLY by new accessors.
- Extend the new `/country-downloads` chart to a general **downloads-by-hub** view (kind selector), same child-process + cache pattern.

## 7. Execution order (each step bounded + tested; GATED items marked)

- **P0 (hygiene, immediate):** sitemap cache → DB; tool run reports → DB; eslint+CI guards; throughput-meter off raw better-sqlite3. *(sample-DB tested, then applies everywhere — schema additions GATED on news.db)*
- **P1 (schema):** `hubs`/`hub_members` + accessors + backfill + compat view in news-crawler-db, on a sample copy; then GATED apply to news.db.
- **P2 (segmentation engine):** parser + gazetteer/topic lookups + tests incl. the composite set; wire into GuessPlaceHubs pipeline.
- **P3 (pipeline + freshness):** verification generalized to all kinds; re-validation legs; leakage fix in hub-exclusive mode.
- **P4 (access-path consolidation):** src/data/db domains → news-crawler-db, facades thinned then removed. *(largest mechanical chunk; runs in parallel with P2-P3 as capacity allows)*
- **P5 (measurement + UI):** hub_labels + scoring; Hub Explorer; Analytics fix; downloads-by-hub chart.

Rough shape: P0 is a day's loop work; P1+P2 are the core week; P3-P5 iterate behind them. Every phase lands with tests via the bridge (authoritative on your machine) and evidence in docs/sessions/.
