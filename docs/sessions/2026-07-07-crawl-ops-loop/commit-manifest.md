# Commit manifest — 2026-07-07 session work (for the operator's commit-gate decision)

Everything below was created/modified today by the loop sessions and is UNCOMMITTED. Note: the repo also carries pre-existing uncommitted work from cycles 11-13 (QueueManager FIFO fix + contract tests, queueManager.basic contract fix, RobotsAndSitemapCoordinator regression test — see cycle-14 CONTINUATION backlog); those predate today and are listed separately at the end. `../news-crawler-db` has unrelated pre-existing modifications — untouched, out of scope.

## Suggested commits (logical groups, in dependency order)

**1. crawler: conditional sitemap fetching (ETag/304 + file body cache)**
`src/core/crawler/sitemap.js` · `src/core/crawler/__tests__/sitemap.cache.test.js` (new)
> Eliminates re-downloading unchanged sitemaps (c8-measured ~580KB/crawl waste). Warm cache sends validators; 304 reuses cached body so URL discovery is unchanged; ledger records the 304. Optional TTL (default 0 = always revalidate). Live-proven: 304s at 0 bytes on guardian/bbc repeats. Tests 4/4.

**2. crawl:sample: settle-before-score guard**
`tools/crawl/lib/sample-db-signals.js` · `tools/crawl/sample.js` · `tools/crawl/lib/__tests__/evidence-settle.test.js` (new)
> Fixes the false-FAIL race (scorecard read the DB before the crawl child committed). waitForEvidenceSettle polls until counts hold steady. Tests 4/4 + existing suite 23/23.

**3. electron: main-process contract tests**
`src/ui/electron/unifiedApp/__tests__/main.headless.test.js` (new) · `src/ui/electron/__tests__/appMains.contract.test.js` (new)
> Headless coverage: window security prefs (contextIsolation/nodeIntegration), URL/arg contracts, server-spawn env, preload existence, IPC channel matching across all six app mains. 4/4 + 18/19.

**4. unified-ui: optional-router guard + telemetry filters**
`src/ui/server/unifiedApp/server.js`
> remote-crawl-admin registration now skips cleanly when the module is absent (was an error-log every boot; module missing from repo). /api/crawl-telemetry/history now honors ?topic= and ?severity= (were silently ignored). Both verified live.

**5. crawl-api: persist job failure reasons**
`src/server/crawl-api/v1/core/InProcessCrawlJobRegistry.js`
> job.error (normalized string) stored on both failure paths and exposed via list/get — failure reasons were previously emit-only and unqueryable. Verified via ECONNREFUSED probe.

**6. tools: dev-bridge + one-click launchers**
`tools/dev-bridge/` (dev-bridge.js, start-dev-bridge.cmd, .gitignore, __tests__/bridge-bootstrap.test.js) · `start-crawler-ui.cmd` · `start-crawler-app.cmd` (repo root)
> Sandbox↔Windows file-RPC: allowlisted actions only, per-action watchdog, localhost-only HTTP relay, heartbeats, detached managed-process registry (survives bridge restarts), supervisor-aware self-restart, single-instance lock.

**7. tools/crawl: ops toolkit**
`bounded-dispatch.js` · `domain-preflight.js` · `verify-crawl-delta.js` · `recent-errors.js` · `db-schema-peek.js` (all new)
> Wall-clock-bounded dispatch (engine has no such knob; budgetEnforced proven at 30min/L4), pre-dispatch host classification (caught reuters/npr bot-challenges), read-only evidence/delta/politeness verification (datetime-normalized).

**8. docs: session evidence + corrections**
`tools/crawl/AGENT.md` (new "Dev Bridge & Operator-Machine Crawl Ops" section) · `docs/sessions/2026-07-01-crawler-usable-quality-loop/CONTINUATION_PROMPT.md` (fleet section corrected) · `docs/sessions/2026-07-07-*/` (all evidence: deploy record, working-well c15, electron-ui c1-4, crawl-ops c1-6)

**9. crawl-api: worker-mode job execution (added 2026-07-10)**
`src/server/crawl-api/v1/core/crawl-operation-worker.js` (new) · `src/server/crawl-api/v1/core/InProcessCrawlJobRegistry.js` (worker path) · `tools/dev-bridge/dev-bridge.js` (start-ui workerMode param) · `tools/crawl/api-latency-probe.js` (new)
> Operation crawls run in a forked child when UI_CRAWL_WORKER=1; crawler telemetry is forwarded over IPC and replayed into the real bridge (UI progress identical). Fixes the API starvation debt: measured avg 6ms / max 42ms API latency DURING a live crawl (was 15-20s stalls in-process). Existing registry suite 4/4; live worker job completed clean.

**10. tools/crawl: dead `fetches` readers fixed (added 2026-07-10)**
`tools/crawl/lib/throughput-meter.js` · `tools/crawl/lib/crawl-progress-monitor.js`
> Both now prefer whichever of http_responses/fetches holds rows (fetches unpopulated since ~2026-03), with datetime()-normalized timestamp comparisons. Monitor suite 24/24.

## Pre-existing (predates today; commit separately if desired)
c11-c13 crawler fixes per cycle-14 CONTINUATION notes. Run `git status` to see the full working-tree picture before committing.
