# Working Notes

## 2026-05-08

- Objective: run `news-10` x 1000 pages from the Electron unified UI context and keep the UI visibly tracking the jobs.
- Initial inspection found:
  - Electron unified entry: `src/ui/electron/unifiedApp/main.js`
  - Existing Electron script: `npm run electron:unified`
  - Crawl status route: `/?app=crawl-status` with iframe `/crawl-status`
  - Batch CLI from earlier session: `tools/crawl/crawl-batch.js`
- Planned UI improvement: add Electron `--app crawl-status --allow-multi-jobs` support plus a jsgui3 batch-launcher control on the crawl-status page.
- The in-process Electron 10x1000 path accepted jobs but starved the unified server/UI, so the durable operator path pivoted to the remote/cloud crawler displayed in Electron Cloud Crawl.
- Added `remote-news-10x1000` profile and moved it to `run` mode so one command starts the remote domains and immediately enters a continuous sync loop.
- Fast sync settings are now `--interval 5 --window 5 --limit 250 --include-content false --include-links false --no-backoff`; this keeps UI/download counters fresh via metadata batches while avoiding heavy content/blob payloads on every five-second tick.
- Live remote export indexes were applied across remote DB files. Query plans use the updated-at index for `SELECT * FROM urls WHERE updated_at > ? AND updated_at <= ? ORDER BY updated_at ASC LIMIT ?`.
- The initial full-content sync proved too heavy: 500-row full-content batches took 19-42s and sometimes timed out. After moving to 250-row metadata batches, live rounds were usually 100-550ms fetch and 5-176ms ingest.
- Deployed optimized remote server support for `includeLinks=false` and a new remote config `crawl-domains.news-10x1000.json`; restarted only `crawl-server-v4`, leaving PM2 workers online. Post-restart health: 10 domains, 4 running, 8058 stored, healthy true.
- Verified the deployed fast export path with `node tmp/_benchmark_remote_export.js 141.144.193.218:3200 since=2026-05-08T00:59:27Z limit=250 includeContent=false includeLinks=false`: 250 URLs, 68 responses, 0 content, 0 links, 151ms, 154111 decoded bytes.
- Electron Cloud Crawl is running via `npm run electron:cloud-crawl`. Final screenshot pass reported Cloud Crawl desktop `8462 / 10000`, mobile `8522 / 10000`, 3 active jobs, 0 errors, no horizontal overflow.
- Final remote health check after the screenshot pass reported healthy true, 10 domains, 3 running, 9192 stored.
- Latest integration pass made `news-10x1000` the remote-first default profile and moved the old in-process path to `local-news-10x1000`.
- Added `--prune-after-ingest` to `crawl-remote.js`: full payload export only, ingest into `data/news.db`, verify local URLs/responses/content/links, then prune remote payload rows.
- Fixed content-later ingest mapping so a later full-content sync can attach content to an existing local `http_responses` row created by a metadata-first sync.
- Initial live prune validation exposed the unsafe watermark behavior: the first prune deleted all payload rows up to the watermark. The endpoint and CLI were immediately corrected to send and require exact exported URL IDs for CLI-driven pruning.
- Deployed exact-ID prune support to `crawl-server-v4`. A corrected live validation batch confirmed 25 URLs / 22 responses / 22 content / 1370 links locally and pruned exactly `{"urls":0,"httpResponses":22,"content":22,"links":1370}` remotely, with URL state rows retained.
- Stopped the stale metadata-only local sync process and started `npm run crawl -- news-10x1000`, which now uses the remote-first confirmed-prune lane.
- Observed `limit=100` full-payload backlog batches taking 40-55s, then a later `limit=25` heavy-content batch took 29s. Reduced the remote-first profiles to `limit=5` so the confirmed full-payload/prune lane favors smooth five-second cadence over large batch size.
- After two heavy backlog batches, the live `limit=5` runner stabilized: rounds 3-9 fetched in roughly 391-1103ms, ingested in 16-53ms, confirmed local save, and pruned exact remote payloads every five seconds.

## 2026-05-09 Adaptive Sync Batching

- Planned adaptive sync batching in `ADAPTIVE_SYNC_BATCHING_IMPLEMENTATION_PLAN.md`.
- Added `tools/crawl/lib/adaptive-sync-batching.js` as a pure controller with fixed-mode, shrink-on-slow/error, grow-after-fast-full-streak, partial-batch hold, and min/max caps.
- Integrated the controller into `crawl-remote.js sync` and `crawl-remote.js run`. The decision uses total round work time: fetch + ingest + local verification + remote prune.
- Updated `news-10x1000` and `remote-news-10x1000` to use `--adaptive-limit --target-sync-ms 5000 --limit 5 --min-limit 1 --max-limit 25`.
- Added focused unit tests in `tests/tools/crawl/adaptive-sync-batching.test.js`.
- Validation: `npm run test:by-path -- tests\tools\crawl\adaptive-sync-batching.test.js` passed 7/7 tests with `EXIT_CODE=0`.
- Validation: `node tools/crawl/index.js news-10x1000 --dry-run` expands to adaptive flags and exited with `EXIT_CODE=0`.

## 2026-05-09 Integration Turn — Ledger + Instrumentation + Throttle

### Task A — Ledger wired live in cmdSync
- Added sync-ledger imports at top of cmdSync; ledger loaded from `.crawl-remote-ledger.json`.
- Before main loop: drains `findUnpruned()` entries from previous crash — re-confirms + prunes each, records success/failure in ledger.
- During loop: each batch gets `appendBatch()` immediately after export, `markConfirmed()` after verification, `markPruned()` after prune.
- Legacy `.crawl-remote-watermark.json` mirrored via `mirrorLegacyWatermark()` for back-compat.
- Since watermark now reads from ledger first: `getLastWatermark(ledger) || wm.lastWatermark`.
- Renamed inner `decision` to `budgetDecision` to avoid shadowing the batch controller decision.
- Test: `sync-ledger-live.test.js` — 2 tests covering full lifecycle (append→confirm→prune-fail→retry→prune-success) and legacy migration.

### Task B — cmdRun perf parity
- Created `tools/crawl/lib/sync-loop-instrumentation.js` — pure-policy module exporting `createInstrumentation()`.
- Provides `onRoundSuccess()` → perf line at cadence, `evaluateBudget()` → storage budget + backpressure transitions, `onRoundError()`, `printSummary()`.
- Wired into cmdRun: same perf summary lines, storage budget logs, and backpressure transitions as cmdSync.
- cmdRun now also prints `| Total: X URLs, Y content` on each round (was missing).
- Test: `sync-loop-instrumentation.test.js` — 6 tests covering cadence, error counting, budget disabled, budget transitions, summary, and state tracking.

### Task C — Validation
- Unified server check: `unified.server.check.js` passed (exit code 0).
- Remote `/api/throttle` stub: added POST + GET routes to `multi-domain-server.js`. POST updates `MAX_CONCURRENT` and records throttle state. GET returns current state.
- Remote throttle not yet deployed (needs PM2 restart on remote box) — documented as follow-up.

### Regression
- Final regression: 7 suites, 62 tests, all passing.
  - `sync-ledger.test.js` (11 tests)
  - `sync-ledger-live.test.js` (2 tests)
  - `sync-loop-instrumentation.test.js` (6 tests)
  - `adaptive-sync-batching.test.js` (7 tests)
  - `storage-budget-and-friends.test.js` (22 tests)
  - `orchestrate-policy.test.js` (4 tests)
  - `export-retention.test.js` (10 tests)
