# Distributed crawling on Oracle — unification, exclusive host ownership + remote jsgui3 dashboard

**2026-07-22 module-ecosystem extraction — DONE (cycle 73):** per the owner directive
([2026-07-22-module-ecosystem.md](2026-07-22-module-ecosystem.md)), the remote crawler
engine (`deploy/remote-crawler-v2/` — worker, politeness, schema, server core) has been
extracted into the sibling **`../news-crawler-itself`** module; copilot-dl-news keeps the
deploy tool, driver, sync, and fleet guard as CALLERS. The worker-thread parallel-
compression pool (`GzipPool`) was built in the module and is live on the deployed
Oracle box, DB-evidence-verified (~83-87% compression on real crawled content). Phases
below are unchanged in substance; their implementation home has moved.

**Status:** v2 (2026-07-21) — revised by an adversarial 5-lens plan review (20 findings; verdicts
validated in code by hand: 5/5 highest-stakes claims confirmed, one minor cite corrected). v1's
per-fetch politeness broker is **replaced by exclusive host ownership** (see §2). Phase D1 executed
cycle 65 (config unification + probe; Oracle v2 live-confirmed healthy at `/api/health`, build
2026-05-27 — note the deploy drift).

**Goal (user's words):** use the remote Oracle machine for more efficient distributed crawls —
queue pages on the remote, download rapidly there, deliver locally in **15s–1min**, **N pages per
HTTP request**, rate limiting **per crawler IP AND overall (per target host across nodes)**, and a
**jsgui3 progress dashboard served from the remote** ("unifying some code").

---

## 1. Current state (3-agent audit + panel code-verification, all file:line-cited in session)

Three never-unified generations. **Decision: ONE remote transport = Gen2** (the deployed v2 server).
- **Gen2 v2 server** (deployed, PM2 `crawl-server-v4`, :3200, health `/api/health`): remote queue
  (`/api/seed`), watermarked batch export (`/api/export/batch`, many pages/response, gzip), by-id pull
  (`/api/sync/pull?ids=`), SSE. Driven by `crawl-remote.js` (pull-sync ~5s target, watermark ledger,
  verify-then-prune). **The user's four asks are literally its feature set.**
- **Gen3 worker** (`wip/labs/distributed-crawl`, off-by-default): its batch client is DEAD in the live
  path (batches of one), it cannot serve "queue on remote" (stateless synchronous), and keeping it
  doubles the config/auth surface → **DEPRECATE alongside Gen1** (reopen only if measured delivery
  latency exceeds 60s). **RETIRED cycle 76:** the 16 orphaned lab/speedometer/benchmark files (0 live
  requires) were removed; only `worker-server.js` (still referenced by the guarded
  `tools/dev/worker-version-check.js`) + the `INTEGRATION_DESIGN.md`/`LAB_RESULTS.md` design records
  remain. Git history preserves the removed experiments.
- **Gen1**: orphaned; deprecated (done, cycle 65).

**Panel-confirmed defects (each verified in code by hand):**
1. **The deployed remote server has ZERO politeness** — no robots/crawl-delay/per-host pacing at all
   (grep: 0 matches; only a maxConcurrent stub). The "over-crawl" failure mode runs TODAY, solo.
2. **Watermark advances at append, BEFORE ingest confirm** (`sync-ledger.js:74`); no startup resume of
   unconfirmed batches (`findUnconfirmed` is only a status readout, `server.js:862-868`); live ledger
   held 10/200 unconfirmed = batches stranded past the watermark, destroyed if prune runs.
3. **Verify fallbacks mask missing ingest** (`legacy-remoteCrawlSyncVerification.ts:43-50` latest-row-
   for-url_id; `:108-110` size-only) → a never-ingested remote row "verifies" against an unrelated
   local fetch → ok:true → prune deletes the ONLY copy. The safety mechanism can cause data loss.
4. **Ingest replays duplicate**: `INSERT OR IGNORE` against tables with NO unique keys
   (`legacy-remoteCrawlSyncIngest.ts`) → every replay inserts full duplicate rows into the 30GB SoT.
5. **Local fail-open seam**: `DomainThrottleManager.acquireToken` wraps `limiter.acquire` in
   `safeCallAsync(..., false)` — limiter errors silently degrade politeness.

## 2. The core design change: EXCLUSIVE HOST OWNERSHIP (no per-fetch broker)

**Deciding argument (validated):** politeness caps a host's TOTAL request rate at one-per-crawl-delay
regardless of node count — so a second node crawling the same host adds **zero throughput**. Per-fetch
cross-node coordination therefore buys nothing, while costing a WAN RTT on every fetch, clock-skew
sensitivity, a third always-on service, and new fail-open seams. Instead: **each target host is owned
by exactly one node at a time** — the cross-node SUM for host H is then structurally the single
owner's already-tested `DomainLimiter` output, and 429 backoff needs no propagation.

Mechanism, staged:
- **Now (static partition guard, code-enforced):** per-node host allowlist in fleet config;
  `crawl-remote.js` refuses to seed hosts outside the remote allowlist; local frontier hydration
  excludes remote-assigned hosts via an injected exclusion option in ncdb `selectDueFrontier` (the
  cycle-50 injection seam). Same-host 2-node crawling is **out of scope permanently**, not broker-gated.
- **Later (dynamic): host-lease registry in local news.db via ncdb** — `host_leases(host PK, owner,
  acquired_at, expires_at, backoff_until, crawl_delay_seconds)`; atomic acquire/renew/release; TTL
  auto-release; backoff inheritance on handback; **fail-closed degraded mode** (registry unreachable →
  a node continues ONLY hosts with unexpired leases, acquires nothing new — every failure collapses to
  under-crawl, the safe direction). No new service, no auth, durability inherited from news.db.
- **Upgrade path if ever needed** (IP-rotation for JS-walls, sub-second-delay megasites, >2 nodes):
  batched k-slot grants carried in the lease payload — never per-fetch WAN round-trips. Design rule:
  **no RTT inside `acquireToken`.**

## 3. Revised phases (panel's resequencing — user-visible value earlier, safety gates kept)

- **D1 — config unification + ONE-transport decision + partition guard.** *(Partially DONE cycle 65:
  resolver endpoint map + port inventory, Gen1 deprecated, `remote-endpoints` probe, Oracle health
  live-confirmed.)* REMAINING: deprecate Gen3 (worker + adapter headers); the static per-node
  host-allowlist guard (crawl-remote seed refusal + ncdb frontier exclusion); delete the dead duplicate
  `/api/throttle` handlers (`multi-domain-server.js:1110/1120` — confirmed drift).
- **D2a — remote-node politeness (SAFETY-CRITICAL, blocks all further autonomous remote crawling).**
  Embed the tested local stack (`DomainThrottleManager` + `DomainLimiter` + robots crawl-delay parsing)
  into the remote server's fetch loop, per-host, keyed identically to local; per-host serialization
  inside its concurrency pool (no same-host concurrent fetches); cross-host redirects recorded +
  returned for local re-queue, never followed. Acceptance: live seeded crawl shows remote per-host
  `fetched_at` deltas ≥ `crawlDelaySeconds`. Also close the local fail-open seam (defect 5).
- **D3 — sync-loop hardening + auto-driven delivery (the 15–60s user-visible win).**
  (a) watermark advances ONLY on confirmed ingest + startup resume of unconfirmed batches (re-pull by
  ids) + single sync-state authority; (b) verify made identity-strict: DELETE both fallbacks (a
  fallback-resolved match counts as MISSING), mandatory `content_sha256` in export,
  `wal_checkpoint(FULL)` before prune, plus the adversarial test (deliberately-uningested batch must
  FAIL verify — today it passes); (c) idempotent ingest: `remote_sync_batches(batch_id PK)` in the
  same transaction, UNIQUE indexes on `http_responses(url_id, fetched_at, request_started_at)` +
  `content_storage(http_response_id, content_sha256)`, corrupt-ledger quarantine+halt; (d) chunked
  sub-transactions (~50 content rows), busy_timeout, `maxBytes` on export, remote self-backpressure
  (pause dequeue on backlog/disk budget); (e) auto-drive as a supervised child process of the local
  unifiedApp — NEVER inside the electron main process (event-loop-wedge history); (f) measurement:
  skip inter-round sleep when `fetchedRows == limit`; delivered-page latency instrumented with DB
  evidence. "Wire fetchBatch/queueRequest" is REMOVED (Gen3 deprecated; batching = the export loop).
- **D4 — shared jsgui3 dashboard CORE + remote panel.** Extract a small core (throughput strip,
  per-host health table, live activity feed) as jsgui3 controls in `src/ui/shared/crawl-dash-core/`,
  parameterized by a `DashboardDataAdapter` — NOT the whole coupled crawl-status page. Serve from the
  remote server (prebuilt bundle deploy); add a local sync-lag panel. Contrast-trap-safe.
  - **D4 slice 1 DONE (cycle 71):** the pure, DOM-free normalization CORE
    (`crawlDashboardCore.js` — the single source of truth for the cycle-69 active-only/producer-trusting
    throughput math + host-health + headline normalization) + the `DashboardDataAdapter` contract with
    `LocalDataAdapter` (full-fidelity, :3170) and `RemoteDataAdapter` (:3200 /api/status, degrades
    honestly — no analysed headlines, host "health" is domain STATE not politeness class). 38 unit tests
    incl. a parity guard vs the live client's `renderThroughput` (+ the one deliberate hardening the
    adversarial pass surfaced: the core clamps a non-finite queue total to 0 where the client renders
    "Infinity"). Live-verified end-to-end by `tools/crawl/dashboard-model.js` (one core, two sources).
    Adversarial verify: 3/4 lenses SOLID (contrast, adapter-safety, cycle-69 no-leak), 1 real gap fixed.
  - **D4 slice 2a DONE (cycle 72):** the first two controls — `ThroughputStripControl` (live per-second
    strip, cycle-69 semantics; distinct from the pre-existing `CrawlThroughputPanelControl` count-window
    panel) and `HostHealthBadgesControl` (contrast-safe, local politeness classes + remote domain-state)
    — DIRECT-style `jsgui.Control`, SSR + `activate()`, prop-driven from the slice-1 model. The live
    **`GET /api/v1/crawl/dashboard-model`** endpoint (LocalDataAdapter over a DIRECT in-process source —
    `registry.list()` + host-health cache + `getRecentHeadlines`, no self-HTTP), proven equivalent to the
    HTTP source. Adversarial verify (3 lenses SOLID) + fixes: jsgui `String_Control` renders text RAW
    (only attributes escaped) → `escapeHtml` on the badge label; `activate()` timer-leak → guarded
    `remove()` teardown; `normalizeHeadline.title` XSS render-contract documented for the headline control.
    49 crawl-dash-core tests.
  - **D4 slice 2b (next, AFTER a cycle-73 prune):** the live-activity/headline control (MUST escape the
    title per the contract); prebuilt esbuild IIFE bundle (mirror `ui-client.js`) + `express.static` +
    HTML-shell route on `multi-domain-server.js` to serve remotely; migrate `crawl-status-client` onto
    the core (the parity test locks them).
- **D5 — host-lease registry** (replaces the static partition with dynamic handoff, backoff
  inheritance, fail-closed degraded mode; in news.db via ncdb).
- **D6 — per-IP request-rate budget** (node-local `GlobalBandwidthLimiter` req/s dimension — deferred
  here because per-host summing is already structural under leases).
- **D7 — acceptance battery (all DB-evidence):** live 2-node medium crawl proving (1) per-host
  `fetched_at` deltas over the UNION of both nodes' rows ≥ crawlDelaySeconds; (2) zero local fetches
  for any host during its remote lease window; (3) delivery ≤15–60s; (4) no duplicate rows after a
  forced replay; (5) both dashboards live.

## 4. Standing risks / rules

- **Remote SQLite is an ephemeral spool, never truth**; prune only after strict verify; all reads of
  record come from local news.db.
- **No destructive remote ops (prune/delete) without owner approval** until D3's strict verify lands.
- Deploy drift is real (deployed build 2026-05-27): D2a/D3 server changes need a deploy + version
  check via the probe (`/api/health` exposes buildId).
- Auth: OCI ingress IP-restriction remains the boundary; the lease registry lives in local news.db so
  it adds no exposed service.
- Every failure mode must collapse to **under-crawl** (fail-closed), never over-crawl.
