# Spec: Accept / Enqueue / Yield Before Blocking Crawl Boot

Status: DRAFT (read-only promotion candidate — no owner-repo edits applied)
Date: 2026-05-30
Owner boundary: crawl-service / `news-crawler-backend-core`
Routed from node: `promote_serverside_accept_before_boot_fix_to_owner_repo`

## Problem (one sentence)

While an in-process crawl is running, `GET /api/v1/crawl/jobs/:jobId` and
concurrent `POST /operations/<op>/start` requests are intermittently starved or
reset because the crawl boot does **synchronous, event-loop-blocking work**
(engine construction + a synchronous `better-sqlite3` `new Database(...)` open)
before yielding control back to the HTTP server.

## Evidence (local, reproducible)

| Symptom | Where observed | Detail |
|---|---|---|
| `/jobs/:jobId` starved | rebuilt terminal-wait proof (token `medium-terminal-wait-rebuilt-20260530-1`) | hosts `127.0.0.1`/`127.0.0.2` got `endpoint-unavailable` (4 polls, 4 errors, `endpointResponded:false`); only the wound-down last host `127.0.0.3` returned `terminal`. |
| Concurrent start reset | concurrent medium (token `medium-jobid-rerun-20260529-1`, `--batch-concurrency 3`) | `127.0.0.3` failed launch with `read ECONNRESET`; packet 20/28 `blocked`. |
| Fast crawls hide it | capped proof (token `medium-terminalcap-20260530-173203-1`) | all hosts `terminal` in ~2s because each crawl finished before the next poll — the starvation window simply did not open. |

The two symptoms share **one root cause**: the synchronous prefix of the crawl
boot holds the libuv event loop, so neither the cheap job-status route nor a
second start socket is serviced until the prefix completes.

## Exact code path (read-only trace)

1. `src/server/crawl-api/v1/express/routes/operations.js` — `POST /operations/:operationName/start`
   calls `inProcessJobRegistry.startOperation({...})` (line ~191).
2. `src/server/crawl-api/v1/core/InProcessCrawlJobRegistry.js` — `startOperation()`
   **already does the right thing on the acceptance side**: it builds the `job`
   record, registers it in `this._jobs`, emits `job:started`, and returns
   `{ jobId, job }` **synchronously**. The actual run is deferred via
   `Promise.resolve().then(() => service.runOperation({...}))` (line ~231).
   So the start-acceptance path is NOT the bottleneck.
3. `src/server/crawl-api/core/crawlService.js` — `runOperation()` (line ~106)
   calls `instantiateFacade({ logger })` then `runner(startUrl, overrides)`.
   Although `runOperation` is `async`, the work up to its first real `await`
   runs **synchronously on the current microtask tick**.
4. The synchronous prefix of `runner()` (the `CrawlOperations` operation method)
   performs the engine/facade boot, which includes opening the news database via
   a synchronous `new NewsDatabase(...)` → synchronous `better-sqlite3`
   `new Database(...)`. `better-sqlite3` is a **synchronous** binding: the open
   (and any synchronous schema/pragma statements run during boot) block the
   event loop for their full duration.
5. During that blocked window, the libuv loop cannot accept the queued
   `/jobs/:jobId` GET (terminal-wait poll) nor a second concurrent start socket,
   producing `endpoint-unavailable` polls and `ECONNRESET` respectively.

## Goal

Make operation start **accept, enqueue, and yield** before any blocking boot, so
the HTTP server stays responsive to status polls and concurrent starts while a
crawl is booting and running.

## Proposed fix (owner-repo, approval-gated — NOT applied here)

Three independent, individually-shippable options, smallest first:

### Option A — Yield before the blocking prefix (smallest, lowest risk)
In `crawlService.runOperation` (or the deferred `.then(...)` in
`InProcessCrawlJobRegistry.startOperation`), insert an explicit yield
(`await new Promise(r => setImmediate(r))`) **before** `instantiateFacade` /
`runner(...)`. This guarantees one full event-loop turn between job registration
and the synchronous boot, so any already-queued poll/start is serviced first.
- Pro: ~1 line, no architecture change, removes the "first poll right after
  start" starvation cliff.
- Con: does not help if the boot's **own** synchronous span (the `new Database`
  open + pragmas) is long enough to span a later poll; it only moves the first
  starvation window, it does not eliminate per-poll starvation during a
  genuinely long synchronous open.

### Option B — Move the synchronous DB open off the boot's hot path
Open the database (and run synchronous pragmas/schema checks) **once at server
construction**, not per-operation inside `runner()`. Pass the already-open handle
into the facade so `runOperation`'s synchronous prefix is cheap.
- Pro: eliminates the dominant synchronous span from every start; the per-op
  boot becomes near-instant.
- Con: requires the facade/operations to accept an injected DB handle (a
  constructor/factory change in `news-crawler-backend-core`); needs care around
  per-job DB path overrides.

### Option C — Offload the crawl engine to a worker thread
Run the CPU-bound crawl (and its synchronous DB writes) in a `worker_thread`,
leaving the HTTP event loop free.
- Pro: fully eliminates main-loop starvation for both polls and concurrent
  starts; also fixes the concurrent-launch ECONNRESET without harness retries.
- Con: largest change (message-passing for telemetry/abort/pause/resume, DB
  handle ownership in the worker); highest test burden.

## Recommendation

Ship **A + B** together in `news-crawler-backend-core`: A removes the immediate
post-start starvation cliff, B removes the dominant recurring synchronous span.
Reserve **C** for if profiling shows residual starvation from the crawl's own
synchronous DB writes during the run (not just boot). Do not attempt any of
these as a harness change in `copilot-dl-news` — the harness-side poll-budget cap
(`clampTerminalWaitJobPollTimeout`) already bounds wall-clock; it cannot make a
blocked event loop respond.

## Acceptance criteria for the owner-repo change

1. With a sustained (multi-second) local crawl active, `GET /jobs/:jobId`
   responds within the per-poll budget for **every** host, not just the last.
2. Concurrent `--batch-concurrency 3` medium launch no longer produces
   `ECONNRESET`; all three hosts accept their start.
3. The sequential medium proof still scores 26/28 `ready-for-medium-local` with
   per-host terminalWait `outcome: terminal` under load (not just when the crawl
   happens to finish fast).
4. No duplicate operation jobs are created (the non-retrying fixture policy stays
   valid).

## Validation plan (after the owner-repo change lands, approval-gated)

- Re-run `tools/crawl/sequential-fixture-proof.js execute --wait-for-terminal
  --terminal-wait-timeout 15` and confirm earlier hosts report `terminal`.
- Re-run the concurrent medium proof (token `medium-*-concurrent-*`) and confirm
  it reaches `ready-for-medium-local` (target 26/28) without `partial-launch`.
- Compare new packets against `tmp/medium-sequential-terminalcap-packet.json`.

## Why this is recorded, not actioned

The local reliability goal (a reliable canonical local medium proof) is already
met by the sequential rung + harness-side poll-budget cap. This server-side fix
is a cross-repo improvement in `news-crawler-backend-core` and is therefore
approval-gated; it is captured here as a precise, ready-to-implement spec so the
owner-repo turn can act without re-deriving the trace.

## Addendum: second symptom of the same root (2026-05-30)

The synchronous-boot starvation root produces TWO distinct concurrent-launch
symptoms, not one. Forensics of token `medium-jobid-rerun-20260529-1`
(`--batch-concurrency 2 --batch-retries 0`, saved artifacts under
`tmp/medium-jobid-rerun-*`):

- `127.0.0.1` (first in flight): job `createdAt 20:14:59.087` — immediate;
  boots, runs, commits rows by `20:15:45`.
- `127.0.0.3` (second concurrent slot): `read ECONNRESET` — socket reset while
  host1's synchronous boot blocks the loop; permanent under `--batch-retries 0`.
- `127.0.0.2` (queued third): job `createdAt 20:15:37.110` — its `/start` was
  not accepted for **~38s**, i.e. until host1's crawl wound down and freed both
  the concurrency slot and the event loop. Only ~19-22s of the host-coverage
  watch window remained; its first DB write never committed in-window. This is
  **accepted-too-late-to-prove, not crashed/dropped** (job is genuinely
  `running`).

Implication: Option A (yield before the blocking prefix so `/start` returns
`accepted` immediately) + Option B (open DB once and inject) fix BOTH the host3
ECONNRESET and the host2 late-start-no-rows with one change. No new option is
needed; this only strengthens the A+B recommendation. The `/jobs` poll route
also returned `timeout after 1500ms` once a crawl was active in the same run,
confirming the cheap status route is starved by the same blocking prefix.
