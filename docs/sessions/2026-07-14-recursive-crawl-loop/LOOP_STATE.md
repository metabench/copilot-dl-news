# Recursive crawl loop — state

> This file IS the loop's memory. Every turn: read it, do ONE small item,
> update it (move items, add findings, bump the log), commit via the bridge
> when a coherent chunk lands. Keep it under ~150 lines; prune ruthlessly —
> completed items move to the log as one-liners.

## How this machine is driven (context anchors)

- **Bridge**: write `{ "action", "params" }` JSON → `tools/dev-bridge/inbox/<name>.json`;
  read `outbox/<name>.result.json`. Actions: ping, status, start-electron,
  stop-electron, ui-screenshot, start-ui, run-node (repo scripts), run-tests,
  http (localhost relay), kill-pid, tail-log, start-campaign, restart-bridge.
  If no result and `state/hb-*.json` is stale → bridge down → relaunch
  `tools\dev-bridge\start-dev-bridge.cmd` via File Explorer address bar
  (computer-use).
- **App**: Electron unified shell, port 3170, crawl view at `/crawl-status`.
- **Crawl API**: `POST http://127.0.0.1:3170/api/v1/crawl/operations/<op>/start`
  body `{ "url", "overrides": { maxPages, maxDownloads, maxDepth } }`;
  jobs snapshot at `GET /api/v1/crawl/jobs` (carries live `progress` incl.
  `remoteFetch`).
- **Gotchas**: host↔sandbox file mount lags both ways — verify host truth via
  `checks/file-grep.js` before restarting processes; Electron ignores
  NODE_PATH; jsgui3 raw-text fix means CSS/JS inject fine via `.add()` now.
- **DB**: `data/news.db` (28GB, WAL). Never open with a second exclusive
  writer while the app runs. Migration state: v41 applied (hosts canonical).

## Now (pick the top item, keep it small)

1. Revalidation scheduler: drain listHubsNeedingRevalidation on a cadence
   (policy-aware fetch now exists); then run learn→guess across the
   remaining seeded hosts (lemonde puppeteer TRIAL unproven, reuters
   guess) and record outcomes in fetch-policy evidence.
2. LeMonde/Reuters access: both anti-bot-blocked (LeMonde = HTTP 402 on
   every fetch; Reuters start URL silently policy-blocked → 0-page green
   "completed"). Try puppeteer fallback for lemonde.fr (extend static list
   or auto-learn from 402s?); make 0-download completions surface as
   warnings, not green.
2. errorSummary gap: FetchPipeline.recordError → crawler._recordError does
   NOT emit url:error, so job.errorSummary missed LeMonde's real 402s (log
   file caught them). Wire fetch errors into url:error (or the summary
   directly) so the jobs API carries samples.
3. crawl API nit: start body key is `startUrl` (`url` → 400). Consider
   accepting both in operations.js.

## Next (short backlog — refill as items complete)

- Remote fetch live trial: deploy `worker-server.js` to the Oracle box
  (tools/dev/remote-deploy.js from this machine), set `.fleet-host`, run a
  crawl with CRAWL_REMOTE_FETCH=true, watch the remote strip.
- dev-bridge hardening: port-conflict refusal in start-electron, server
  boot-stamp identity check, reap-orphans action.
- Apply `data-admin-theme="vs-2005"` to crawl-observer + shell pages.
- Remove String_Control workaround in CrawlStatusPage (renderer now fixed).
- jsgui3-html dependabot: 48 vulns (12 high) — review lockfile bumps.
- deploy/remote-crawler-v3: empty scaffold — build or delete.
- Country-hub coverage: re-run guess-place-hubs for a new publisher
  (lemonde.fr) to exercise migration-41 write paths end to end.

## Findings / decisions log (newest first, one line each)

- 2026-07-17 (12): PLACE-HUB TABLE MOUNTED (chunk A1, assessment gap #1) — new composition-only sub-app src/ui/server/placeHubsTable/server.js: ALL queries from ncdb (listPlaceHubs/countPlaceHubs/getPlaceHubsByKind/getPlaceHubsByHost/getPlaceHubHosts — contract verified against legacy-ui-placeHubs.ts: snake_case rows + u.url join, count returns number), copilot side is just router+HTML per the owner's modules-first instruction; mounted /place-hubs-table + registry tile 📍 + JSON /api/list; links to matrix + review queue. Verified LIVE: syntax 3/3, stop/start-electron (httpOk), HTTP 200 page + api/list search=andorra → 2 hubs, ui-screenshot renders table in shell (428 hubs, filters, classify links). Screenshot caught NEW data-quality rows for the A-list: quebec place_kind='country', a hub with null URL. Matrix→table backlink deferred (matrix HTML lives in jsgui controls). ui-screenshot works fine while the app runs (isolated profile) — only jest ui suites need the app stopped.
- 2026-07-17 (11): PLACE-HUB ASSESSMENT (read-only; docs/review/2026-07-17-place-hub-assessment.md) — pipeline/API/model healthy: 428 hubs (416 country/7 city/3 region/2 subcontinent) on 2 hosts, review API live (queue 8 honest items; search placeId-keyed w/ validation TTLs), slug hygiene good (0 null, 2 gazetteer misses), indexes right. TOP GAP: the exact table UI the owner wants (place-hub URLs w/ host+kind filter+search+pagination) EXISTS in dataExplorer /place-hubs but dataExplorer is NOT mounted in the unified shell — matrix-only there; mount it. No village kind exists anywhere (gazetteer = city/region/country/planet; cities capped 50/country) so filter-by-village needs ingestion work. Validations thin (11 vs 428). Data quality: andorra dup rows (url_id variants beat uq_place_hubs_entity), ISO-code junk mappings (…/topic/ad, …/news/ad ↦ Andorra, one "verified"), pageKind drift country vs country-hub. place_hubs is slug-keyed (no place_id FK). New probe: checks/probe-placehub-assessment.js (better-sqlite3 via ncdb paths fallback — root node_modules lacks it).
- 2026-07-17 (10): DB-CONSOLIDATION SLICE 2 — four more pure shims deleted (all no-rename path-swaps): queries/ui/crawlTypes (0 importers), ui/uiThemes (themeService — its local aliases like createThemeInDb pass through untouched), ui/errors (4: homeCardData, metricsService inline, dataExplorerServer, dataExplorer/views/errors), queries/analysisRuns (own jest test repointed in place; migrates out when sqlite/v1 tree dies). Verified: surface smoke 39 fns + 4 consts, analysisRuns jest 5/5 on :memory: through repointed require, node --check 6/6 (checks/syntax-check-slice2.js). src/data/db 197→193. Committed via checks/commit-db-slice2.js. Pattern holding: count importers → confirm pure shim → path-swap → git rm → smoke+test+syntax. Owner still editing docs/INDEX.md + SESSIONS_HUB.md — excluded again.
- 2026-07-17 (9): DB-CONSOLIDATION SLICE 1 — first two shims DELETED: queries/ui/cloudCrawl.js (0 importers post-slice-0) + queries/downloadEvidence.js (10 importers repointed to ncdb: dv-check, verified-crawl [only getGlobalStats-alias user → small alias object], db-downloads, downloads-bar-chart-server, cloud-crawl-e2e, sample-db-signals, monitored-small-crawl, crawl-progress-monitor, crawl-packet, crawl-backend — whole-module `require('news-crawler-db')` where files did property access). Verified: reworked surface smoke 20 fns + 4 consts (identity form impossible once shims die), LIVE download-verification.check 9/9 on :memory: through the repointed require, node --check 10/10 (checks/syntax-check-slice1.js). src/data/db 199→197. FOUND dead pre-existing: root checks/{download-evidence,downloads-api,downloads-stats-api}.check.js require nonexistent src/db/queries/downloadEvidence (src/db/ = TaskEventWriter + openNewsCrawlerDb only) — checks-sweep later. Owner concurrently editing docs/INDEX.md + SESSIONS_HUB.md — excluded from commit.
- 2026-07-17 (8): DB-CONSOLIDATION SLICE 0 — audit OVERTURNED the plan's premise: src/data/db is not a 199-file duplicate but mostly a SHIM layer (143/199 files require ncdb; SQLiteNewsDatabase.js is a documented compat wrapper — "SQL and facade ownership live in news-crawler-db"); real residue = TaskEventWriter/EnhancedDatabaseAdapter/migration-orchestrator/dbAccess/connection/index-barrels + tests; consumers ≈157 src + 41 tools + 27 tests files. First repoint landed: unifiedApp/server.js cloudCrawl trio + downloadEvidence seven → ncdb direct (aliases normalizeCloudCrawlDomains→normalizeDomains, getGlobalDownloadStats→getGlobalStats); PROOF by reference-identity smoke (checks/smoke-uapp-db-repoint.js: shim fn === ncdb fn ×10) — the honest verifier for repoints since tests/ui/unifiedApp.* watchdog-times-out with the Electron app live (verified AT HEAD too; the 2 registry "Available Apps" HTML fails are pre-existing drift). NEW gotcha: bridge run-tests child hard-kills at 180s regardless of params.timeoutMs (only the watchdog reads it) — long suites need the app stopped or a longer child budget.
- 2026-07-17 (7): COORDINATION-POINT step 3 FINALE — src/deprecated-ui + tests/deprecated-ui git rm -r'd (368 files) via checks/retire-deprecated-ui.js. Pre-delete audit: the ONLY require()s of the tree lived inside it (both jest-ignored via /src/deprecated-ui/ + /tests/deprecated-ui/ patterns); no live/mounted importer remained (src/api/server.js, its last non-test src importer, went in step 2); js-scan.test.js uses a separate `deprecated-ui-root` fixture, not the tree. Sole external runtime consumer checks/smoke-analysis-imports.js had its shim require dropped first (ncdb surface check is now canonical). Verified post-delete: smoke PASS + tests/server/api/analysis.test.js 13/13. Committed via checks/commit-depui-step3-final.js. Harmless leftover no-ops for a tidy sweep: test-config.json `deprecated-ui` profile + /deprecated-ui/ ignore entries, jest.careful.config + main testPathIgnorePatterns still list absent paths, backgroundTasksMonitor comment names ui:deprecated. Excluded owner's dirty .claude/settings* + wysiwyg bundle.js.
- 2026-07-17 (6): COORDINATION-POINT step-3 blockers CLEARED — IntelligentCrawlerManager relocated deprecated-ui/express/services → src/core/crawler beside its only live testers; the naive prior-turn git mv left the module's lone relative require (../../../shared/utils/domainUtils) dangling at the shallower depth (broke only once it ran under a non-jest-ignored dir) → recalibrated to ../../, both core tests repointed to ../IntelligentCrawlerManager = 27/27 + 9/9 green; git rm'd 5 dead consumers (benchmarks/run.js + its package.json script, 3 manual-tests, server-connection.test.js — none live-imported); deprecated-ui internal ICM tests + express/server.js still name old path but /src/deprecated-ui/ is jest-ignored and dies in step 3-final; committed via checks/commit-depui-step3.js. Pre-existing unrelated fails in that dir (placeHubs.data no-such-column url, ProblemResolutionService prepare-count, utils.safeCall missing-module) left for a core-crawler drift pass. Excluded owner's dirty .claude/settings* + wysiwyg bundle.js from the commit.
- 2026-07-17 (5): COORDINATION-POINT step 2 — VERDICT: analyticsHub/qualityDashboard LIVE via unifiedApp routers (zero deprecated-ui imports; plan's index.js claim was wrong); src/api/server.js was an unlaunched unifiedApp duplicate → deleted with its crawl-status test = deprecated-ui's last non-test src importer gone; fallout: src/api/routes/* now tested-but-unmounted (disposition needed); revived silently-dead push.test.js (require overshot root; 7 drifted tests skipped, articles /similar test updated to 501) → tests/api 12/12 suites 299 green; step-3 blockers enumerated in plan; NEW gotcha: sandbox mount can serve NUL-padded file tails — trust host via checks/parse-package-json.js pattern; NEW tool: checks/jest-failures.js (compact failure lists past the 4k tail cap).
- 2026-07-17 (4): COORDINATION-POINT: deprecated-ui recipe step 1 done — analysisRuns relocated INTO news-crawler-db (listAnalysisRuns/getAnalysisRun/diagnostics added + vitest; ncdb was already 5/7 identical — deprecated-ui copy was a stale fork), propertyEditor → src/shared/; 5 importers repointed (incl. upgrade-analysis-schema.js, missed by the plan's survey), deprecated-ui service now a shim; 13+22+5 jest + smoke green; remaining blocker = src/api/server.js↔analyticsHub/qualityDashboard liveness (recipe step 2).
- 2026-07-17 (3): BOT PROTECTIONS MODELLED IN DB + SLICE 3 —
  domain_fetch_policies table (protection_kind / fetch_strategy /
  evidence / provenance / recheck_after) replaces scattered knowledge
  (hard-coded TLS list, wrong-path JSON, loop notes); seeded 5 hosts;
  review API GET/POST /fetch-policies; guess pipeline fetch is now
  policy-aware (puppeteer for TLS hosts, evidence auto-merged on
  ECONNRESET/402/403/429; GUESS_POLICY_FETCH=0 kill-switch). LIVE:
  guardian guess run — impossible before — verified 3 new hubs (kosovo,
  reunion, western-sahara) via puppeteer GETs; prefilter dropped
  /preference/edition/* junk. Site-as-hub search live: country queries
  return national outlets from domain_locales (sites=0 to disable).
  ncdb 16/16 vitest. Fix en route: puppeteer browser now destroy()ed in
  processDomain finally — without it CLI guess runs hung to timeout
  (first guardian trial); re-run exits 0 in ~90s.
- 2026-07-17 (2): SLICE 2 CLOSED THE LOOP — DomainProcessor prefilter
  (place path only; GUESS_URL_PREFILTER=0 kill-switch) + Strategy 0.5
  (predict FROM learned templates) + auto hub_validations at crawl
  verification. Live aljazeera run: 24/24 wrong-shape candidates
  skipped pre-network, then 36 /where/ proposed → 4 NEW hubs verified
  (new-caledonia, western-sahara, kosovo ×2) + 1 404 ledgered. 12/12
  jest. Unattended loop: learn → predict → prefilter → verify → ledger
  → AI reviews leftovers via API.
- 2026-07-17: AI-OPERABLE REVIEW API live at /api/v1/place-hubs/*
  (review-queue, classify/search probes, overrides, heuristics/patterns,
  learn + assess-structure; agent+reason mandatory, all writes audited).
  First AI session: 8 calls settled 95+34 unknown-term rows (politics/
  science/global-development/world/all → non-geo; andorra → confirmed
  country hub, validation ledger + mapping), retired junk reuters↦Andorra
  mapping found by place search. Live bug found+fixed: unknown_terms
  stores www-hosts, resolve now matches both forms (9/9 jest). GOFAI
  verdict: microprolog stays unintegrated (documented Part 5); rule base
  = DB patterns editable via API. Guide: docs/agents/PLACE_HUB_REVIEW_API.md.
  Remaining queue honest: united-kingdom/london/gibraltar/cook-islands
  (real places awaiting confirm), football/email-newsletters (non-geo).
- 2026-07-16 (pm2): PLACE-HUB INTELLIGENCE SLICE 1 — review found 4
  disconnected pattern mechanisms, dormant hub_validations (0 rows),
  place_hub_url_patterns absent from live DB, hubs on only 2 hosts.
  Landed: DB-canonical pattern surface (scope host/global + 8 GOFAI
  priors), PlaceHubUrlIndex (classify/learn/drift), 2-year cached-content
  freshness rule, hub_validations writer + place-keyed hub search.
  Live: guardian/aljazeera patterns learned (acc .95), andorra/gibraltar
  now classify 0.99, lemonde cold-starts 0.75 via priors. 19 new tests.
- 2026-07-16 (pm): DB-CONSOLIDATION — stale sibling DBs archived to
  data/backups/stale-dbs-2026-07-16/ (containment-checked); new
  gazetteer-db-path resolver points everything at news.db (PlaceLookup
  had been loading the stale 508-place copy — now 13,688 places);
  sync-site-geo.js moved country/language/tier from
  config/news-sources.json into news_websites.metadata + domain_locales
  (15 rows, bare-host form). See docs/plans/2026-07-16-news-sites-100…md
  PROGRESS section.
- 2026-07-16: LeMonde error storm ROOT-CAUSED + FIXED. Cause: lemonde.fr
  402s every fetch → host retry budget locks → but the lock lived only in
  FetchPipeline, so QueueManager kept dequeuing → 5,140 synthetic
  HOST_RETRY_EXHAUSTED errors per lock window. Fix: HostRetryBudgetManager
  onLockout → DomainThrottleManager.applyHostBackoff → getHostResumeTime
  gates the queue (deferral machinery already existed). Live re-run: 6 real
  402 errors, 0 spin (was 5,146). Also shipped: per-job worker stdio logs
  (data/logs/jobs/<jobId>.log — made the diagnosis possible) + bounded
  url:error summaries on job records (errorSummary in jobs API). Guardian
  + BBC finished their 200-page crawls clean (200 dl each, 0 errors) —
  batch ended 3/5 sites × 200 pages = 600 pages, 0 errors on the healthy
  hosts.
- 2026-07-15/16: 5-site × 200-page batch (all 5 accepted, ran concurrently
  in worker mode): AlJazeera 200 dl/196 saved/0 err (40.6MB, 0.87/s) ✔;
  BBC clean and finishing; Guardian clean via puppeteer (~0.02/s — slow but
  0 errors, fix holding); LeMonde 5,146 errors/1 dl (→ Now#2, error detail
  unpersisted → Now#1); Reuters "completed" 0 pages 0 errors (→ Now#2).
  Concurrent ramp-up is staggered (DB contention); ui-screenshot timed out
  under load. Stale index.lock (35h) blocked a commit → swept; consider
  auto-sweep in bridge git path.
- 2026-07-15: Guardian FIXED end-to-end — jest 5/5 on host, live re-crawl
  cae10aee completed 5/5/5 saved, 0 errors (was: instant ECONNRESET death).
  FetchPipeline diff contained ONLY the fallback fix → committed with the
  regression test. Static TLS list now a baseline under the auto-learn mgr.
- 2026-07-14 (pm, sandbox-only turn): Guardian ECONNRESET root cause =
  _shouldUsePuppeteerFallback let the unlearned domain manager veto the
  static fingerprinting list; uncommitted fix found in worktree (concurrent
  editor), logic verified in sandbox, regression test added; live verify +
  commit deferred (no machine access this turn). NOTE: FetchPipeline.js has
  someone's uncommitted work — coordinate before committing.

- 2026-07-14: FIRST LOOP CRAWLS — BBC completed (54 visited/50 dl/32 saved/
  0 err, ~12MB); Guardian failed (ECONNRESET, → Now#1). In-process jobs
  starved the API (even GET timed out) → start-electron now defaults
  UI_CRAWL_WORKER=1 (worker mode); live per-job progress confirmed in jobs
  JSON + VS2005 dashboard. Junk rows cleaned (14 'city' candidates, 3 test
  hosts) via checks/clean-junk-rows.js.
- 2026-07-14: machine rebooted overnight; bridge relaunched via Explorer;
  main.js server-wait raised 20s→60s (--server-wait-ms) after cold-boot miss.
- 2026-07-13: jsgui3-html raw-text rendering fixed+pushed (b249b86); crawl
  page VS2005 theme live (copilot 96bd467).
- 2026-07-11: migration 41 applied to live DB (507→431 hubs); remote-fetch
  mode + telemetry + Electron display + bridges shipped (5+2 commits pushed).
