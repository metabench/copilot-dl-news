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

1. Worker-job error observability: LeMonde's 5,146 errors exist ONLY in
   in-memory progress counters — nothing lands in `errors`, `crawl_problems`
   or `fetches`, and worker stdout is `inherit` (InProcessCrawlJobRegistry
   fork) so it vanishes with the server console. Persist per-job error
   samples (first N + counts by code) to crawl_problems, and/or capture
   worker stdio to a per-job log file.
2. Diagnose LeMonde error storm (5,146 errs / 1 download in ~8 min ≈ 10/s —
   too fast for network timeouts; likely synchronous rejections or anti-bot
   resets) and Reuters silent 0-page "completed" (likely robots/policy block
   of the start URL — a 0-download completion should be flagged, not green).
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
