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

1. LeMonde/Reuters access: both anti-bot-blocked (LeMonde = HTTP 402 on
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
