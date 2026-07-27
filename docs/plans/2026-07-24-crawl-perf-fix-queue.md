# Crawl reliability + DB performance — measured baseline and fix queue

**Date:** 2026-07-24 · **Goal:** make a 10-site × 200-page crawl run to completion with the
rate visible in the Electron UI, and make the 27 GiB `news.db` measurably faster — without
breaking the copy-verify-swap DB workflow or the watchdog's real safety function.

Everything in §1 is **already measured**. Do not re-measure it.

---

## 0. SUMMARY AS OF 2026-07-26 (after 30 cycles) — read this first

This document grew by append; the sections below are chronological, including hypotheses that were
later **disproved**. Start here, not at the bottom.

### 0.1 Shipped and verified

| change | evidence |
|---|---|
| **Worker-mode default ON** (`UI_CRAWL_WORKER` in `main.js`) | crawl faults no longer kill the server; regression guard in `resilience-wiring.check.js` |
| **Stored politeness floor** honoured (`storedRateLimitProvider.js`) | 40 tests; real adapter → real `DomainLimiter` → measured 2400 ms wait. **Rarely binds** — most hosts already run slower than their preset |
| **Crawl concurrency default 1 → 3** (`NewsCrawler.js`) | **2.88×** on the fixture (`maxInFlight=3` proves it applied) + **0 × 429/403/503 across 3,419 live responses** on 7 mixed hosts. Guard test pins the value |
| **CLI start-URL fix** (`configArgs.js`, `crawl.js`) | a typed URL was silently discarded when the repo config set one; 14 tests + end-to-end (fixture counter **0 → 2**) |
| **`upsertUrl` rewrite** (ncdb) | correctness 10/10 + ncdb suite green. **PERF-NEUTRAL — never cite as a speed win** |
| **Offline instrument suite** (`tools/perf/`, 5 tools) | fixture counts its own requests; stability gate; warm-up discard |

### 0.2 RETRACTED — do not reuse these numbers

| claim | status |
|---|---|
| Throughput figures from cycles 5–8 (1,447 / 1,652 KB/s, "3× improvement") | **INVALID** — raw string compare on a mixed-format `fetched_at`; inflated 3–6× |
| "Parse scales hard with page weight: 8× bytes = +23.1 ms" | **RETRACTED** — true value **+4.1 ms**; a 5.6× overestimate from an underpowered 3×40 run |
| "Heavy pages cost twice (bandwidth + parse)" | **RETRACTED** with the above |
| "The machine slowed 2.5× / 64% variance" | **WRONG** — a first-replicate cold-start artifact in my own harness; reps 1–3 spread 4.8% |
| "`rpm: 30` imposes a 2 s floor" | **WRONG** — `limiter.js:50-53` early-returns with zero delay for hosts with no 429 history and no robots delay; the default is **inert** |
| "Queue starvation explains the idle" | **FALSIFIED** — jobs completed their full 200-page budget |
| `upsertUrl` predicted −1.5 to −2.5 ms/page | **FAILED** — no measurable difference after control-normalisation |

### 0.3 Current cost model (per page, fixture, concurrency 1)

`(idle) ~36%` · `DB ~2.7 ms CPU` (+ ~3.6 ms SQLite I/O hiding **inside** idle) · `jsdom ~2.3 ms` ·
`fs-stat ~1.3 ms` · `GC 0.60` · `Readability 0.30` · `cheerio 0.13` (**negligible — the article path
uses jsdom + Readability, not cheerio**).

### 0.4 Settled questions

- **Host selection is not a throughput lever** — Spearman ρ(backlog-rank, measured-speed) = **−0.093**.
- **The 1.2 MiB/s cap is not binding** — steady state ~481 KB/s ≈ 39% of it.
- **404s are ~3% of fetches** — recommended STOP. Every discovery path excluded by count
  (links 0/4,874,880; sitemap_cache 0/359); only URL-synthesis remains untested.
- **Live perf measurement is futile** — 60% same-condition variance. Use the fixture.

### 0.5 Ranked open items

1. `fs-stat ~1.3 ms/page` — last unexplained named cost (heed §0.2: self-time ≠ removable time).
2. `jsdom ~2.3 ms` — likely structural; Readability needs a real DOM.
3. `upsertDomain` — same interpolated-blob pattern as `upsertUrl`; **expect NULL perf**, justify on
   robustness only.
4. 404 URL-synthesis path — deprioritised (~3%).
5. Pre-existing, not mine: `configArgs > returns direct argv` stale assertion; gazetteer jsdom
   module-load failure; optional SQLite pragmas.

### 0.6 Operating notes that will bite you

- **Read the `db-off-normal` control arm FIRST and normalise by it.** Machine speed drifted 1.53×
  and 74% mid-cycle; the control caught two phantom regressions that were pure drift.
- **`npm test` in news-crawler-db is WATCH MODE** — use `npx vitest run` (this cost a full cycle).
- **The DL cap resets to 4 MB/s on every fresh server** — re-assert 1.2 MiB/s after each restart.
- Owner gates: live `news.db` writes (incl. ANALYZE) · deleting either ~28–30 GB backup · the
  Defender exclusion · politeness loosening · raising concurrency above 3.

---

## 1. Measured baseline (2026-07-24)

### Boot
| phase | cold | warm |
| --- | --- | --- |
| node boot + require tree | 12.4 s | — |
| app init → port bind | 55.2 s | — |
| **total** | **67.5 s** | **3.0 s** |

DB path cold = **0.9 s total** (require 568 ms, open 224 ms, queries 113 ms). No
computational gap >1.5 s across 45 warm startup log lines.

⇒ **~64 of the 67 s is cold filesystem I/O on CODE files.** The DB is *not* the boot cost.
Defender real-time protection is ON; the exclusion list needs admin to read.

### The crawl killer (root cause)
- Sitemaps are startup **step 3 of 6** (`src/core/crawler/startupSequence.js:125-141`);
  downloading is step 6 ⇒ **no pages download until the sitemap stage drains**.
- `src/core/crawler/sitemap.js:168-217` `handleDoc` is a **plain sync function with zero
  yields**; `parseXmlMaybe` (`sitemap.js:25-42`) is declared `async` but contains no `await`.
- **Per URL** (~5,000 of them) it synchronously performs:
  - 2 URL-decision passes (`RobotsAndSitemapCoordinator.js:287` + `UrlEligibilityService.js:93`)
  - 2–3 SQLite SELECTs where **`prepare()` is called per-call, no statement cache**
    (`news-crawler-db/src/db/sqlite/access/hubGapAnalysis.ts:463-486`)
  - 1 synchronous INSERT into `queue_events` (`CrawlerEvents.js:266`)
  - a `JSON.stringify` + stdout line
  - a full progress-detail rebuild evaluated **eagerly, ahead of its own throttle**
    (`NewsCrawler.js:998` → `progressDetail.js:34-70`)
- `sitemapMaxUrls` default **5000** (`sitemap.js:58`) ⇒ the observed `queueSize 4867` **is the
  cap, not a symptom**. `sitemapMaxFetches` default 12 (`sitemap.js:62`) is **not reachable
  from CLI/config**. Sitemap XML is exempt from the bandwidth limiter (`sitemap.js:64-69`).
- Observed: BBC 34 sitemaps → 1,356 queued → **0 pages downloaded** → killed.

### The watchdog (why jobs vanish)
- `src/ui/electron/unifiedApp/main.js:304-331`. HTTP GET `/` every 10 s, 3 s timeout,
  **3 consecutive strikes → SIGKILL** of the server child (~20–30 s to fire).
- Supervisor respawns a fresh process; the job registry is an in-memory `Map`
  (`src/server/crawl-api/v1/core/InProcessCrawlJobRegistry.js:71`) ⇒ `GET /api/v1/crawl/jobs`
  returns 0. Crawl jobs are **forked children**, so SIGKILL orphans them.
- Flags (Electron argv only, **space-separated**, no `=` form): `--watchdog-max-fails N`,
  `--watchdog-interval-ms N`. Hardcoded: 3 s probe timeout, path `/`, crash-loop guard
  `RESTART_MAX=3` within 60 s. `tools/dev-bridge/dev-bridge.js:252` does **not** pass them through.
- Disabled during startup (`serverReady` gate) and under `--use-existing-server`.

### DB config (measured live)
- Only 4 pragmas are ever set, in
  `news-crawler-db/src/db/sqlite/access/legacy-maintenanceQueries.ts:31-64`:
  `journal_mode=WAL`, `synchronous=NORMAL`, `foreign_keys=ON`, `busy_timeout=5000`.
- **Not set:** `mmap_size` = 0 (memory-mapped I/O fully disabled), `cache_size` = 16 MB
  (better-sqlite3 default), `temp_store` = 0 (file-backed).
- **`ANALYZE` has never been run** — no `sqlite_stat1` / `sqlite_stat4` rows exist.
- `news.db` = 27.0 GiB; `news.db-wal` = 74 MiB.

### Crawl rate (not a defect)
~0.5 MB/s, ~2.2 pages/s, avg page 272 KB — bound by per-host robots crawl-delay
(~1 req/s/host), **not** bandwidth. More hosts is the only lever.

### Launch commands that work
```bash
# UI + server, one process, multi-job, survives the cold boot
node_modules/electron/dist/electron.exe src/ui/electron/unifiedApp/main.js --port 3170 --allow-multi-jobs --server-wait-ms 180000
```
```bash
# Attach to an ALREADY-running server instead (this disables the watchdog)
node_modules/electron/dist/electron.exe src/ui/electron/unifiedApp/main.js --port 3170 --use-existing-server
```
```bash
# Bandwidth cap — resets to 4 MB/s on every fresh server
curl -X POST http://localhost:3170/api/v1/crawl/bandwidth-cap -H "Content-Type: application/json" -d "{\"mbps\":20}"
```
```bash
# Launch a batch
node tools/crawl/crawl-batch.js --ui-port 3170 --max-pages 200 --concurrency 10 <url> <url> ...
```
Compact rate UI: `http://localhost:3170/crawl-mini`. Cold boot ~68 s is **normal** — the 60 s
default probe is shorter than a cold boot, hence `--server-wait-ms`.

---

## 2. Fix queue — one step per cycle, in this order

Mark each step **DONE** with its result when complete.

### STEP 1 — Verify the no-code workaround — **DONE 2026-07-25 · NOT MET**
`--override useSitemap=false` **works** (not a silent no-op) but **does not fix the wedge**.

Evidence (10 × 200 launch, all 10 accepted):
- Override took effect: startup telemetry shows
  `{"id":"sitemaps","label":"Loading sitemaps","status":"skipped","durationMs":0,
  "message":"Sitemap ingestion disabled"}`. Robots.txt is still parsed ("Found 34 sitemap
  URL(s)" for BBC) but nothing is fetched or enqueued from it.
- **The sitemap flood is gone: 6 enqueued lines total** (vs 4,867 previously).
- **The crawl died anyway**: `jobs: 0`, 2 `[watchdog] server child unresponsive` strikes,
  only **+12 pages** (~1 per host — just the seeds), last fetch 440 s before the check.
- Last captured activity was crawler **startup** ("Loading robots.txt complete",
  "Starting crawler for www.dw.com"), not enqueueing.

⇒ **The sitemap fan-out is NOT the sole cause.** With sitemaps off and only 6 enqueues, 10
simultaneous jobs still wedged the server during crawler startup. The prime remaining
suspect is **DB contention**: 10 forked worker processes each opening the 27 GiB news.db
(74 MiB WAL) and issuing synchronous better-sqlite3 startup queries, while the server child's
own synchronous calls block past the 3 s watchdog probe timeout (the wedge mode already
documented at `main.js:241-257`).

Caveat: the captured log hit a 256 KB cap, so log evidence is truncated; the `jobs: 0` and
last-fetch figures come from the API/DB and are solid. The step's stated risk (losing sitemap
discovery ⇒ under-delivery) could **not** be evaluated — the crawl died before link discovery
could run.

**Re-prioritisation for the queue:** concurrency itself is now implicated — see Step 1b.

### STEP 1b — Concurrency bisect — **DONE 2026-07-25 · NOT MET (inconclusive; design flawed)**
Ran 1 / 3 / 5 sites (distinct site sets, `useSitemap=false`, 150 s observation each):

| sites | jobs after 150 s | pages | last fetch |
| --- | --- | --- | --- |
| 1 | 0 | +4 | 119 s ago |
| **3** | **3 (alive)** | **+59** | **0 s ago** |
| 5 | 0 | +36 | 61 s ago |

Non-monotonic ⇒ **does not support a simple "more concurrency = wedge" model.** But two
design flaws mean the result is not trustworthy either way:

1. **Trials were not isolated.** The inter-trial kill of the server child silently failed —
   proven by "server ready after **0 s**" on all three trials, where a real kill+respawn takes
   ~9 s warm. (Likely a path-separator mismatch in the PowerShell `CommandLine -like`
   filter.) So all three trials shared one long-lived server instance.
2. **`jobs: 0` is ambiguous.** It conflates *wedged*, *completed*, and *failed* — and in every
   trial **the jobs API still responded**, which a genuinely wedged server would not do. So
   these are not confirmed wedges at the moment of measurement.

**Solid takeaway:** a **3-site** crawl was demonstrably healthy — 3 jobs alive, +59 pages,
last fetch 0 s ago. That is the largest configuration proven to work today.

**New obstacle found:** today's crawl jobs write **no per-job log files** — the newest files in
`data/logs/jobs/` are from Jul 23, all ending `status=completed`. The launch response still
advertises `logPath: data/logs/jobs/<jobId>.log`. This removes the main per-job diagnostic
channel and needs its own look.

**Corrected experiment for next cycle:** distinguish the three exit modes explicitly rather
than inferring from `jobs: 0` — poll the jobs API *during* the run (not just at the end) and
record each job's terminal `status` (`completed` / `failed` / disappeared), plus whether the
server PID changed (proving a watchdog kill + respawn). Isolate trials by verifying the server
PID actually changes between them, or by accepting a single-trial-per-server-boot design.

### STEP 1c — Determine the actual exit mode — **DONE 2026-07-25 · MET**
5 sites, sitemaps off, polled every 15 s for 300 s, tracking my own job IDs + the port-3170
listener PID (via `netstat`, not a command-line match):

```
 t(s)  PID     api        myJobs  statuses
   0  3032    133ms           5  {"running":5}
  15  3032    839ms           5  {"completed":3,"running":2}
  30  NONE    ERR 3953ms                      <- server child GONE
  45  53472   357ms           0  {}           <- respawned, NEW pid
 60-300 53472  2-3ms          0  {}           <- stable, fast
```

**It is a CRASH, not a wedge.** The listener PID goes `3032 → NONE → 53472`: the server child
disappears entirely and the supervisor respawns it. Post-respawn the API answers in 2–3 ms, so
nothing is wedged. Death occurred between t=15 and t=30 — far too fast for the watchdog's
3-strike / ~30 s sequence, so the watchdog was *reacting to* the death, not causing it. The
earlier "wedge" framing (cycles 1/1b) was wrong.

**Jobs were mostly not killed — they had already finished.** 3 of 5 reached `completed` within
15 s; only the 2 still `running` were lost with the crash.

**Why the crash reaches the server (root enabler):** jobs today run **IN-PROCESS**, not forked.
`InProcessCrawlJobRegistry.js:55` sets `workerMode = process.env.UI_CRAWL_WORKER === '1'`, and
`server.js:1348-1354` constructs the registry without passing `workerMode`. `UI_CRAWL_WORKER=1`
is set **only** by `tools/dev-bridge/dev-bridge.js:231,260` — **`main.js:67-76` does not set it.**
Launching Electron directly (as done all session) therefore runs crawls inside the server
child, so any crawl-side fault kills the server. Confirmed live: no `crawl-operation-worker.js`
process existed. This also explains the missing job logs — the per-job WriteStream is created
only in `_startOperationInWorker` (`InProcessCrawlJobRegistry.js:544-552`); the in-process
branch never creates one. (The old `.on('error')` bug at :486 is **fixed** —
`_guardStreamErrors` :240-254 is called at :550 before any write. Not the cause.)

### STEP 1d — Restore worker mode and re-test — **DONE 2026-07-25 · MET (this is the fix)**
Relaunched Electron with `UI_CRAWL_WORKER=1` in the environment (inherited by the server child
via `main.js:69-73`), then ran 5 × 200 with sitemaps off, polling every 20 s for 300 s:

| signal | in-process (Step 1c) | worker mode (Step 1d) |
| --- | --- | --- |
| server PID | 3032 → NONE → 53472 (crashed) | **57788 unchanged, 300 s** |
| `crawl-operation-worker` procs | 0 | **5, settling to 3** |
| per-job log files | 0 | **5 created** |
| jobs at t=300 | 0 (vanished) | **5 tracked** (2 running, 3 completed) |
| pages | +4 … +36 | **605 pages / 286.8 MB**, last fetch 16 s ago |

`job.mode = "operation-job"`. Per-host: apnews **291**, bbc **220**, aljazeera 41, guardian 19.

**⇒ THE FIX IS A LAUNCH SETTING, NOT A CODE CHANGE.** Run the app so that
`UI_CRAWL_WORKER=1` reaches the server child — either via `tools/dev-bridge` `start-electron`
(which sets it at `dev-bridge.js:260`) or by exporting it before launching Electron directly.
Crawls then run in forked workers, so a crawl-side fault kills only a worker; the server, the
job registry and the UI all survive.

**Problem (B) also largely dissolved:** jobs no longer finish in <15 s — AP and BBC both passed
200 pages. So "jobs completing instantly" was a symptom of in-process mode, not of sitemaps
being off.

**Still open (resolved in 1e):** whether the sitemap fan-out destabilises a *worker*.

### STEP 1e — Worker mode + sitemaps ON, 10 × 200 — **DONE 2026-07-26 · MET · ORIGINAL GOAL ACHIEVED**
No `--override` (sitemaps ON), 10 sites × 200, polled every 30 s for 360 s:

```
 t(s)  PID     wk  jobs  statuses
   0  62816   10    10  {"running":10}
  60  62816    9    10  {"running":9,"completed":1}
 180  62816    8    10  {"failed":1,"completed":1,"running":8}
 360  62816    8    10  {"failed":1,"completed":1,"running":8}
```

- **Server PID 62816 UNCHANGED for the full 360 s** — survives with sitemaps ON.
- **All 10 jobs tracked throughout**; none vanished. 8 still running at 6 min, 1 completed,
  1 failed (a single site failing is normal).
- **No worker stalled.** Every one of the 10 hosts made progress. The 5 hosts unique to this
  run (npr 161, irishtimes 61, independent 23, france24 15, dw 11) all downloaded, so the
  sitemap fan-out did **not** wedge any worker.
- **Throughput: 1,062 pages / 434 MB in 5 min = ~1.45 MB/s** — roughly 3× the ~0.5 MB/s seen
  in every earlier run, because a sitemap-fed queue keeps all hosts busy.

*Measurement caveat:* the per-host table uses a 10-minute window that overlaps the Step-1d
run, so absolute per-host totals are not purely this run; the authoritative figure for this run
is the `http_responses` delta (+338 at t=360, climbing). The "no host at 0" signal is valid
because the 5 hosts above were not crawled in 1d.

⇒ **Steps 2 and 3 are NOT required for stability.** The statement cache and the enqueue-yield
fix remain worthwhile *performance* work, but they are no longer blocking the goal. Re-rank
them against the DB work (Steps 4/5) on merit rather than urgency.

### TWO SEPARATE PROBLEMS IDENTIFIED IN STEP 1c (both addressed by 1d)
**(A) The server child crashes** because jobs run in-process. Likely fixed by restoring worker
mode: launch via dev-bridge `start-electron`, or set `UI_CRAWL_WORKER=1` in `main.js`'s spawn
env (`main.js:69-73`). Then a crawl fault kills only a worker. **Test this next.**
**(B) Jobs complete near-instantly with sitemaps off** — 3/5 `completed` in under 15 s, yielding
only ~4–36 pages. Even with (A) fixed, this will not produce 200 pages/site. Needs its own
diagnosis: why does a seeded crawl terminate immediately instead of following links?
Note (B) is likely *caused by* the Step-1 workaround (sitemaps off ⇒ little to crawl), so it may
resolve if the real sitemap fix (Step 3) replaces the workaround.

### STEP 2 — Cache prepared statements (`hubGapAnalysis.ts:463-486`)
`prepare()` currently runs per URL. Cache per-instance.
**Risk:** statements are bound to a `Database` handle, and the copy-verify-swap workflow
**closes and reopens** handles ⇒ the cache must invalidate on close/reopen or you get
"database connection is not open". Add a reopen test.
**Note:** this is in the `news-crawler-db` sibling repo, whose tree is already dirty with 10+
pre-existing changes on `main` — isolate your commit. You **must** run `npm run build` (tsc)
or copilot keeps loading the stale `dist` and the fix silently does nothing.

### STEP 3 — Yield inside the enqueue fan-out (`sitemap.js:178-200`) ← **the real fix**
Yield (`await new Promise(setImmediate)`) every ~50–100 enqueues.
**Risks:** (a) partial async conversion — `handleDoc`→`pushUrl`→`opts.push`→`enqueueRequest`
is all sync today; a missed `await` loses backpressure and creates unhandled rejections;
(b) yields let other jobs interleave mid-ingest, so anything assuming that loop was atomic
changes behaviour (see the seed-priority-after-flood note at `NewsCrawler.js:1956`);
(c) `sitemap.js:215` appends children to the list **while iterating it**.
**Verify:** HTTP stays responsive during sitemap ingest (poll `/api/v1/crawl/jobs` throughout,
assert no timeouts) **and** a 10 × 200 crawl completes.
**Write a regression test first** — this path has thin coverage.
**Good news:** crawl workers fork fresh per crawl, so `src/core/crawler` changes take effect
without an Electron restart.

### STEP 4 — `ANALYZE`, safely — **DONE 2026-07-26 · MET · measured NO-GO, do not run it**
Rather than pay a 27 GiB copy first, I asked the cheaper prior question: **is the planner
actually choosing badly?** Measured read-only on the live DB (no gated write, no copy):

```
Q1 isUrlSuccessfullyProcessedWithContent  (the per-URL enqueue hot query)
  SEARCH u  USING COVERING INDEX sqlite_autoindex_urls_1 (url=?)
  SEARCH hr USING COVERING INDEX idx_http_responses_url_status (url_id=? AND http_status>? <?)
  SEARCH cs USING COVERING INDEX idx_content_storage_http_response (http_response_id=?)
  -> 0.013 ms/call
Q2 getLatestFetchForUrl
  SEARCH u  USING COVERING INDEX sqlite_autoindex_urls_1 (url=?)
  SEARCH hr USING COVERING INDEX idx_http_responses_url_fetched (url_id=?)
  -> 0.032 ms/call
```

**Every table in both hot queries already uses a COVERING INDEX, with zero statistics.**
`ANALYZE` therefore has no upside here, while carrying a real downside (statistics can flip a
good plan to a bad one) plus a gated live write and a 27 GiB copy. **Recommendation: do not
run ANALYZE.** Revisit only if a specific query is later shown to pick a bad plan.

### STEP 2 — statement cache — **MEASURED, NOT WORTH DOING**
Directly compared a cached statement vs `prepare()`-per-call over 1,000 real lookups:
cached **0.0113 ms/call**, per-call **0.0272 ms/call** — 2.4× slower, but only **0.016 ms**
of absolute overhead. Projected over a full 5,000-URL sitemap ingest: **136 ms vs 57 ms — a
saving of ~79 milliseconds.** Negligible against a multi-minute crawl. The 2.4× ratio is
real but the absolute is irrelevant.

**This also corrects the cycle-1 research**, which described the per-URL enqueue work as
"minutes of a fully wedged event loop" against the 28 GB DB. Measured, the DB portion is
~0.03 ms/URL ⇒ **~150 ms for 5,000 URLs**, not minutes — an over-estimate of roughly three
orders of magnitude. Caveat: measured on a read-only connection with warm cache and no write
contention; under concurrent worker writes it will be slower, but even 10× slower is ~1.5 s,
not minutes.

### STEP 3 — enqueue yields — **JUSTIFICATION GONE**
Step 1e proved no worker stalls on the fan-out, and the DB cost above shows the fan-out is not
expensive. Keep only if a future measurement shows a worker actually blocking.

⇒ **There is no evidence of a DB performance problem.** After the launch fix (1d/1e), Steps
2, 3 and 4 are all unwarranted. Step 5's pragmas have correspondingly limited upside — queries
already run at 0.01 ms via covering indexes — and `mmap_size` still carries the DB-swap risk.
Treat the remaining DB work as optional and evidence-driven, not scheduled.

### STEP 5 — Pragmas, one at a time (`legacy-maintenanceQueries.ts:31-64`)
- **5a `cache_size`** — set on the **server connection only**. Risk: it is per-connection and
  forked crawl workers each open the DB — 64 MB × 11 ≈ 700 MB if applied globally.
- **5b `temp_store=MEMORY`** — risk: large sorts / TEMP B-TREEs move from disk to RAM; a
  runaway query can OOM the server. This codebase has known TEMP B-TREE queries.
- **5c `mmap_size`** — **only after proving the DB swap still works.** Risk: on Windows a
  mmapped file can block rename/delete with a sharing violation, which would break
  copy-verify-swap; RSS also inflates. Test `mv news.db news.db.bak` with the server running
  *before* adopting.

### STEP 6 — Optional / lower value
Batch `queue_events` inserts (`CrawlerEvents.js:266` — risk: buffered rows lost on SIGKILL,
which is exactly what the watchdog does); make progress-detail lazy (`NewsCrawler.js:998`);
expose `sitemapMaxFetches` via CLI; pass watchdog flags through `dev-bridge.js:252`.
If a watchdog **grace period** is attempted it must use an **external** liveness signal
(e.g. DB row growth) — in-process counters freeze when the process wedges, so a naive grace
check disables the watchdog exactly when it is needed.

---

### CYCLE 7 — Reliability locked in + speed measured — **DONE 2026-07-26 · MET**

**Reliability (the fix is now in the repo and cannot silently regress):**
- `main.js:69-79` now defaults `UI_CRAWL_WORKER: process.env.UI_CRAWL_WORKER || '1'`, so a
  direct `electron main.js` launch gets worker mode — the asymmetry with dev-bridge that cost
  four cycles is gone. Still overridable with `UI_CRAWL_WORKER=0`.
- `tools/dev-bridge/checks/resilience-wiring.check.js` now asserts that default is present, so
  deleting it fails a probe rather than silently reintroducing the crash class.
- **Proven live with the plain launch command and NO env var set:** workers before launch 0 →
  **20 after**; server PID 61176 unchanged for 360 s; all 20 jobs tracked (15 running /
  3 completed / 2 failed at t=360).

**Speed — adding hosts has strongly diminishing returns:**

| configuration | sustained rate |
| --- | --- |
| 10 hosts (cycle 5) | 1,447 KB/s |
| **20 hosts (cycle 7)** | **1,652 KB/s** (2,853 pages / 991 MB in 10 min) |

Doubling host count bought only **~14%**, because throughput is concentrated in a few hosts:
top 8 (apnews 585, bbc 469, dw 314, irishtimes 273, aljazeera 262, npr 255, independent 204,
france24 129) = **2,491 of 2,853 pages (87%)**. The 10 newly-added hosts contributed **281
pages (10%)** combined — cbc 2, abc.net.au 3, japantimes 3, rte 3, theage 5, straitstimes 6,
euronews 12, thehindu 49, smh 97, channelnewsasia 101 — and 2 jobs failed outright.

⇒ **Host QUALITY dominates host COUNT.** The lever for more speed is selecting more hosts
*like the fast ones*, not simply more hosts. `tools/crawl/frontier-hosts.js` already ranks
proven-crawlable hosts from the DB and is the right instrument for that.

*Caveat:* the first reading taken at t=360 showed only 280 KB/s, because that window was the
run's tail after fast hosts had finished. The 10-minute window is the representative figure.
Always check which phase of a run a rate window covers before comparing.

### ⚠️ CYCLE 8 — **NOT MET · ALL PRIOR THROUGHPUT FIGURES IN THIS DOC ARE INVALID**

Step 8 (host-selection speed test) could not be answered, because the measurement itself was
broken. Two independent errors, both mine:

**(1) The mixed-timestamp trap.** `http_responses.fetched_at` holds **202,176 ISO-`T…Z`** rows
and **93,278 space-form** rows. Every rate query in cycles 5–8 used
`WHERE fetched_at >= datetime('now', '-N minutes')` — a RAW string comparison against a
space-form literal, which mis-sorts the ISO rows. Correct form is
`WHERE datetime(fetched_at) >= datetime('now','-N minutes')` (wrap BOTH sides).

Measured side-by-side at the same instant:

| window | raw (as used in cycles 5-8) | `datetime()`-wrapped (correct) |
| --- | --- | --- |
| 2 min | 3,200 KB/s | **517 KB/s** |
| 5 min | 1,280 KB/s | **482 KB/s** |
| 10 min | 642 KB/s | **377 KB/s** |

The give-away was internal inconsistency: successive 2-minute samples climbed monotonically
to **240% of a hard bandwidth cap** while the 5-minute window read 96% — arithmetically
impossible, which is what prompted the check.

⇒ **The 1,447 KB/s (cycle 5) and 1,652 KB/s (cycle 7) figures, and the "0.5 → 1.45 MB/s, 3×"
claim, are all inflated by this bug and must not be relied on.** Relative comparisons are also
unsafe, since the inflation factor depends on the format mix inside each window, which drifts.
What survives unaffected: everything proven by **PID / worker-count / job-status / page-count**
evidence — the crash diagnosis, the worker-mode fix, and stability. Only the *rate* numbers fall.

**(2) Confounded trial.** 35 jobs were on the server (27 running) — cycle 7's crawl was never
stopped, so cycle 8 measured ~30 concurrent jobs, not the 15 ranked hosts.

**Corrected current reading** (still confounded by (2), so indicative only): ~**480–520 KB/s**
under the 1.2 MiB/s cap — i.e. **~40% of cap**, so the cap is *not* the binding constraint;
per-host politeness still is.

**Note:** this repo already fixed this exact bug once — ledger #36, "crawl-rate.js
timezone-string-compare bug (measurement integrity)" — and it is recorded in the agent memory
`pm2-log-and-timestamp-verification-traps`. It was still reproduced from scratch here. Any new
rate query MUST wrap `datetime()` on both sides.

**Redo for next cycle:** stop all jobs first (verify `jobs: 0`), then run the 15 ranked hosts
alone, measuring with `datetime()`-wrapped windows only. — **DONE, see CYCLE 9 below.**

### ✅ CYCLE 9 / STEP 9 — **MET.** Ranked-15 hold **≈375 KB/s = 31% of the 1.2 MiB/s cap**

Clean re-run of the cycle-8 trial. Pre-flight *asserted* the clean start rather than assuming it
(`jobs=0`, `workers=0`, else abort) — the check cycle 8 lacked.

**Triangulated, not single-sourced.** The lesson of cycle 8 is that one instrument cannot
validate itself, so this run measured with three that fail differently:

| # | Instrument | Why it's independent |
|---|---|---|
| A | own SQL, `datetime()` wrapped **both sides** | the direct fix |
| B | `/api/v1/crawl-rate-timeseries` (ncdb, per-minute buckets) | separate query, already ledger-#36-correct; buckets expose *shape* |
| C | registry per-job `bytes` counters | the crawler's own accounting — **never reads a timestamp**, so immune to this entire bug class |

**Result — A vs B diverge by 1–2%, and C tracks both.** Nothing exceeded the cap.

| window | A SQL | B timeseries | divergence | % of cap |
|---|---|---|---|---|
| 5 min | 340 KB/s (393 fetches) | 348 KB/s (414) | 2% | 28% |
| 10 min | 380 KB/s (910 fetches) | 375 KB/s (946) | 1% | 31% |

Per-minute buckets (KB/s): `151, 301, 488, 434, 638, 360, 316, 359, 342, 365` — ramp, peak, settle.
A physically sane shape. Cycle 8's fake reading climbed *monotonically* forever, which these
buckets would have exposed on sight; the aggregate-only view hid it.

PID `47556` unchanged across the full run; 13–15 workers throughout; 1 of 15 hosts failed at start.

**The finding that matters: the cap is not the binding constraint.** At 15 concurrent hosts the
crawl uses **less than a third** of the 1.2 MiB/s allowance. Raising the cap would change nothing.
The limit is per-host politeness delay, so the only real throughput lever is **more hosts in
parallel** — consistent with ledger #45 and the `crawl-gap-is-politeness-not-deadtime` note.

**Honest limit on the conclusion:** this gives a trustworthy number *for ranked hosts*, which is
what Step 9 asked for. It does **not** establish that ranking beats not-ranking — the unranked
comparison arm only exists in invalidated form. A/B "ranked vs arbitrary 15" is still unanswered,
and `frontier-hosts.js` ranks by *backlog*, not observed speed (it omits bbc/dw, the fastest hosts
seen in cycle 7). That reconciliation is the open question.

**Harness:** `scratchpad/cycle9.js` — reusable; pre-flight aborts on a dirty start and every rate is
cap-checked (`>105%` prints `INSTRUMENT BROKEN, not a finding`).

### ✅ CYCLE 10 / STEP 10 — trial **NO-GO** (refuted before running); question **ANSWERED** from existing data

**Backlog-ranking does not predict crawl speed: Spearman ρ = −0.093 (n=18 hosts).**

An adversarial design review, plus my own verification, killed the planned 3-arm live trial
*before* spending ~35 min of wall-clock on it. Three independent defects:

1. **Arm B cannot exist.** `frontier-hosts.js --limit 30` returns **20 hosts** — the whole
   proven-crawlable population (gate `HAVING proven>=1000 AND frontier>=5000`,
   `tools/crawl/frontier-hosts.js:64`). "Ranks 16–30" is 5 hosts, so Arm B would differ from
   Arm A in *both* ranking and host count — the exact variable Arm C existed to isolate.
2. **The null result was guaranteed.** Measured per-host politeness-bound supply
   (avg bytes/fetch ÷ mean inter-fetch gap, last 60k responses, PK-bounded):
   **Arm-A hosts supply ≈ 3,233 KB/s — 2.6× the 1.2 MiB/s cap and 8.6× the 375 KB/s observed.**
   The manipulated variable acts on a resource that is nowhere near binding, so every arm lands
   at the same downstream ceiling and "ranking doesn't matter" would be an artifact.
3. **The arms would overlap.** `crawl-batch.js` is fire-and-forget (`process.exit()` at line 412);
   jobs stop only at their 200-page budget, and cycle 9 had 12 of 15 still running well past the
   window. Arm C would inherit Arm A + B's residual jobs, biasing it upward by accumulation —
   spuriously "confirming" the more-hosts hypothesis.

**The retrospective answer** (thousands of fetches per host, ~0.2 s, no crawl):

| ranker rank (est-articles) | host | → speed rank | effective KB/s |
|---|---|---|---|
| 1 | www.theguardian.com | 15 | 13 |
| 9 | **www.cnn.com** | **1** | **2,505** |
| 8 | www.theglobeandmail.com | 2 | 157 |
| 12 | www.telegraph.co.uk | 3 | 129 |
| 20 | www.bbc.com | 10 | 35 |

Guardian ranks **1st by backlog and 15th of 18 by speed** (21 s mean gap). CNN ranks 9th by
backlog and **1st by speed by 16×**. ρ = −0.093 ⇒ **no relationship.** This is not a
contradiction of the ranker — it optimizes *article backlog*, and its 2026-07-21 rationale was
explicitly to deprioritize hub-heavy hosts for headline quality. It was never a speed ranking,
and now we know it isn't one by accident either.

**Byte-metric concentration makes any KB/s arm comparison meaningless:** CNN alone is
**77% of Arm-A's supply** (3,533 KB avg page vs BBC's 271 KB — a >20× page-weight spread). An
arm's KB/s score would mostly measure *"was CNN in this arm"* — the per-host pseudo-replication
collapse already recorded in `cross-taxonomy-delegation-is-a-repoint`.

**Honest caveats.** (a) "Supply" extrapolates observed byte-rate as if sustainable; real sustained
crawling may hit rate limits. (b) Excluding CNN as the outlier, Arm-A supply is **728 KB/s** — still
~2× observed and ~59% of cap, so headroom remains but the margin is 1.9×, not 8.6×. The conclusion
"not host-supply-bound" survives; the *size* of the margin depends on CNN.

**Correction to CYCLE 9's write-up:** I described instruments A and B as independent. They are not
— `/api/v1/crawl-rate-timeseries` queries `http_responses`, the same source as my SQL. Their
agreement proved the `datetime()` fix and *precision*, not attribution. Only instrument C (registry
per-job byte counters, via worker `bandwidth-usage` IPC) is genuinely independent, and it is what
makes 375 KB/s trustworthy. The number stands; the reasoning I gave for it was overstated.

**⇒ The bottleneck is downstream of both host supply and the cap** — consistent with the
`crawl-throughput-ceiling-eventloop` note (electron event loop, real peak ~0.43 MB/s; 375 KB/s sits
right on it). **Host selection and host count are not the lever and cannot be measured as one until
that ceiling is raised.** That reorders the queue: raising process headroom now precedes any further
selection work.

### ✅ CYCLE 11 / STEP 11 — bottleneck NAMED + QUANTIFIED; attribution NARROWED, not closed. Fix PROPOSED, nothing shipped.

**The ceiling is not bandwidth, not host supply, not CPU, and not politeness. It is unexplained idle:
68% of inter-fetch time is unaccounted for by round-trip time plus configured crawl-delay.**

**Steady-state baseline (contiguous 7-min block, 00:19–00:25, 856 fetches, reconciled 0.0% drift):
481 KB/s = 39% of the 1.2 MiB/s cap.** Consistent with cycle 9's 375 KB/s.

Decomposition of the average inter-fetch gap:

| component | share | evidence |
|---|---|---|
| actual download | **~1–3%** | `download_ms` 0.02–0.11 s per page |
| TTFB (server think-time) | ~10–30% | `ttfb_ms` 0.1–3.1 s |
| configured crawl-delay | ~0% for 13/15 hosts | `robots_cache` has **0 rows** |
| **unexplained idle** | **68%** | gap 1.8–19.2 s vs explained 0.3–2.9 s |

**The natural experiment that makes this solid:** the only two hosts with a stored delay are the only
two whose gaps are fully explained — Straits Times (10 s configured, **0.0 s** unexplained) and RTÉ
(5 s configured, **0.2 s** unexplained). Where a delay is configured the throttle honours it exactly.
Where none is configured the crawler idles anyway, for no configured reason.

**Ruled out by measurement:**
- *Bandwidth* — 39% of cap.
- *Host supply* — cycle 10: 2.6× the cap.
- *CPU* — 32 logical cores; server child + workers nowhere near saturation.
- *Politeness* — `robots_cache` empty; 13/15 hosts have no delay to comply with.
- *Rate limiting* — telegraph, irishtimes, euronews and independent all carry `safe_rpm = 300`
  (0.2 s implied) yet show gaps of 1.8 s, 14.9 s, 13.7 s and 19.2 s. **Same nominal limit, 10×
  different behaviour ⇒ the rate limiter is not what is pacing them.**
- *Serial latency* — download is 1–3% of the gap; the connection is idle, not busy.

**Leading hypothesis (NOT yet proven): per-host queue starvation.** Gap is inversely related to
fetch count — telegraph (167 fetches) sat at 1.8 s while independent (20 fetches) sat at 19.2 s.
That is the signature of *some hosts having ready work and others waiting for it*, not of pacing.
Jobs were homepage-seeded, so a host whose homepage yielded few links would starve.
**Verification for next cycle:** correlate per-host links-discovered against observed gap; if they
track, starvation is confirmed and the fix is queue hydration, not the event loop.

**⇒ This retires the "electron event-loop ceiling" framing** that Steps 9–11 inherited. That note
described a *concurrent-frontier-crawl* wedge (ledger #39/#40); it does not describe this run,
where the loop is not saturated and the connections are simply idle. Do not profile the event loop
until the starvation hypothesis is tested — it would be the wrong instrument.

**PROPOSED FIX (not shipped, per this step's scope): keep every host's queue non-empty.** Hydrate
per-host work continuously rather than relying on homepage-seed discovery, so a worker never waits
for a URL to fetch. **Predicted gain, stated in advance:** collapsing the unexplained 68% would raise
481 KB/s toward **~1,200 KB/s — where the 1.2 MiB/s cap finally binds** (≈2.5×). If the fix lands and
throughput does *not* move, the starvation hypothesis is wrong and profiling becomes justified.

**Two measurement bugs I made and caught this cycle** (both mine, both self-caught before reporting):
1. v1 averaged per-host gaps across a 30-min drain tail (1–2 fetches/min), manufacturing fake slack.
2. v2 selected 29 *scattered* steady minutes then queried the whole 131-min span between the first
   and last — 7,551 fetches divided by 29 minutes of time, yielding **103% of a hard cap**. Caught by
   the above-cap sanity check. v3 uses a *contiguous* block plus a hard reconciliation assertion
   (per-host fetch count must match the block total; it aborts otherwise — drift came out 0.0%).

**Incidental finding, not chased:** `robots_cache` is empty (0 rows) although the schema and a
`crawl_delay_seconds` column exist. Robots is parsed in-memory at runtime
(`CrawlerServiceWiring.js:353` → `DomainThrottleManager.setRobotsCrawlDelay`), so compliance is
likely intact, but it is re-fetched every job and never persisted. Worth confirming separately.

### ✅ CYCLE 12 / STEP 12 — starvation hypothesis **FALSIFIED**. Cause is deliberate pacing, attributed to two code defaults. Gated on an owner decision.

**Falsifier (clean and decisive): the jobs completed their full 200-page budget** — nytimes,
irishtimes, apnews, independent and thehindu all reached exactly 200 pages. A queue-starved job
*ends early* with fewer pages; these never ran out of URLs. They were paced, not starved.
The cycle-11 prediction (481 → ~1,200 KB/s via continuous hydration) is therefore **withdrawn
before any code was written** — hydration would have addressed a problem that does not exist.

**What is actually pacing the crawl — two defaults, both intentional:**

| # | default | file | effect |
|---|---|---|---|
| 1 | `concurrency: { default: 1 }` | `NewsCrawler.js:215` | each host job holds **one** request in flight; fetches are serial |
| 2 | `rpm: 30` — *"Default conservative RPM for new domains to prevent 429 errors"* | `DomainThrottleManager.js` `getDomainState` | a **2 s floor** between requests to any host |

`crawl-batch --concurrency 15` does **not** override #1 — it sets parallel *start requests*
(cycle 10), so every job in these runs fetched serially.

**The fastest hosts sit exactly on the 2 s floor, which confirms #2 is binding for them:**
Telegraph 1.8 s (~33 rpm, RTT 0.58 s) and ABC 2.2 s (~27 rpm, RTT 0.47 s). Both could go ~2–3×
faster on round-trip time alone; the throttle is what holds them. Note that for these hosts the
**throttle binds before concurrency does** (2 s floor > 0.58 s RTT) — so raising concurrency alone
would change nothing. That is a cycle-10-style check: verify which of the two is actually binding
before touching either.

**Stored rate limits are being ignored, and host-key form is inconsistent.** `domain_rate_limits`
holds rows under *both* bare and `www.` forms — `telegraph.co.uk` (preset 25) but
`www.irishtimes.com` (learned 300); `abc.net.au` has **no row at all**. Hosts with
`learned_rpm = 300` (0.2 s implied) were observed at 13.7 s and 14.9 s — **~70× slower than their
own stored limit** — so the learned values are not reaching the limiter for these fetches.

**Residual, honestly unexplained:** the slow population (euronews 13.7 s at 0.2 s RTT, independent
19.2 s at 0.11 s RTT) is slower than concurrency=1, the 30 rpm floor, *and* their stored limits can
account for. Two distinct populations exist; #1 and #2 explain the fast one only. Per-page
post-fetch work (parse + DB write) is the untested candidate and needs a per-page timing instrument,
not more DB archaeology. Also note these hosts contributed few fetches (20–29) in the block, so
their per-host gap is a noisy statistic — do not over-read it.

**⇒ PROPOSED, NOT SHIPPED — and it needs an owner decision, because it is not purely technical.**
Raising per-host concurrency and/or the 30 rpm default makes us hit third-party news sites harder.
That default exists explicitly to prevent 429s; loosening it risks rate-limiting or IP blocks
against real publishers. **Recommended shape if approved:** raise concurrency 1 → 3–4 *per host*
and honour the already-stored `learned_rpm` instead of the 30 rpm default, keeping the robots
crawl-delay floor absolute and the 429 backoff untouched, ramped on a couple of hosts first.
**Predicted gain: 481 → cap-bound ~1,200 KB/s**, since the 1.2 MiB/s cap binds before the hosts do
(cycle 10: supply is 2.6× the cap). Fix the host-key normalisation (`www.` vs bare) either way —
that is a plain bug and carries no politeness risk.

**OWNER DECISION 2026-07-26 (in chat, this session): APPROVED — "stored limits + concurrency 3–4".**
Scope authorised: (a) fix the `www.`-vs-bare host-key inconsistency so stored preset/learned rate
limits actually reach the limiter instead of falling back to the 30 rpm default; (b) raise per-host
in-flight concurrency from 1 to 3–4. **Conditions carried from the recommendation: robots
crawl-delay stays an absolute floor, 429 backoff stays untouched, and the change is ramped on two
hosts first with 429 responses watched before rolling wider.** Approval covers this change only —
it does not extend to further loosening.

### ⚠️ CYCLE 13 / STEP 13 — PARTIAL. Concurrency 4 doubled one host with 0 × 429; the arm total is CONFOUNDED. Approved fix (a) NOT implemented — it is a speed *regression*, not a fix.

**Two of my own earlier claims are corrected here.**

**Correction 1 — `rpm: 30` does NOT pace un-429'd hosts. Cycle 12's attribution was wrong.**
`limiter.js:50-53` early-returns with **zero delay**:
```js
if (!s.isLimited && politenessFloorMs <= 0) { s.lastRequestAt = now; return; }
```
`rateInterval` is additionally gated on `s.isLimited` (`limiter.js:59`), which is set only by a 429.
So for a host with no 429 history and no robots crawl-delay, the limiter imposes **nothing**. The
`rpm: 30` default is inert. Telegraph's 1.75 s gap is fetch (~0.67 s) + ~1.1 s of **post-fetch
processing**, serialised behind `concurrency: 1` — not a throttle.

**Correction 2 — approved fix (a) cannot deliver a speedup; it would SLOW crawling.** Nothing in the
crawl path reads `domain_rate_limits`: grep for `learned_rpm`/`safe_rpm` across `src/` returns
nothing, and ncdb's `getDomainRateLimit` (`coverage.ts:322`) has no callers. `limiter.js` holds state
in a bare in-memory `Map`, fresh every crawl. **So the stored presets expressing intended politeness
— Telegraph 25 rpm, Independent 30, Al Jazeera 40 — are already ignored, and we fetch FASTER than
they specify.** Wiring them in is a politeness *tightening*. **Not implemented; it needs a fresh
owner decision under its true description.** (The `www.`-vs-bare key inconsistency is real but moot
while no lookup exists.)

**Correction 3 — cycle 12's falsifier was weaker than stated.** "Jobs completed 200/200" rules out
*terminal* starvation only; a job can stall repeatedly on link discovery and still reach its budget.
Cycle 13 then observed terminal starvation directly (below). Intermittent starvation remains live.

**The A/B (owner-approved ramp, two hosts, only concurrency varied, `preferCache=false` pinned in
both arms, zero code changed — ramped purely via `--override concurrency=N`):**

| | arm A (conc 1) | arm B (conc 4) |
|---|---|---|
| abc.net.au | 205 fetches, gap **2.05 s**, rtt 0.76 s | **417** fetches, gap **1.01 s**, rtt 1.75 s |
| telegraph | 240 fetches, gap 1.75 s | **29** fetches, gap 14.5 s |
| total | 445 fetches, 306 KB/s | 446 fetches, 300 KB/s |
| **429s** | **0** | **0** |

**MET:** abc.net.au **2.03× the fetches, gap exactly halved, zero 429s** — the pre-registered
"overlappable idle" outcome. Its rtt rose 0.76 → 1.75 s (server-side queuing), so the host *is*
being pushed harder; still no 429s, within the owner's conditions.

**NOT MET — the arm TOTAL is invalid, and 300-vs-306 must not be read as "no effect":**
1. **Order-induced depletion (my design error).** Arm A downloaded 240 Telegraph pages; arm B found
   them already fetched (`UNDOWNLOADED = NOT EXISTS`, `legacy-crawlFrontier.ts:61`) and Telegraph
   **exhausted its pool after 29 pages**. Cycle 10's design review warned about exactly this
   carry-over and I did not control for it.
2. **Early completion shrinks the window.** Both arm-B jobs completed by t=300 s, so fetches froze at
   446 while the 7-min denominator grew — the printed rate falls 501→300 arithmetically, not
   physically. Normalised to active time: arm B **1.49 fetches/s** vs arm A **1.06/s** (~1.4×) even
   with Telegraph crippled.

**Incidental but important: terminal starvation is REAL once a host's undownloaded pool drains**
(Telegraph, 29 pages then `completed`). Homepage-seeded crawls exhaust a host quickly on repeat runs.

**REDO for next cycle:** counterbalance arm order (A,B then B,A) or give each arm hosts the other has
not touched; normalise by **active** time, not wall-clock; and assert jobs are still `running` at the
window's end or discard the window.

**OWNER DECISION 2026-07-26 #2 (in chat, after being told fix (a) is a politeness TIGHTENING, not a
speedup): APPROVED — "wire them in, be more polite, accept slower."** Honour the stored
`domain_rate_limits` presets/learned values as a pacing floor, accepting reduced throughput on hosts
that have one. This now genuinely requires the `www.`-vs-bare host-key normalisation, since a lookup
will exist for the first time.

**Interaction the owner was warned about:** this partly cancels the concurrency gain on preset-having
hosts — Telegraph at 25 rpm is a 2.4 s floor that concurrency cannot go below. The measured 2× gain
will persist only on hosts with **no** stored row (e.g. `abc.net.au`, which has none). Expect
aggregate throughput to land *below* today's 306 KB/s baseline on the ranked-15 set. That is the
accepted trade, not a regression to investigate.

### ⚠️ CYCLE 14 / STEP 14A — stored rate-limit floor IMPLEMENTED + unit-verified; live enforcement NOT yet confirmed. 14B NOT DONE.

**Shipped (owner decision #2 — "wire them in, be more polite, accept slower"):**
- `DomainThrottleManager.normalizeHostKey()` — lowercase + strip one leading `www.`, so the
  table's mixed key forms resolve to one row. Verified against the live DB:
  `www.telegraph.co.uk` → `telegraph.co.uk` → **2400 ms** floor (a row an exact-string lookup
  missed); `www.abc.net.au` → genuinely **no row** → no floor.
- `DomainThrottleManager.storedRowToFloorMs()` — explicit `crawl_delay_seconds` wins over rpm,
  then `safe_rpm` → `learned_rpm`.
- `_effectiveFloor()` — robots and stored floors **combine by `max()`**. Owner asked to be *more
  polite*, so combining can only slow us; it satisfies "robots is an absolute floor" in the
  direction that matters (never faster than robots) while also honouring a stricter stored limit.
- `storedRateLimitProvider` injected at `CrawlerServiceWiring.js:295`; consulted **once per host**,
  cached, and **any failure leaves pacing exactly as before** (the safe failure mode).
- **14 new tests, all passing** (25 total in the file, 11 pre-existing still green): key
  normalisation, single-`www.` stripping, row→floor conversion, precedence in both directions,
  no-row, no-provider, throwing provider, once-per-host.

**Bug found by live verification that unit tests could not catch:** I assumed
`crawler.dbAdapter.db` was a better-sqlite3 handle. It is a **NewsDatabaseFacade** whose own `.db`
is the raw handle. The provider silently returned `null` and **no floor was ever applied** — the
first live run showed Telegraph at 174 fetches/360 s, above the 150 a 2.4 s floor permits. Fixed by
*resolving* the handle (`a.db.db` → `a.db` → `a`, first with `.prepare`) instead of guessing.

**Live enforcement remains UNCONFIRMED.** The re-run was inconclusive: Telegraph — the only tested
host where the floor would bind — is **depleted** (24 fetches then `completed`, same exhaustion as
cycle 13), far below the 150-fetch threshold, so the run cannot distinguish "floor applied" from
"no URLs left". ABC (no stored row, the control) behaved normally at 1.86 s.
**Do not record this as working until confirmed.**

**Cheapest confirmation next cycle (deterministic, no crawl):** assert the provider resolves a
`.prepare`-capable handle from a real `createCrawlerDb(...)` adapter. Then, for an end-to-end check,
use a host with a stored preset that is **not** depleted (`bbc.com` 30 rpm → 2000 ms, or
`aljazeera.com` 40 rpm → 1500 ms) and assert its mean gap ≥ the floor.

**STEP 14B (clean counterbalanced concurrency re-run) was NOT done** — the 14A verification loop
consumed the cycle. The confounded cycle-13 total therefore still stands uncorrected, and the only
trustworthy concurrency evidence remains abc.net.au's 2.03× with 0 × 429.

### ✅ CYCLE 15 / STEP 15 — stored rate-limit floor **CONFIRMED WORKING** (deterministically, no crawl). 14B still not done.

**The full production chain is now proven by test:** a real `createCrawlerDb(...)` adapter →
handle resolved → row found → floor computed → the **real `DomainLimiter`** → **an actual 2400 ms
wait** between consecutive fetches. **28 + 12 = 40 tests green.**

**The fix that made it testable:** the provider was extracted from `CrawlerServiceWiring` into
`src/core/crawler/storedRateLimitProvider.js`. Cycle 14's version lived inline and was a silent
no-op *past 14 green tests*, because every one of those tests injected a **fake** provider and none
ever touched a real adapter. Testing a copy of the logic would have guarded nothing.
`resolveSqliteHandle()` now **probes** for a callable `prepare` across
`adapter.db.db → adapter.db → adapter` instead of asserting a path.

Key regression guards added:
- `resolveSqliteHandle` returns **null** for a NewsDatabase-shaped wrapper with no `prepare` —
  the exact cycle-14 failure, now a failing-test-if-reintroduced.
- **A no-row host does not wait at all** — locks in cycle 13's finding that `limiter.js:50-53`
  early-returns with zero delay, which is *why* `rpm: 30` was inert.
- Robots still wins when stricter (4000 ms robots beats a 1000 ms stored row).
- Safe failure mode: null adapter / non-queryable adapter / throwing provider all → no floor.

**Honest limitation — and a finding the owner should have.** A *live* end-to-end demonstration is
**structurally impossible on current hosts**: for the floor to be observable a host must naturally
fetch FASTER than its preset, and none of the non-depleted ones do —
BBC 5.3 s natural vs 2.0 s floor, Al Jazeera 4.2 s vs 1.5 s, Independent 19.2 s vs 2.0 s. Telegraph
(1.75 s natural vs 2.4 s floor) was the only host it would ever have slowed, and it is depleted.
**⇒ Decision #2 is correctly implemented but will rarely BIND in practice**; the expected aggregate
throughput drop is therefore close to zero on today's hosts, not the meaningful slowdown forecast in
cycle 14. The politeness guarantee is now real and enforced whenever a host *is* fast enough to
need it.

**STEP 14B (trustworthy concurrency number) STILL NOT DONE.** Cheapest sound design for next cycle,
which removes the order confound entirely: **one single run, four hosts, split arms** — two hosts
launched at `concurrency=1` and two at `concurrency=4` *simultaneously*, so neither arm can deplete
the other's hosts and both see identical network conditions. Pair hosts by natural speed, normalise
by ACTIVE time, assert jobs still `running` at the window's end, and report 429s per arm.

### ⚠️ CYCLE 16 / STEP 16 — split-arm trial ran cleanly but the concurrency number is **NOT MET**. Threshold passed on the aggregate; the rows refute it.

**The design worked** — simultaneous launch on disjoint hosts removed cycle 13's order/depletion
confound, all 4 jobs were **still running at the window's end** (informativeness assertion passed),
and **429s were 0 in both arms**. Hosts were pre-screened so the cycle-15 stored floor could not bind
even at 4× (`natural_gap / 4 >> floor`), which would otherwise have suppressed the effect measured.

| arm | host | fetches | active | gap | rate | rtt |
|---|---|---|---|---|---|---|
| A conc=1 | www.thehindu.com | 293 | 482 s | 1.65 s | 0.608/s | 0.52 s |
| A conc=1 | www.abc.net.au | 134 | 482 s | 3.62 s | 0.278/s | 1.21 s |
| B conc=4 | www.npr.org | 455 | 460 s | 1.01 s | 0.989/s | 2.19 s |
| B conc=4 | **www.smh.com.au** | **17** | **45 s** | 2.81 s | 0.378/s | 2.93 s |

Aggregate: **1.54×** (A 0.886/s → B 1.367/s), above the pre-registered 1.3× bar.

**Why it is not trustworthy — three reasons, any one sufficient:**
1. **smh.com.au effectively failed**: 17 fetches, active only 45 s of a 480 s window. Arm B is
   *npr alone*, yet smh's 45-second sliver carries equal weight in the arm sum.
   **Excluding it, the ratio is 1.12× — BELOW the falsifier.** The headline rests on a dead host.
2. **The matched pairing broke.** With smh gone it is a cross-host comparison (npr vs
   abc+thehindu), not a controlled one — host identity is no longer held constant.
3. **The 24 h "natural gap" baselines used for pairing are unreliable**: thehindu ran at 1.65 s
   against a 5.7 s baseline *at concurrency 1*, because a 24 h average blends multi-host contention
   and idle periods. Pairing on that statistic was unsound.

**Consistent-with-treatment signal (not proof):** rtt rose in arm B (npr 2.19 s, smh 2.93 s) exactly
as it did in cycle 13's abc (0.76 → 1.75 s) — server-side queuing under concurrency. Suggestive, but
rtt also varies by host, so it cannot carry the conclusion.

**⇒ ROOT CAUSE of two failed attempts: per-host supply/failure variance swamps the treatment effect
in any between-host design at this sample size.** Cycle 13 failed to depletion, cycle 16 to a host
dying. Stop trying to match hosts.

**REDO — within-host ABA crossover (controls host identity completely):** take ONE proven-reliable
high-volume host (npr and thehindu both sustained 290–455 fetches here) and run
`conc=1 → conc=4 → conc=1` in three consecutive ~4-min blocks in a single job stream. The A-B-A
shape separates the treatment effect from time drift: a real effect shows B elevated against BOTH
A blocks, while drift shows a monotonic trend. **Declare inclusion rules in advance** — a block
counts only with ≥50 fetches and ≥240 s active, else the run is reported underpowered rather than
averaged. That would have excluded smh automatically instead of letting it drive the headline.

### ⚠️ CYCLE 17 / STEP 17 — ABA crossover **NOT MET**. But it measured the NOISE FLOOR, which explains all three failures: **n=1 per condition was never enough.**

| block | conc | fetches | active | rate | still running | 429 |
|---|---|---|---|---|---|---|
| A1 | 1 | 135 | 234 s | 0.577/s | yes | 0 |
| **B** | **4** | **2** | **15 s** | — | **no (died)** | 0 |
| A3 | 1 | 218 | 237 s | 0.920/s | yes | 0 |

**MY DESIGN ERROR: the inclusion rule was arithmetically unsatisfiable.** I required
`≥240 s active` inside a **240 s** window, but "active" is first-fetch→last-fetch, necessarily
shorter than the window (startup latency precedes the first fetch). **No block could ever pass**;
A1 and A3 missed by 6 s and 3 s. A gate that cannot be satisfied is not a gate.
**Fix: express inclusion as a FRACTION of the window** (e.g. ≥50 fetches AND ≥60 % of window
active), never as an absolute equal to it.

**Block B collapsed** to 2 fetches and terminated — the third host to die under test. **Not
depletion:** A3 ran immediately afterwards on the same host and was the *strongest* block, so npr
had plenty of work. Cause unknown; the treatment condition simply produced no data.

**⇒ THE ACTUAL FINDING — the noise floor. A1 and A3 are the SAME host at the SAME concurrency,
12 minutes apart, and differ by 1.6× (0.577 vs 0.920 fetches/s).** That same-condition variance is
**larger than the 1.3× effect being hunted**. Every concurrency attempt so far has been
structurally underpowered:

- cycle 13 — attributed failure to depletion
- cycle 16 — attributed failure to a dead host and a broken sample
- cycle 17 — attributed failure to an impossible gate and a dead block

**All three were symptoms; `n = 1 per condition` was the disease.** A single block per condition
cannot resolve a ~1.5× effect against ~1.6× run-to-run noise, no matter how the arms are arranged.

**REDO — replicated alternation, powered against the measured noise:** `A B A B A B` (3 replicates
per condition) on npr, **3-minute blocks**, comparing the *means* of each condition with their
spread reported. Inclusion as a fraction (≥50 fetches AND ≥60 % of window active); a condition
counts only with **≥2 surviving blocks**, else report underpowered. With σ≈1.6× and n=3 the design
can resolve roughly a ≥1.5× effect — state that limit up front and do not claim finer resolution.
**If it still fails, stop measuring concurrency live**: the honest alternative is a controlled
offline harness (fixed local fixture server, no third-party variance) where the effect can be
isolated from network and publisher behaviour entirely.

**Zero 429s across all blocks** — politeness conditions have held in every cycle to date.

**OWNER DECISION 2026-07-26 #3 (in chat), after being shown that live measurement is defeated by a
1.6× noise floor: APPROVED — "build an offline fixture harness."** Stop measuring concurrency
against live publishers. Build a local fixture server with controllable latency and page size, so
the concurrency effect can be isolated from network and publisher variance and re-tested at will.

**Known trap for this exact build (from `spawnsync-same-process-server-deadlock`): `spawnSync`
blocks the WHOLE event loop, so a fixture HTTP server in the same process can NEVER service the
crawler child's request — it hangs forever. Use async `spawn()` for any integration test with a
local server.** The existing harnesses (cycle16.js, cycle17-block.js) already use async `spawn` for
this reason; reuse that pattern.

**Validate the instrument before trusting it:** measure the fixture's own noise floor first by
running the SAME condition twice. On a local fixture it should be a few percent, versus 1.6× live.
If the fixture's noise is not far below the effect size, the harness is not fit for purpose and
that must be reported rather than worked around.

### ✅ CYCLE 18 / STEP 18 — offline fixture harness BUILT and VALIDATED. **Concurrency 4 = 3.23×, noise floor 5.6%.** The number owed since cycle 13.

**Instrument:** `tools/perf/fixture-server.js` (deterministic local site, controllable latency +
page size, counts its own requests and tracks `maxInFlight`) and `tools/perf/concurrency-bench.js`
(interleaved replicates, reports the noise floor before any comparison).

| condition | rate | spread | maxInFlight | reqs |
|---|---|---|---|---|
| concurrency 1 | 5.53 req/s | 1.6% | 1 | 61 |
| concurrency 4 | **17.85 req/s** | 5.6% | 4 | 64 |

**Effect 3.23×; instrument noise 5.6% vs 60% live (cycle 17) — ~11× quieter, effect exceeds noise
by 40×.** Replicates: 5.50/5.50/5.59 and 17.89/17.33/18.32. Drop-one passes trivially — worst-case
pairing still gives 17.33/5.59 = **3.10×**. `maxInFlight` of 1 vs 4 **proves the setting took
effect**, a check no live cycle could perform.

**A serious bug the fixture caught immediately — and that every live cycle would have hidden:**
`src/crawl.js` hard-codes its config path (`src/crawl.js:34`) and merges argv as
`[...configArgv, ...directArgv]` with the config's `startUrl` first (`configArgs.js:237`), so the
first positional wins and **a start URL passed on the command line is silently IGNORED**. The first
benchmark run therefore crawled **https://www.theguardian.com instead of the fixture**. The
fixture's own request counter (0 requests) exposed it in one run. Fixed by
`tools/perf/fixture-crawl-runner.js`, which constructs `NewsCrawler` directly — a benchmark must
not depend on ambient config.

**Bonus quantification, relevant to the open “unexplained slow hosts” item:** at concurrency 1 the
rate is 5.53/s = **181 ms per page** against 120 ms of injected latency, so **per-page post-fetch
processing costs ~61 ms**. At concurrency 4 the rate is 17.85/s = 56 ms/page, i.e. **81 % of the
ideal 4× (22.1/s)** — the shortfall is that per-page processing partly serialises. That is why the
gain is 3.23× and not 4×.

**HONEST SCOPE — 3.23× is an UPPER BOUND, not the live gain.** The fixture has no robots
crawl-delay, no stored politeness floor, and uniform page weight. Real hosts will give less:
any host whose politeness floor exceeds its natural gap caps the benefit entirely (cycle 15 showed
most preset hosts already run slower than their floors). The fixture proves the MECHANISM and its
ceiling; it does not predict a production number.

**⇒ PROPOSED (GATED, needs owner approval): make concurrency 3–4 the default.** Evidence: 3.23× on
the fixture, ~2× observed live on abc.net.au (cycle 13), and **zero 429s across every cycle of this
workstream**. Robots crawl-delay remains an absolute floor and 429 backoff is untouched, so
per-host politeness is unaffected — concurrency only overlaps waiting, it does not shorten any
configured delay.

**OWNER DECISION 2026-07-26 #4 (in chat): "Not yet — validate live first."** Do NOT change the
engine default on fixture evidence alone. Run one live crawl at the proposed concurrency across
several hosts, watching 429s, before proposing the default change again.

**Design note for that validation: target 429 SAFETY, not the speed effect.** The 60% live noise
floor (cycle 17) makes a live speed measurement futile and the fixture already settled the effect
(3.23× upper bound). But **429s are a COUNT, not a rate** — they are entirely unaffected by the
run-to-run variance that defeated every rate comparison. So a live run CAN decisively answer "is
this polite enough?" even though it cannot answer "how much faster?". Report 429s per host, plus
any `Retry-After` headers and backoff events, against the zero-429 baseline this workstream has
maintained across every cycle.

### ✅ CYCLE 19 / STEP 19 — LIVE 429-SAFETY validation **CLEAN**. Concurrency 3 measured at **2.88×** and live-validated at **zero 429s over 3,419 responses**.

**Safety (live, 7 hosts, concurrency 3, 16 min):**

| host | total | 200 | 429 | 403 | 503 | other |
|---|---|---|---|---|---|---|
| www.abc.net.au | 557 | 555 | 0 | 0 | 0 | 304×2 |
| www.thehindu.com | 911 | 864 | 0 | 0 | 0 | 304×5, 404×42 |
| www.channelnewsasia.com | 97 | 95 | 0 | 0 | 0 | 404×2 |
| www.npr.org | 719 | 685 | 0 | 0 | 0 | 404×34 |
| www.irishtimes.com | 247 | 238 | 0 | 0 | 0 | 404×9 |
| www.cbc.ca | 459 | 370 | 0 | 0 | 0 | 404×89 |
| www.aljazeera.com | 429 | 426 | 0 | 0 | 0 | 404×3 |
| **TOTAL** | **3,419** | | **0** | **0** | **0** | |

Hosts deliberately mixed preset-floor (npr, irishtimes, cbc, aljazeera) and no-floor
(abc, thehindu, cna). The abort rule (any host reaching 3× 429/403/503 ⇒ kill workers
immediately) was **enforced in code**, not merely reported, because this run put extra load on
real publishers. It never tripped.

**Speed, now measured at the SAME value that was safety-validated** — the earlier proposal quoted
3.23× (concurrency 4) alongside safety data for concurrency 3, which was incoherent:

| setting | fixture rate | vs conc 1 | noise | maxInFlight |
|---|---|---|---|---|
| concurrency 1 | 5.48 req/s | — | 4.7 % | 1 |
| **concurrency 3** | **15.81 req/s** | **2.88×** | 0.9 % | 3 |
| concurrency 4 | 17.85 req/s | 3.23× | 5.6 % | 4 |

**Going 3 → 4 buys only +12 % while raising per-host load by 33 %** — which is the argument for
defaulting to 3 rather than 4.

**Incidental, not chased: `www.cbc.ca` returned 404 for 89 of 459 requests (19 %)**, far above the
other hosts. That is a link-construction/normalisation smell, not a politeness signal — worth a
separate look.

**⇒ RE-PROPOSED (still owner-gated): default concurrency 3.** Evidence: 2.88× measured on the
fixture with the setting verified applied (`maxInFlight=3`), zero 429/403/503 across 3,419 live
responses on 7 mixed hosts, and zero 429s sustained across every cycle of this workstream. Robots
crawl-delay remains an absolute floor and 429 backoff is untouched — concurrency overlaps waiting,
it never shortens a configured delay.

**OWNER DECISION 2026-07-26 #5 (in chat): APPROVED — default concurrency 3. SHIPPED.**
`NewsCrawler.js` `concurrency` default changed **1 → 3**, with the evidence recorded at the change
site (2.88× fixture, zero 429/403/503 over 3,419 live responses, and why 3 rather than 4).
A guard test asserts the value so a refactor cannot silently revert it — reverting to 1 gives back
a measured ~3× of crawl throughput. 41 tests green.

**Pre-existing failure, NOT caused by this change:**
`src/core/crawler/gazetteer/__tests__/concurrency.behavior.test.js` fails at module load inside
jsdom (`Tests: 0 total`). Verified by stashing the change and re-running — it fails identically
without it. Unrelated to concurrency; worth a separate look.

### ✅ CYCLE 20 / STEP 20 — post-fetch cost DECOMPOSED. **Parse dominates (~26 ms of ~35 ms) and scales hard with page weight.** DB share marginal, not established.

Tool: `tools/perf/postfetch-cost.js` (offline, 3 interleaved arms x 3 reps, no publisher load).
Method: latency held at 5 ms so per-page PROCESSING dominates; `enableDb` on/off isolates
persistence; page size 15 KB vs 120 KB isolates parse scaling.

| arm | per-page | spread |
|---|---|---|
| DB on, normal (15 KB) | 39.8 ms | 14.3 % |
| DB off, normal | 30.6 ms | 12.3 % |
| DB on, large (120 KB) | 62.8 ms | 21.9 % |

**RESOLVABLE — parse scales with page weight:** 8× the bytes adds **+23.1 ms/page**, 2.7× the noise
band, raising per-page cost **58 %**.

**NOT established — the DB share.** 9.2 ms (23 %) against a ±8.7 ms noise band. The script's own
check printed RESOLVABLE at a ratio of 1.06×, which is **too thin to accept**; recorded as
*suggestive only*. This instrument is far noisier (12–22 %) than the concurrency bench (0.9–5.6 %)
because 40-page arms make per-page timing much more sensitive — more reps would settle it.

**⇒ Of the ~35 ms of non-latency work per page, roughly 26 ms is parse + link-extraction** —
single-threaded CPU work. **That is precisely why concurrency plateaus at 81 % of ideal** (cycle 18):
extra parallel fetches cannot overlap CPU that is already saturating the thread. Note ledger #46
already collapsed a triple `cheerio.load`, so the easy parse win is spent.

**Connects two earlier findings: heavy pages cost TWICE.** Cycle 10 measured CNN at ~3.5 MB/page
versus BBC at 271 KB (>20× spread); that weight now shows up in *parse time* as well as bandwidth.

**Next lever, if throughput work continues:** move parsing off the crawl thread (worker threads —
the compression pool in cycle 73 Phase B is a precedent in this codebase), which would let
concurrency scale past 81 %. Measure with `postfetch-cost.js` before and after. Cheaper alternative
worth testing first: skip full DOM parse for pages already classified as non-article.

### CYCLE 21 / STEP 21 - DB share CONFIRMED (6.3 ms/page); cycle 20's parse-scaling headline RETRACTED (23.1 ms was a 5.6x overestimate; true value 4.1 ms).

Re-ran `tools/perf/postfetch-cost.js` at **5 reps x 100 pages** (was 3 x 40), and replaced the
crude worst-arm-spread heuristic with a proper **2x combined standard-error** test printed beside
every claim.

| arm | cycle 20 (3x40) | **cycle 21 (5x100)** | spread |
|---|---|---|---|
| DB on, normal (15 KB) | 39.8 ms | **31.4 ms** | 4.6 % |
| DB off, normal | 30.6 ms | **25.0 ms** | 8.2 % |
| DB on, large (120 KB) | 62.8 ms | **35.4 ms** | 3.3 % |

- **PERSISTENCE: 6.3 ms/page (20 %), +/-0.9 ms, margin 6.98x - RESOLVABLE.** Cycle 20 rejected this
  at 9.2 ms as within noise. Rejecting it *on that evidence* was correct; the effect is real but
  **smaller** than the noisy estimate suggested.
- **PARSE GROWTH: 4.1 ms/page per 8x page size, +/-0.7 ms, margin 6.06x - resolvable but tiny.**
  Cycle 20 reported **23.1 ms**. **That was a 5.6x overestimate and is RETRACTED**, along with the
  claim that heavy pages cost twice. Page weight barely affects processing cost.

**Corrected decomposition of ~26 ms processing per page:**

| component | cost | note |
|---|---|---|
| fixed per-page work (parse + link-extract + overhead) | **~20 ms** | the dominant cost |
| persistence (DB write) | 6.3 ms | real, confirmed |
| extra parse for 8x page bytes | 4.1 ms | minor |

**=> THE LEVER CHANGED.** Cycle 20 pointed at page-weight-driven parse cost; that target is now
largely gone. The real target is **~20 ms of FIXED per-page work** paid regardless of page size,
plus a genuine 6.3 ms persistence share. Optimising for heavy pages would have been close to
pointless - which is exactly why the cheap confirmatory step was run BEFORE the build step.

**Absolute costs also fell** (39.8 -> 31.4 ms for the same arm): 40-page runs amortise crawler
startup poorly, inflating every cycle-20 per-page figure.

**Method note worth keeping:** cycle 20 printed its noise band honestly and the number was still
wrong by 5.6x. **More replicates did not merely narrow the band - they MOVED the point estimate.**
A difference can clear a significance check and still be badly wrong if the instrument is
underpowered. Require minimum viable POWER, not just a stated band.

### CYCLE 22 / STEP 22 - per-page CPU PROFILED (partial attribution). **37% is IDLE, not CPU** - cycle 21's "single-threaded CPU work" framing is too strong.

Tool: `tools/perf/profile-crawl.js` - profiles at TWO page counts (100 vs 400) and diffs
per-function self time, so module-loading startup is identical in both runs and cancels out.

**Total attributed: 27.4 ms/page**, independently agreeing with cycle 21's ~26 ms measured by
timing. **Two different methods converging is the strongest validation in this workstream so far.**

| finding | cost/page | note |
|---|---|---|
| **`(idle)` @ native** | **10.16 ms (37.1%)** | NOT CPU - the process is not executing JS |
| filesystem stat (`existsSync` 0.85 + `internalModuleStat` 0.48 + `stat` 0.38) | **~1.7 ms (6%)** | a crawl should not stat the filesystem per page - real smell |
| better-sqlite3 wrappers (`exec` 1.41 + `prepare` 0.46) | ~1.9 ms | higher than the DB bucket's 0.81 ms suggested |
| jsdom DOM construction (`createWindow`, `installInterfaces`, `SymbolTree`, `_stateComment`) | present in hot path | I had assumed cheerio; jsdom is doing per-page DOM work |
| cheerio/parse5 | 0.08 ms | negligible - consistent with cycle 21 retracting the parse-scaling claim |

**=> REFRAMING: over a third of per-page time is WAITING, not computing.** That is exactly what
concurrency overlaps, and it explains why concurrency 3 delivers 2.88x. Cycle 21's claim that the
~20 ms is single-threaded CPU that "cannot be overlapped" is **weakened** - a substantial part can be.

**HONEST LIMITATION: 42.5% landed in "other app code".** The bucket classifier is too coarse to be
actionable on the largest slice, and it misattributed DB work (the `wrappers.js` frames are
better-sqlite3 but did not match the DB pattern). The **top-18 function list is the reliable
deliverable**; the bucket table should not be trusted below its top few rows.

**Costed proposal (small but clean): eliminate the per-page filesystem stat calls, ~1.7 ms/page
(6%).** `existsSync` + `internalModuleStat` + `stat` firing per page suggests a lazy `require` or an
existence check inside the page loop. Pre-registered expectation: **-1.5 to -1.7 ms/page**, verified
with `postfetch-cost.js` at >=5 reps x >=100 pages plus a stability check.

**Next refinement if attribution is pursued:** group the unattributed 42.5% by SOURCE FILE within
`src/` rather than by keyword bucket - that will name the owning module directly instead of guessing
from function names.

### CYCLE 23 / STEP 23 - attribution COMPLETE. Cycle 22's "42.5% other app code" was just unmatched keywords; by-file names all of it.

Extended `tools/perf/profile-crawl.js` with **by-source-file** and **by-area** rollups.
Result: **53.0% attributed to named source files (13.18 ms/page), 47% native/runtime.** Nothing is
now unexplained - cycle 22's opaque bucket was a classifier failure, not unknown code.

| component | ms/page | share |
|---|---|---|
| `(idle)` | 8.93 | 35.9% |
| **DB CPU** - `wrappers.js` 1.79 + `legacy-SQLiteNewsDatabase.js` 0.69 + `legacy-ArticleOperations.js` 0.18 | **~2.7** | ~11% |
| **jsdom DOM** - Window 0.57, utils 0.52, nwsapi 0.32, interfaces 0.23, Element 0.18, SymbolTree 0.18, HTMLCollection 0.16, CSSStyleDeclaration 0.14 | **~2.3** | ~9% |
| **filesystem stat** - `existsSync` 1.02 + `stat` 0.31 | **~1.3** | ~5% |
| GC | 0.60 | 2.4% |
| **Readability.js** | 0.30 | 1.2% |
| cheerio/parse5 | 0.13 | 0.5% |

**FINDING 1 - the DB reconciles across two methods, and it explains part of the idle.**
Cycle 21 measured persistence at **6.3 ms wall-time**; this profile finds only **~2.7 ms of CPU**.
Not a contradiction: the ~3.6 ms difference is **waiting on synchronous SQLite disk I/O**, which a
CPU profile records as idle. **So a substantial share of the 36% "idle" is the DB, not the network.**
That also means the DB is a bigger real target than its CPU share suggests.

**FINDING 2 - the cheerio assumption was WRONG, and it would have wasted an optimisation.**
The article path runs **jsdom** (~2.3 ms/page of DOM construction) plus **Mozilla Readability**
(0.30 ms). **cheerio is 0.13 ms - essentially absent from this path.** Cycle 20's proposed
"parse optimisation" and ledger #46's cheerio work target a library that barely features here.
Confirm the library before optimising it.

**Instrument note:** the total came out **24.9 ms/page this run vs 27.4 the previous run (~9%
run-to-run variation)**, so these shares carry roughly +/-10% - adequate for ranking levers, not for
claiming small differences.

**Ranked levers, now evidence-based:**
1. **DB ~6.3 ms wall (2.7 CPU + ~3.6 I/O wait)** - the largest actionable item. Batching writes or
   moving persistence off the page loop would attack both halves.
2. **jsdom ~2.3 ms** - only worth touching if Readability can work on a lighter DOM; it needs a real
   one, so this is likely structural.
3. **filesystem stat ~1.3 ms** - smallest and cleanest; a crawl should not stat per page.

### CYCLE 24 / STEP 24 - `upsertUrl` rewritten (correctness VERIFIED, perf UNVERIFIED). Machine drifted ~2.5x mid-cycle; the ncdb suite could not be run to completion.

**The defect found (real, and worse than "statements are not cached"):** `upsertUrl` called
`db.exec()` on a **4-statement STRING-INTERPOLATED blob**, then separately `db.prepare()`d a 5th
statement - **on every call**. `exec` cannot use prepared statements, so SQLite re-parsed and
re-compiled all of it per URL, and the same row was looked up by string key five times.
Profiled cost (cycle 23): `exec` 1.28-1.79 ms/page + `prepare` 0.51 ms/page.

**The change:** one cached `INSERT ... ON CONFLICT(url) DO UPDATE` with bound parameters
(`url TEXT NOT NULL UNIQUE` confirmed, `sqlite_autoindex_urls_1`). Also retires the hand-rolled
`'` escaping, which was embedding **crawled third-party strings** directly into SQL text - a
robustness improvement independent of speed.

**CORRECTNESS VERIFIED - 10/10 direct semantics tests**, including the traps that would have
silently corrupted data: `created_at` unchanged on conflict; `last_seen_at` refreshed;
`canonical_url`/`analysis` preserved when the incoming value is null (COALESCE); `host` preserved
when the URL will not parse (matching the old try/catch skip); single-quote URLs stored verbatim.

**PERFORMANCE UNVERIFIED - and the before/after comparison is INVALID.** The `db-off-normal` arm,
which my change cannot affect because persistence is switched off in it, **rose 25.0 -> 43.6 ms/page
(+74%)**, and total per-page went **24.9 -> 63.9 ms** within this cycle. **The machine slowed ~2.5x
between measurements**, dwarfing the ~2 ms effect being hunted. Reporting a delta against cycle 21's
absolutes would have been reporting machine drift as a result.

**Frame check also inconclusive for the same reason - but it did explain what survives:**
`exec @ wrappers.js` is still present because **`upsertDomain` uses the IDENTICAL interpolated-blob
anti-pattern** and was not touched; `prepare @ wrappers.js` survives because ~62 other call sites in
that file prepare ad hoc. Both are concrete, code-verifiable observations rather than speculation.

**GAP TO CLOSE: the ncdb vitest suite could not be run to completion** (Tinypool worker crash, then
a 10-minute timeout on the slowed machine), so the shared-module regression check is INCOMPLETE.
The change is backed by direct semantics tests, not by the repo's own suite. **Re-run
`npm test` in news-crawler-db when the machine is healthy before relying on this.**

**Correct verification design for next time (immune to machine drift):** measure OLD and NEW in the
SAME session - stash the change, rebuild, measure, restore, rebuild, measure - rather than comparing
to a baseline captured on a different day. Absolute cross-session numbers are not comparable on this
machine.

### CYCLE 25 / STEP 25 - ncdb suite RESOLVED and GREEN (918 passed, 0 failed). Perf verdict: **VOID** - the machine cannot currently resolve a ~2 ms effect.

**1. The "Tinypool crash / 10-minute timeout" was never a crash.** `package.json` has
`test: "vitest"` with no `run` flag, so plain `npm test` starts **WATCH MODE and never exits** - the
timeout was the watcher idling. With `npx vitest run` the suite completes in **145 s**.
**Cycle 24's "shared-module regression check INCOMPLETE" is therefore closed.**

**2. Suite is fully green: 918 passed / 0 failed / 2 skipped (156 files).** The single failure found
was **NOT from cycle 24's `upsertUrl` change** - it was my own debt from cycle 86: `seedBootstrapData`
gained a `normalized` column but this test fixture's `place_names` schema was never updated
(`table place_names has no column named normalized`). Fixed by adding the column, mirroring the
fuller fixture further down the same file. **`upsertUrl` caused zero test failures.**

**3. Self-inflicted trap, caught immediately:** my first version of that fixture comment wrapped
*normalized* in **backticks**, which terminated the enclosing JS template literal and made esbuild
parse the SQL as JavaScript (`Expected ")" but found "normalized"`). Same class as the
`crawl-status-client` template trap already on record. Comment rewritten backtick-free, with a note
in the fixture saying why.

**4. PERF VERDICT: VOID, on evidence.** Within a SINGLE run at identical configuration, the
`db-on-normal` arm produced **82.0 / 50.1 / 49.8 ms/page - a 64% swing between replicates**.
A machine with that much within-run instability cannot resolve the ~2 ms effect being tested, so the
OLD half was not run: it would have cost ~10 minutes to produce a number that had to be discarded.
**The upsertUrl change therefore remains correctness-verified (10/10 semantics + 918-test suite
green) and perf-unproven.** Re-measure when the machine is quiet, using the same-session
stash/rebuild/measure/restore design, and read the `db-off-normal` control arm first.

**Repo state verified after the cycle:** no stash entries, both intended files modified, `dist` in
sync with `src` (3 occurrences of the cached statement in each).

### CYCLE 26 / STEP 26 - FIXED: `src/crawl.js` silently ignored a command-line start URL. Verified end-to-end with the fixture that originally exposed it.

**The bug:** flags followed "last match wins", but the start URL is a POSITIONAL. The merge was
`[...configArgv, ...directArgv]` with `configArgv[0] = config.startUrl` (`configArgs.js`), and the
normalizer takes the FIRST positional - so whenever `crawl.js.config.json` set a `startUrl`, the URL
typed on the command line was **silently discarded**. Measured cycle 18: a benchmark aimed at a local
fixture crawled **https://www.theguardian.com** instead, with no warning; only the fixture's own
request counter reading **0** revealed it.

**The fix:** `findExplicitStartUrl(directArgv)` detects a command-line start URL and the merge then
drops the config's. It is deliberately conservative - the URL must be a bare `http(s)` token that is
NOT the value of a space-separated flag (`--cached-seed https://...` passes a URL *to a flag*), and
when ambiguous it declines and preserves the old behaviour rather than hijacking the crawl target.
The override is also **announced** rather than silent:
`Start URL from command line: <url> (overrides <config url> from config)`.

**Verified end-to-end** with the same fixture that caught the original bug:
`Starting crawler for 127.0.0.1` (previously `www.theguardian.com`), fixture **requests=2**
(previously **0**), and the override line printed.

**Tests: 14 new, all passing** - CLI URL wins and config start URL is dropped; config FLAGS still
apply when only the URL is overridden; config URL retained when the CLI supplies none; no false
"override" report when both URLs match; and four `findExplicitStartUrl` cases including the
flag-value case it must decline. CLI suite: **106 passed**.

**Pre-existing failure, NOT mine (verified by stash-and-rerun):** `configArgs > returns direct argv
when provided` asserts `readFile` is never called, but `resolveCliArguments` always *attempts* the
config load and falls back on failure. The assertion encodes a stale expectation; the behaviour is
correct. Left alone rather than edited to pass, since changing another author's assertion needs
their intent. (One CLI suite also fails at file level on the known jsdom module-load issue.)

### CYCLE 27 / STEP 27 - cbc.ca 404s: shape DIAGNOSED, two hypotheses KILLED, mechanism NOT yet found. Partial result, reported as such.

**Shape (decisive):** every cbc.ca 404 is a `/en/...` CORPORATE path - `/en/ombudsman/`,
`/en/media-centre/`, `/en/help-centre/`, `/en/vision/governance/...`,
`/en/impact-and-accountability/...`, `/en/your-public-broadcaster/`. Every 200 is a
`/news/canada/...` article path. Recent PK window: **200 x 2,236 vs 404 x 178**.

**Those exact paths exist on a DIFFERENT host:** `cbc.radio-canada.ca/en/ombudsman/`,
`/en/working-with-us/jobs/`, `/en/vision/governance/...` - CBC's corporate domain. The DB holds
only 26 `cbc.radio-canada.ca` URLs against 84 re-homed `www.cbc.ca/en/...` ones.

**HYPOTHESIS 1 KILLED - our normaliser is not rewriting the host.** `urlPolicy.js:40` is
`new URL(rawUrl, this.baseUrl || undefined)`, and `new URL()` **ignores the base when the input is
absolute**. Resolution is correct by construction.

**HYPOTHESIS 2 KILLED - the homepage is not the source.** Fetched `https://www.cbc.ca/` directly:
**7** absolute `href="https://cbc.radio-canada.ca/en/..."` links, **0** root-relative `href="/en/..."`,
and **no `<base>` tag**. So the markup we would parse from the homepage cannot produce
`www.cbc.ca/en/...`.

**Timing:** 83 of the 84 such URLs were created **2026-07-26** - i.e. by this session's own crawls,
not legacy data.

**Context that reframes the item:** 404s are NOT a cbc peculiarity. Across the DB:
theguardian.com 2,997 · aljazeera.com 1,904 · dw.com 862 · bbc.com 350 · cnn.com 324. The cbc case
was simply a clean, legible instance.

**REMAINING CANDIDATES for the emitting path** (none yet tested): sitemap ingestion; a NON-homepage
CBC page that does use root-relative `/en/` hrefs; or a URL-guessing / hub-construction feature
(this repo has `guess-place-hubs`-style tooling that synthesises URLs by pattern, which produces
404s by design).

**Cheapest next check:** grep stored HTML of other fetched `www.cbc.ca` pages for `href="/en/`, and
check whether any `/en/` URL arrived via sitemap rather than link extraction. If neither, look at
URL synthesis.

### CYCLE 28 / STEP 28 - 404 class QUANTIFIED (modest: ~3%) and mechanism narrowed to ONE candidate. Also re-verified the politeness claims.

**THE CLASS IS SMALL - measure-first says do not build.** Today: **5.69% of fetches were non-200**
(404 **3.16%** · 304 1.14% · 403 0.53% · 402 0.51% · 406 0.35%) over 15,621 fetches. Across the last
~183k fetches: 200 **92.67%**, 404 3.10%. **Suppressing ALL 404s recovers ~3% of fetch budget** -
real, but far below the 2.88x concurrency win already shipped. This is not a top lever.

**Mechanism: three more candidates eliminated with evidence; one remains.**

| candidate | verdict |
|---|---|
| normaliser rewrites the host | **NO** - `new URL(raw, base)` ignores base for absolute inputs |
| homepage markup | **NO** - 0 root-relative `/en/` hrefs, 7 absolute, no `<base>` |
| link extraction | **NO** - `links` has **4,874,880** rows and **0** point at these URLs |
| sitemap ingestion | **NO** - `sitemap_cache` 359 rows, **0** mention `cbc.ca/en/` |
| **URL synthesis** | **REMAINING** - pattern-constructed URLs (guess-place-hubs-style) 404 by design |

**POLITENESS RE-VERIFIED (and my earlier claim holds).** The broad window showed 1,491 x 429, which
looked alarming against my repeated "zero 429s". Checked by date: **all historical** - May 2026
(672), Feb 2026 (660), Apr (151); **ZERO 429s today**. The cycle-19 claim was correctly scoped.

**403s today = 83, and NOT attributable to the concurrency change:** nytimes 68 (which carries
**863 pre-existing** 403s - a long-standing paywall block), cbchelp 9, japantimes 3, help.scmp 2,
cnn 1. All are paywall/support hosts with prior block history; the 7 hosts used for the
concurrency-3 safety validation showed zero. **The shipped default of 3 stands.**

**Recommendation: stop here on 404s.** The remaining work (find the synthesis path, suppress it)
buys ~3% and competes poorly against the open items. If pursued later, the one place to look is
URL-synthesis tooling, since every discovery path has now been excluded by direct evidence.

### CYCLE 29 / STEP 29 - instrument WARM-UP BUG found and fixed; `upsertUrl` perf question CLOSED as a NULL. Pre-registered prediction FAILED.

**(1) The "unstable machine" was largely MY INSTRUMENT.** The stability gate failed at 55.6% spread
on one arm - but only the FIRST replicate was inflated (81.3 ms vs a stable 49-51 ms across reps
1-3; reps 1-3 alone spread **4.8%**). Cycle 25 saw the identical shape (82.0, then 50.1, 49.8) and I
concluded "the machine slowed 2.5x" and voided a measurement that was fine.
**Fix: `postfetch-cost.js` now runs and DISCARDS a warm-up replicate per arm** (cold OS file cache,
cold V8, cold SQLite page cache). Gate after the fix: **4.6% / 6.5% / 3.2% - PASSES.**

**(2) `upsertUrl` OLD vs NEW, measured in ONE session with the fix in place:**

| arm | OLD | NEW | ratio |
|---|---|---|---|
| **db-off-normal (CONTROL - change cannot touch it)** | 27.9 ms | 42.7 ms | **1.53x** |
| db-on-normal | 33.2 ms | 50.8 ms | **1.53x** |
| persistence share | 5.3 ms | 8.1 ms | **1.53x** |

**Every arm scaled by exactly 1.53, including the control**, so the machine ran 1.53x slower during
the NEW half. Normalised, persistence is **16% of per-page cost in BOTH**.

**VERDICT: NO MEASURABLE DIFFERENCE. The pre-registered -1.5 to -2.5 ms/page prediction FAILED.**

**What that teaches:** statement re-compilation was **not** the bottleneck. The profile attributed
1.79 ms/page to `exec`+`prepare` self-time, but eliminating 4 statements and a per-call `prepare`
bought nothing measurable - the cost is the WRITE itself (I/O + index maintenance), not compiling
the SQL. **CPU self-time in a profile is not the same as removable wall time.**

**Disposition: KEEP the change, labelled perf-neutral.** It remains worth having on non-perf
grounds - bound parameters retire hand-rolled `'` escaping of **crawled third-party strings**, and
one cached statement is simpler than five interpolated ones - with correctness verified 10/10 plus
the ncdb suite green. But it must not be cited as a speed improvement.

**This closes the last open performance claim attached to already-shipped work.**

### CYCLE 31 / STEP 31 - OWNER-DIRECTED: ran the original ask end-to-end. 10 sites x 200 pages, concurrency 3, **0 x 429**.

Asked the owner whether crawl perf was still the right focus after 30 self-directed cycles; answer:
**"Run a real crawl and just use it."** This is the request the whole workstream started from.

| | result |
|---|---|
| pages fetched | **2,167** (HTTP 200: 2,069) |
| downloaded | **696.1 MB** |
| throughput | **495 KB/s avg over 24 min, peak 649 KB/s** at minute 15 (40% of the 1.2 MiB/s cap) |
| **429s** | **0** |
| 403s | 6 |
| hosts | all 10 fetched |

**Archive growth:** http_responses 309,415 → 311,607 (**+2,192**) · urls 1,843,973 → 1,851,549
(**+7,576 discovered**) · content_analysis 86,827 → 88,374 (**+1,547 articles analysed**).

Per host: thehindu 312 · npr 298 · cbc 289 · irishtimes 279 · globeandmail 246 · aljazeera 216 ·
abc.net.au 207 · apnews 163 · bbc 122 · cnn 13.

**NOT a controlled comparison - do not cite as a speedup.** Cycle 9 measured 375 KB/s and cycle 11's
steady state 481 KB/s, both on **15** hosts; this run averaged 495 KB/s on **10**. Different hosts,
different day, and this machine drifts by up to 1.53x between runs. The controlled figure remains
the fixture's **2.88x** (§0.1). What this run demonstrates is that the system delivers the original
ask end-to-end, politely.

**Shape note:** throughput climbed to 649 KB/s by minute 15, then declined as jobs completed - the
same drain-tail effect that invalidated cycle 20's window. The 495 KB/s average includes that tail;
peak sustained was ~576-649 KB/s across minutes 12-16.

**Incidental, relevant to §CYCLE 27-28:** `cbc.radio-canada.ca` received **6** fetches this run, so
the crawler does follow those absolute cross-host links correctly - further narrowing where the
re-homed `www.cbc.ca/en/...` 404s come from.

## 3. Owner's call — do not do unilaterally
- **Defender exclusion** for the repo tree — the biggest cold-boot lever (~64 s), but a real
  security trade-off: `node_modules` stops being scanned on access.
- Raising the `--server-wait-ms` default (60 s is shorter than a real cold boot).
- Any **write** to the live `news.db` (including `ANALYZE`).
- Deleting either ~28–30 GB backup (`news.db.pre-placenames-bak`, `news.db.predup-bak`).
