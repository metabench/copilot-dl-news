# DB-driven crawling roadmap

*Owner-directed, multi-turn. Started 2026-07-19 (Opus 4.8, mid-throughput-cycle).*
*Design produced by a map→synthesize→adversarial-review workflow; every schema
claim below is probe-verified against the live `data/news.db`.*

## Large sustained crawls + the crawl→observe→improve loop (owner directive 2026-07-20)

**Problem observed:** only 76 pages downloaded in a 6h window — the per-cycle
"standing crawls" (maxHosts 1-2, ~6 pages each) are far too small. The
crawler CAN do volume (24h window showed 10,884 pages / 3GB); it was simply
being run in tiny bursts. **The cap is NOT the bottleneck** — it's already
1.8 MB/s and actual crawls run supply/politeness-bound (~0.3-0.8 MB/s).

**The loop (what the agent does every cycle now):**
1. **Run a large, sustained, bounded crawl in the BACKGROUND** at the 1.8 MB/s
   cap. Use the existing `campaign-runner.js` (multi-hour, round-robin
   domains, bounded legs, politeness-first) via the bridge's managed
   `start-campaign` — it survives bridge restarts and outlives the cycle:
   `{action:"start-campaign", params:{durationMs, urls:"a|b|c", maxDownloads,
   legBudgetMs, port:3170, operation:"basicArticleCrawl"}}`. Stop via
   `stop-campaign` (writes a stop-file).
2. **Monitor** it — `campaign-status` now carries a `totals` rollup
   (downloaded/saved/found/errors/MB across legs; added 2026-07-20 by fixing
   bounded-dispatch to emit per-leg job progress, which it previously
   dropped) + the `/api/v1/crawl-throughput` 1h/6h/24h windows +
   `crawl-progress-monitor.js`.
3. **Improve the code** while it runs, informed by what the crawl reveals
   (low throughput → discovery/budget fix; high error rate on a host →
   fetch policy; skipped legs → preflight). Each cycle's improvement should
   make the NEXT crawl fetch more, more reliably.
4. **Compounds:** crawl → observe the bottleneck → fix it → next crawl is
   better. The debt-reduction loop (below) and this crawl-quality loop run in
   parallel — code improvements land while a crawl is in flight.

**Tuning knobs to push volume up over cycles:** per-leg `maxDownloads`
(default 25 → raise), `legBudgetMs`, host count/quality, and (a future
improvement) concurrent legs instead of strictly sequential. Politeness
stays enforced by the global 1.8 MB/s cap + per-host rate limits regardless.

**Observed bottlenecks (first campaign 2026-07-20 — the observe step; these
are the NEXT-cycle improvement targets):**
- **Throughput is supply-bound, NOT bandwidth-bound.** Leg 1 (guardian/world,
  50pp / 15-min budget) fetched only 18 pages / 8.4 MB in the full 15 min
  (~9 KB/s effective vs the 1.8 MB/s cap). The crawl runs out of *new
  articles to fetch* long before it runs out of bandwidth — a single section
  hub at basicArticleCrawl depth doesn't surface 50 fresh URLs. **Highest-
  leverage fix: better per-leg discovery/seeding** (deeper crawl, sitemap-
  driven article discovery, or seed each leg from the DB frontier's
  never-downloaded URLs for that host — which P1-P6 already compute) so a leg
  actually has 50 URLs to fetch.
- **Budget-stopped legs surface as `finalStatus:"failed"`.** Leg 1 hit its
  15-min budget (budgetEnforced:true) and its status came back "failed"
  despite fetching 18 pages / 0 errors — misleading. bounded-dispatch should
  distinguish a clean budget-stop ("stopped") from a real failure so
  campaign-status and the operator aren't alarmed by healthy legs.

## The owner's vision (verbatim intent)

> Use the data in the DB to download pages (hubs and articles) not yet
> downloaded, and add them to the DB so the links in those downloaded documents
> are then known to the system by URL. Crawling becomes DB-oriented: identify
> URLs which are relevant and not yet downloaded, or (for hubs) not recently
> downloaded — recency being 1 day for now, but a **UI-configurable** option.
> Also be able to **redownload specific place hubs** when doing place-specific
> searches.

## The key discovery — most of this already exists

The `urls` table **is already a persistent frontier**. Probed 2026-07-19:

- **1,538,590 of 1,735,558 rows (~89%) are known-but-never-downloaded** (no
  `http_responses` row with `http_status IN (200,304)`). Discovered links become
  `urls` rows automatically: page download → LinkExtractor → UrlDecisionService
  → `upsertUrl` → `INSERT OR IGNORE INTO urls`. So *"links in downloaded
  documents become known by URL"* is **already realized at the node level**.
- Rich columns already present: `status` (pending/done/fetching/error/dead),
  `classification` (hub/article/other), `host`, `analysis` (JSON), `depth`,
  `priority`, `last_seen_at`, plus denormalized `fetched_at`/`http_status`.
- **No schema change is needed** for the critical path. The DB frontier is a
  *prioritized READ* over `urls ⋈ http_responses`, not a new store.

### Ground-truth rules (do NOT deviate — each is a past bug)

1. **"Downloaded" = `http_responses(url_id, http_status IN (200,304))` ONLY.**
   `urls.status` / `urls.fetched_at` are denormalized defaults, **not maintained**
   by the live upsert path. Never use them as the fetch record. Join
   `http_responses.url_id = urls.id` — writes key on the `url` TEXT string,
   reads/joins key on `url_id` (the url-vs-url_id drift that caused the
   2026-07-19 place_hubs zero-writes regression). Referencing a `url`/`canonical_url`
   column on `place_hubs`/`place_hub_unknown_terms` **throws at prepare time**.
2. **A `urls` row does NOT imply intent to crawl.** The crawl verdict lives in
   `urls.analysis` JSON at `$.decision.allow` (a boolean → `json_extract` gives
   1/0, or NULL when analysis is absent). **Policy: admit NULL/absent analysis
   (~928k legitimate discovered links) as eligible; exclude only an explicit
   `allow=0` (~21k).** Frontier = "undownloaded AND not explicitly disallowed."
3. **`fetched_at` is MIXED format** (ISO `…Z` + space form). Every recency
   comparison must wrap it: `MAX(datetime(fetched_at))` — the aggregate is
   *inside* the `datetime()`, or ISO rows misorder.
4. **`content_analysis.content_id → content_storage.id`, NEVER `http_responses.id`**
   (a live 92%-wrong-row bug). Do not use `content_analysis` for hub detection;
   `urls.classification` + `place_hubs` membership suffice.
5. **`classification='hub'` means SECTION/nav hubs** (`/uk`, `/politics`), NOT
   place hubs. A place hub (`/world/montenegro`) can have `classification` NULL.
   Hub-kind = `classification='hub'` OR `place_hubs` membership (union, not equate).
6. **Counters lie.** Verify persistence (queue hydration, place-hub writes) with
   read-only `COUNT`/`url_id` joins, not a tool's inserted/updated return value
   (`ON CONFLICT DO NOTHING`; `savePlaceHub` re-UPDATEs in place).
7. **Frontier scans are ~5–10s** on the 29GB DB (full `urls` scan + covering
   subquery on `idx_http_responses_url_status`). **Cache them** (child process +
   server-side snapshot) — never compute in-request (synchronous better-sqlite3
   blocks the event loop). Pin/verify `EXPLAIN QUERY PLAN` on any ORDER-BY over
   `urls` (the recent-headlines forced-index lesson).
8. **Joining a small id set back to `urls` with plain SQL makes the planner
   SCAN the full 1.7M-row table** (bloom-filtering the small side) — 2.6s vs
   164ms for fetching the small id set then hydrating url/host/last-fetch per
   id via indexed PK/url_id lookups in JS (the recent-headlines pattern, reused
   for hub detection). **Give statement groups that reference different table
   sets their OWN `Symbol.for` cache key** — `getCachedStatements` eager-prepares
   every statement in a group at once, so grouping P1's simple counts with P2's
   `classification`/`place_hubs`-referencing statements meant a schema/fixture
   missing either would fail to prepare P1's statements too (caught by the P1
   test fixture breaking when P2's statements were added to the same group —
   fixed by splitting into `CACHE_KEY` / `CACHE_KEY_RECENCY`).

## Target design

- **Frontier source** = the ncdb read over `urls ⋈ http_responses` (rules above).
  Not-yet-downloaded articles are fetch-once; hubs are "due" when their latest
  `datetime(http_responses.fetched_at)` is older than a recency window.
- **Working set** = the **already-built `crawl_queue`** (ncdb `SqliteUrlQueueAdapter`,
  currently 0 rows, with a `url` UNIQUE + `status` pending→in-progress→completed|failed
  + `worker_id` lease + `updated_at` crash-recovery model). We *reuse* it, not add
  a lease column to `urls`. NB the real method names are `enqueueBatch`, `dequeue`,
  **`markComplete`** (not markCompleted), **`recoverStale`** (not reclaimStale).
- **Execution** = the copilot server is a thin ORCHESTRATOR: run the ncdb frontier
  read (cross-host) → group due URLs by host → hydrate `crawl_queue` → spawn
  bounded **per-host forked crawl jobs** seeded from the queue (honoring the
  "one job ≈ one host" forked-worker reality + per-host politeness), all paced by
  the process-wide `GlobalBandwidthLimiter`. The DB-seeded job must reuse the
  existing NewsCrawler fetch+extract path so outlinks keep upserting into `urls`
  and the frontier keeps growing.
- **Recency** flows override > persisted-default > engine-default: a per-run UI
  "Hub refresh recency (days)" input; a persisted `hubRefreshRecencyDays` in
  `data/crawl-settings.json` (the bandwidth-cap pattern); default 1 day.
- **Place-hub redownload** = the same machinery with the recency gate BYPASSED:
  resolve place → hub URLs (UNION of `place_page_mappings.place_id→url` and
  `place_hubs.place_slug→place_names→places.id`, LEFT JOIN `urls` on `url_id`,
  dedupe on normalized url), force-enqueue as hub-seeds.

## Phases (each independently shippable + verifiable)

- **P1 — Read-only frontier visibility (SHIPPED 2026-07-19).** ncdb
  `legacy-crawlFrontier.ts` (`countCrawlFrontier`, `selectCrawlFrontierByHost`,
  own `Symbol.for` cache key, allow-filter + 200/304 rules); child-process
  `tools/crawl/frontier-stats.js`; server-cached `GET /api/v1/crawl/frontier/summary`
  (3-min refresh); crawl-status "candidate URLs not yet downloaded" tile + top
  hosts. Differential-e2e trap test (hr.id-vs-url_id, 200-only, admit-disallowed
  all fail); `sql:check-ui` green. *Live: ~1.517M crawlable, 21k disallowed.*
- **P2 — Per-type recency read + UI knob (SHIPPED 2026-07-19).** `selectDueFrontier
  ({recencyMsHub, limit, host?})` → items tagged `article-new|hub-new|hub-stale`,
  hubs listed first, host-scoped variant available for the P4 per-host job path.
  `countHubRefreshFrontier` for the tile split. Hub-kind = `classification='hub'`
  OR `place_hubs` membership (content_analysis dropped per the review). Shared
  `_isAllowed` helper (a real bug: the count function initially skipped the
  disallow filter that the selection function applied — caught before shipping
  by writing the differential-e2e fixture). Persisted `hubRefreshRecencyDays`
  (default 1) + `GET/POST /api/v1/crawl/hub-recency` (bandwidth-cap pattern,
  invalidates the cached snapshot on change); crawl-status tile splits into
  "candidates (never downloaded)" + "hubs due for refresh" + a live recency
  input, verified via real click→type→blur→POST→persist in a headless browser
  (found the page renders inside an iframe at `/crawl-status`, not the shell
  document — selectors must target the frame). 11/11 differential-e2e tests
  (mixed-format MAX(datetime()) misordering, classification-only undercounting,
  monotonic recency, disallow consistency). *Live: 6,416 eligible hubs, 5,461
  due for refresh at the 1-day default.*
- **P3 — Frontier → `crawl_queue` hydration (dry-run, SHIPPED 2026-07-20).**
  `POST /api/v1/crawl/frontier/hydrate {host, limit}` composes selectDueFrontier
  with `SqliteUrlQueueAdapter.enqueueBatch` (hub priority 50 > article 10);
  `GET /api/v1/crawl/frontier/queue-stats`; crawl-status queue readout
  (pending/leased/done) + hydrate control. **Recency-vs-UNIQUE(url) decision
  (from adversarial review): completed/failed HUB rows are reset via
  `returnToPending` on re-hydration (hubs must be re-fetchable when due again);
  completed ARTICLE rows stay blocked (fetch-once). Skips are split
  requeuedHubs vs alreadyQueued so counters can't lie.** Review also forced two
  pre-deploy fixes: singleton assigned only after successful initialize()
  (poisoned-adapter trap) and a null-handle guard (adapter would silently open
  a shadow data/news.db relative to CWD). 4/4 differential-e2e (hydrate exact
  due set/priorities/idempotent; two dequeues never same url; markComplete;
  back-dated lease recovered by recoverStale; completed-hub requeue). Live
  dry-run: thehindu.com → due 50/inserted 50/pending 50; re-hydrate → inserted
  0/alreadyQueued 50; independent COUNT + priority check confirm; UI strip
  screenshot-verified.
  **Constraints recorded for P4 (review findings):** (a) dequeue claims are
  proven safe only on ONE connection — P4 must dequeue in the ORCHESTRATOR and
  hand children their seed lists, or harden the adapter (immediate()
  transaction, `AND status='pending'` guard, SQLITE_BUSY retry); (b) run
  selectDueFrontier in a child process once hydration is automated (in-request
  is click-triggered-only today; _dueHubs walks all ~6.4k hub ids before the
  host filter); (c) getStats is a full-table scan and completed rows are never
  pruned — prune/archive in P4 before the table grows large.
- **P4 — DB-seeded per-host crawl job (SHIPPED 2026-07-20).**
  `POST /api/v1/crawl/frontier/run {host, limit<=20}` dequeues from
  `crawl_queue` in the ORCHESTRATOR only (never the forked worker), builds a
  single job (`startUrl` = first URL, `overrides.seedUrls` = the rest,
  `maxDepth:0`, `useSitemap:false`, `preferCache:false`) via a new
  `CrawlOperation.run()` hook that calls the already-tested
  `NewsCrawler.prototype.seedUrls()` — **deliberately NOT
  `overrides.cachedSeedUrls`**, which an investigation found would silently
  REPLAY stale cached HTML for exactly the due/stale URLs this exists to
  refresh (the naive/obvious choice, caught before any code was written).
  Reconciles against real `http_responses` outcomes (never crawl-side
  counters) via new `selectHttpOutcomesForUrlIds`/`selectUrlIdsForUrls` ncdb
  exports; a `registry.waitForJob(jobId)` addition fixes a **BLOCKER an
  adversarial review caught pre-deploy**: `startOperation()` returns a
  sanitized snapshot with no `.promise` field, so naively awaiting `job.promise`
  awaits `undefined` and reconciles a still-running job as failed. A 20-minute
  `recoverStale` sweep (previously absent anywhere in the app) protects
  against orchestrator crashes leaving leases stuck.
  **Real gap found in the first live run** (not caught by any review — found
  by checking DB evidence after 5/5 fetches were wrongly marked failed): 50
  queue rows hydrated by the pre-fix P3 code lacked `meta.urlId`, so
  reconciliation had nothing to key on. Fixed with a `selectUrlIdsForUrls`
  fallback (write-side url lookup) resolved once per batch — proven correct
  by re-running against the SAME stale rows post-fix (3/3 completed,
  independently verified against `http_responses`).
  **Dual-direction acceptance test, live:** the 3 fetched URLs dropped out of
  `selectDueFrontier` for that host; 254 `urls` rows for the host had their
  `last_seen_at` touched since job start (outlinks keep upserting even with
  `maxDepth:0` — discovery still runs, only in-job fetching of children is
  suppressed). The mixed-format reconciliation cutoff (`job.startedAt` is
  ISO-form; `selectHttpOutcomesForUrlIds` returns space-form) is normalized
  before comparison — a differential-e2e test proves the raw-string version
  would have misclassified a genuinely-later fetch as stale. 31 new tests
  across 4 files (7 ncdb outcomes/fallback + 11 P2 regression + 5
  `CrawlOperation` seedUrls hook + 4 `waitForJob`), `sql:check-ui` green.
- **P5 — On-demand place-hub redownload (SHIPPED 2026-07-20).**
  `selectPlaceHubUrlsForPlace(db, placeId)` (ncdb `legacy-placeHubRedownload.ts`) merges
  `place_page_mappings` (place_id-keyed, reliable) with `place_hubs` (slug-keyed — matched
  against EVERY known name for the place via `generateSlugVariants`, gated by
  `place_hubs.place_kind === places.kind` to block the homonym trap
  `legacy-placeHubMaintenance.ts` warns about), deduped by normalized URL (pm wins on
  collision). `POST /api/v1/crawl/place-hubs/redownload {placeId}` (numeric — the
  codebase's established convention, not the plan's original `{place}` shorthand) force-
  enqueues (recency bypassed: `returnToPending` for any completed/failed row, same rule
  P3's hydrate uses for hubs) then runs one sequential per-host job per host in the
  place's hub set, reusing P4's exact dequeue→job→reconcile machinery — extracted from
  the inline P4 route into a shared `runFrontierJobForHost()` function (behavior-
  preserving refactor; P4's HTTP contract unchanged, verified by re-reading its error
  paths against the extraction). Guarded by a new `RedownloadCooldownGuard` (in-memory
  Map + cooldown, mirrors `HostRetryBudgetManager`'s shape) against re-click storms.
  10 new tests (3 ncdb differential incl. the live-shaped homonym trap + dedupe
  collision + unresolved/absent exclusion, 5 cooldown-guard unit). **Live: placeId 440
  (Ukraine)** — 5 known hub URLs merged from 2 sources across 5 hosts (aljazeera.com
  came ONLY from `place_hubs`, not `place_page_mappings` — proves the merge is real, not
  redundant); independently DB-verified via `http_responses`/`content_storage`:
  theguardian.com and independent.co.uk got fresh 200s with real saved content (467KB /
  277KB); edition.cnn.com (403) and telegraph.co.uk (402) were genuine site-side
  blocks, correctly reported failed; aljazeera.com was a FALSE negative — the fetch
  actually succeeded (200, saved) but at a redirect target Al Jazeera sent it to, and
  the shared P4/P5 reconciliation only checks the originally-queued url_id, not the
  redirect chain. This is a pre-existing gap in the reused P4 machinery, not new to P5
  — filed as its own follow-up (task_c1dfffd6) rather than fixed inline, since it also
  affects P4 and deserves its own scoped fix.
- **P6 — Multi-host orchestration + optional provenance** (2–3 turns, med).
  **Slice 1 SHIPPED 2026-07-20:** `POST /api/v1/crawl/frontier/run-multi
  {maxHosts<=4, perHostLimit<=20, hosts?}` — picks hosts fairly via new adapter
  method `getPendingHosts` (highest pending priority first, so hub batches beat
  article batches, then volume, then name for determinism) or an explicit list,
  and runs `runFrontierJobForHost` for each CONCURRENTLY (Promise.all). Safe by
  construction: dequeue is host-scoped (no cross-job row contention), registry
  runs allowMultiJobs, each job forks its own worker, and computeDemandSlices
  (bandwidth-cap cycle) already coordinates a worker fleet under the global cap.
  Also shipped the P3-review constraint (c): adapter `pruneTerminal(olderThanMs)`
  (terminal states hard-coded in the statement — no caller can prune live rows;
  strictly-older-than semantics matching recoverStale) wired into the existing
  5-min maintenance tick at a 7-day age. 6 new adapter tests (fair ordering,
  leased/terminal exclusion, prune age-boundary + live-row immunity). **Live:
  3 hosts (thehindu/dw/guardian) ran as 3 simultaneous jobs (started within
  71ms), 12 fetched / 11 completed / 1 genuine 404 — and dw.com's 3 completions
  all came via the redirect fallback (DW redirects bare paths to locale URLs),
  the P5-follow-up fix paying for itself at 3× in its first routine use.**
  **Slice 2 SHIPPED 2026-07-20 — the roadmap's mandatory scope is complete.**
  Periodic auto-re-hydration: `tools/crawl/frontier-due.js` (read-only child
  process running selectDueFrontier — constraint (b) honored: the ~6.4k-hub-id
  walk never blocks the server loop; ~110-145ms/host live) + a 60s scheduler
  gated on persisted `autoHydrate` settings (`GET/POST /api/v1/crawl/auto-hydrate`,
  bandwidth-cap pattern; **default DISABLED** — enabling is an explicit act;
  hydration only fills crawl_queue, fetching remains explicit via run-multi/
  place-hub redownload) + `POST /api/v1/crawl/auto-hydrate/tick` for
  deterministic on-demand top-ups. Enqueue writes stay on the orchestrator's
  single adapter connection (P4's claim-safety boundary); P3's hydrate-semantics
  loop extracted into a shared `enqueueDueItems()` used by both the route and
  the tick (route contract unchanged). Cross-turn rotation fairness:
  `src/core/crawler/hostRotation.js` `pickRotatedHosts` (least-recently-touched
  first, caller order as tie-break; in-memory soft state, separate maps for
  run-recency vs hydrate-recency), wired into run-multi's host pick AND the
  tick. 4 jest tests + live proof: tick 1 hydrated france24+wikipedia, tick 2
  ROTATED to guardian+bbc; run-multi picked thehindu/bbc/france24 concurrently
  (12 fetched / 11 completed / 1 genuine 404, bbc 3-of-4 via redirect fallback).
  **Deliberately NOT done + open questions for any future slice:** (1) the
  optional provenance work — edge-graph revival (`links`/`discovered_links`
  stale 2025-10 / 2026-05) / `urls.discovered_from` population — skipped
  because nothing currently consumes edge-ordered discovery; (2) UI knob for
  autoHydrate on crawl-status (API is the contract today).

  **Dead-hub suppression — SHIPPED 2026-07-20 (was open question 3):**
  evidence-derived and STATELESS by design — no dead_urls writes, no flags to
  go stale. `_isDeadHub` in ncdb `legacy-crawlFrontier.ts`: a hub is dead when
  it has ≥ `deadHubAfter` (default 3; 0 disables) recorded attempts AND the
  latest N are ALL non-successes (no 200/304). One future success resets it
  naturally; the P5 place-hub redownload bypasses selectDueFrontier and stays
  the manual retry override; failures that produced no http_responses row
  don't count (under-suppressing is the safe direction). The SAME helper runs
  in `selectDueFrontier` AND `countHubRefreshFrontier` (the P2 count-vs-
  selection drift lesson, enforced by construction); the summary now carries
  `hubDead`/`deadHubAfter` end-to-end (frontier-stats.js → cached snapshot →
  /frontier/summary → frontier-api.check.js). 4 vitest cases mirroring the
  live streak shapes ([404,404,404,403,403] dead; [403,403,200] alive;
  2-fails insufficient; threshold-2 semantics). **Live: hubDead=54** — the
  rule surfaced 54 persistently-failing hubs being pointlessly re-fetched
  every cycle, not just the 2 known cases; france24's new-caledonia hub
  (led the due list that morning) verified ABSENT from the post-fix due read
  while the host's healthy hubs remain. Clarifying discovery: cnn's
  /world/europe/ukraine is NOT in the auto-refresh hub set at all (no
  classification='hub', no place_hubs.url_id row — it's reached only via the
  P5 manual redownload path), so the 403-paywall "site-block" question is
  narrower than assumed: auto-retry of blocked hubs is now bounded by this
  rule, and manual redownload remains available for deliberate retries.

  **Host QUALITY policy — SHIPPED 2026-07-20 (was open question 2):** ncdb
  `legacy-newsHostPolicy.ts` — `selectEnabledNewsHostTokens` (enabled
  news_websites rows → canonical tokens from parent_domain + the url's own
  host; per-call prepare, deliberately NOT in a getCachedStatements group —
  rule-7) + pure `hostMatchesNewsTokens` (canonical equality OR subdomain
  suffix against the CURATED list — 'edition.cnn.com' passes via 'cnn.com',
  'notbbc.com'/'bbc.com.evil.example' fail the dot-boundary). autoHydrate
  gained `newsHostsOnly` (DEFAULT TRUE); tick filters candidates BEFORE
  rotation and reports `filteredOut` so the exclusion is visible, never
  silent. 4+1 vitest cases incl. the live wikipedia case. Live-verified:
  tick filteredOut=[wikipedia,thehindu] — the second exclusion exposed a
  DATA gap (The Hindu, crawled deliberately for weeks, had no news_websites
  row; the only missing host among all 11 actively-crawled today) — fixed by
  inserting the curated row (added_by 'agent-2026-07-20-news-host-policy'),
  re-tick then filtered ONLY wikipedia. Companion check tool:
  `tools/dev-bridge/checks/frontier-api.check.js` (one-command read-only
  probe of the whole P1-P6 API surface).

## Cross-links (extend, don't duplicate)

- [place-hub-intelligence.md](place-hub-intelligence.md) — place-hub identification
  + a revalidation-scheduler task that P5/P6 should build on, not re-invent.
- [hub-identification-top-notch-plan.md](hub-identification-top-notch-plan.md) —
  hub detection heuristics feeding the hub-kind test in P2.
- ROADMAP R-12 (Dynamic hub refetching) — P2/P4 recency is the concrete mechanism.

## Open decisions carried forward

- NULL-analysis admission rule is DECIDED (admit). Robots re-check on DB-seeded
  fetch: rely on NewsCrawler's own robots handling (confirm in P4).
- One cross-host job vs orchestrator-of-per-host-jobs: **orchestrator** (matches
  forked-worker + per-host-politeness reality). Revisit only if a cross-host
  single-queue mode is later added.
