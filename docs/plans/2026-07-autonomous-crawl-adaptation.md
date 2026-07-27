# Autonomous crawl adaptation — site-general problem-response roadmap

Owner ask (2026-07-21): "improve the ability of the crawler to autonomously respond to
and deal with problems of the sort mentioned to do with Guardian slowness — make sure
strategies work on ALL sites, not just Guardian."

Produced from a judge-panel adversarial workflow (4 angles: observability, control-loop,
learned-profiles, failure-playbook) grounded in live DB + code investigation.

## The core finding that reframes everything

The crawler **already collects rich per-host performance signals but throws them all
away** — none feed back into scheduling. The live scheduler (`QueueManager`) consumes
ONLY two per-host inputs, both *reactive backoff timers* (`getHostResumeTime`,
`isHostRateLimited`), sourced from `DomainThrottleManager`. Every gate keys on **errors,
429s, or robots-delay** — never on **realized performance**. So a host that is
*healthy but slow-yielding* (fast 200 fetches + long idle gaps, no errors — the Guardian
signature) is **invisible to every existing adaptive gate**.

- `http_responses` timing columns (`ttfb_ms`, `download_ms`, `total_ms`,
  `bytes_downloaded`, `transfer_kbps`) are **persisted but write-only** — read back only
  by offline tools. `sample-db-signals.deriveThroughput` already computes per-run
  bytes/sec + busyFraction + bindingConstraint; nothing feeds it into a live crawl.
- `DomainThrottleManager` **persists** rpm/backoff/err429Streak to the `domains` table on
  every request but **always cold-starts at rpm=30** — `dbClient` has no read path.
  Learned per-host politeness is discarded between crawls (a cheap win: add the load path).
- `CrawlScheduler` (scores urgency + successRate + articleYield) is **dormant** — not
  wired into live host selection.

## The Guardian case, correctly diagnosed (HIGH confidence, evidence-backed)

Guardian fetches are FAST (~100ms, HTTP 200) and LARGE (~1.3–1.5 MB/page, 3–5× BBC/CNN);
the slowness is 55–150s **gaps** between fetches. The adversarial workflow **refuted all
four throttling hypotheses with hard evidence** and found the true cause:

- **DECISIVE: the gaps are host-AGNOSTIC total silence** — 0 `http_responses` from ANY
  host during a 193s gap (2026-05-12); Guardian AND BBC both silent during a 58s gap
  (2026-05-13). No per-host throttle can synchronize cross-host silence.
- (b) robots crawl-delay — Guardian `crawl_delay_seconds=null`. (c) rpm/429 — `total_429s=0`,
  `backoff_until=null`. (a) bandwidth cap — bursts ran **>5 MB/s for ~33s (peak 6.78)**,
  far above the 1.8 cap (a 1s token bucket can't bank 8 MB to explain 193s of silence).
  (d) demand-slice — separate worker processes can't synchronize cross-host silence.
- **DOMINANT CAUSE: whole-process orchestration DEAD-TIME** — synchronous better-sqlite3
  frontier reconcile/hydration against the 30 GB DB stalls the entire crawler process
  between fetch bursts (the SAME event-loop-starvation family root-caused in tasks
  #39/#40), plus the fixed 4-min per-host wait-cap cadence. Guardian only *looks* unique
  because its large pages yield fewer pages per burst, so the fixed per-cycle dead-time
  dominates its pages/min.

**So it is an orchestration INEFFICIENCY/BUG, not correct politeness** — but the fix is
NOT to throttle a healthy host. The true fix (Strategy 4/roadmap) is to take the frontier
reconcile/hydration OFF the crawl thread and keep the queue continuously hydrated
(benefits EVERY host). The shipped abort-on-wait-cap is correct; its only residual weakness
is that its TRIGGER is a blind fixed 4-min clock, not a measured signal (→ Strategy 1).

## Failure-mode taxonomy → autonomous playbook (site-general)

| Failure mode | Detect (existing signal) | Autonomous response | Status |
|---|---|---|---|
| Hung / no-progress | per-worker EWMA bytes/sec ≈ 0 for N s (already IPC-fed) | `registry.stop` → grace-drain → reclaim leased rows to pending | **abort-on-wait-cap SHIPPED 2026-07-21** |
| Slow-gaps, healthy fetches (Guardian) | per-host bytes/wallclock + pages/min low, 0 errors | ORCHESTRATION, not throttle: own lane / keep queue full / adaptive wait-cap | roadmap |
| JS-wall / bot-challenge | ContentValidationService invalid on 200 / detectPuppeteerNeeded | Puppeteer rescue + `recordPuppeteerNeeded` persist, then quarantine | rescue SHIPPED |
| 429 / rate-limit | HTTP 429 + Retry-After | escalating `note429` blackout → `getHostResumeTime` defers host | EXISTS/correct |
| Low-yield / dead-frontier | high `preSkippedFresh` / low articleYield | lower host weight in `pickRotatedHosts`; longer revisit interval | roadmap |
| Large-page starvation | per-host avg bytes 3–5× batch median | cap heavy-host concurrency; own lane; fix demand-slice floor | roadmap |
| DNS / connection fail | ECONNRESET/ENOTFOUND repeated for ONE host | per-host `HostRetryBudgetManager` lockout (NOT whole-crawl abort) | EXISTS |

## Ranked strategy roadmap (compounding, reuse-first)

1. **[SHIPPED]** Abort-on-wait-cap + reclaim (hung/slow-host recovery; no lingering job/leak).
2. **[S] Live per-host health meter** — fold each fetch's already-computed timing into an
   in-process rolling `deriveThroughput` per host; emit as a field next to
   `perHostLimits` so crawl-status + the scheduler can see effective-throughput / gap /
   yield. *Observability first — the substrate for all of the below.*
3. **[M] Persist + rehydrate a learned per-host profile** — aggregate the per-fetch rows
   into the existing `domains.analysis` JSON via the already-wired `upsertDomain`; ADD the
   missing DB READ path so `DomainThrottleManager` warm-starts from learned rpm/politeness
   instead of cold rpm=30. *Cross-crawl learning; thin-coordination (DB-shaped, in ncdb).*
4. **[M] Host classification (fast/large/slow/blocked) → adaptive wait-cap + batch
   composition** — a legitimately-large-but-healthy host (Guardian) gets a profile-derived
   budget and is NOT co-scheduled in a tight-latency fast batch; it gets its own lane.
   *(The per-request `waitCapMs` shipped 2026-07-21 is the manual precursor.)*
5. **[M] Low-yield deprioritization** — exhausted-frontier hosts yield batch slots to
   hosts with fresh work (weight in `pickRotatedHosts`/`getPendingHosts`).
6. **[L] Revive `CrawlScheduler`** — wire its urgency/successRate/articleYield scoring into
   live run-multi host selection for cross-crawl yield-based prioritization + concurrency.

## Design principles (from the panel)

- **Reuse, don't reinvent:** the signals, the DB columns, `deriveThroughput`,
  `DomainThrottleManager`, `CrawlScheduler` scoring already exist — the gap is *wiring
  them back into live scheduling*, not new subsystems.
- **Measure before you automate:** ship the observability meter (2) before any closed-loop
  controller, so the response is evidence-driven and debuggable.
- **Right response per failure mode:** a healthy-but-slow host is an *orchestration*
  problem (lane/queue), a hung host is an *abort* problem, a 429 host is a *backoff*
  problem — do not conflate them under one "slow host" hammer.
- **Persist learned state in the DB (thin-coordination):** per-host profiles belong in
  ncdb-owned tables, read + written through ncdb, so learning survives restarts.
