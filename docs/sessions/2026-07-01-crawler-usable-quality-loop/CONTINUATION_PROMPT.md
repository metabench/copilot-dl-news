# Crawler Usability & Quality — Recursive Loop

Work in `c:\Users\james\Documents\repos\copilot-dl-news` (Windows/PowerShell; the
Bash tool is also available). You are one node in a self-continuing loop. THIS
FILE is the whole program: the STATE block is authoritative. Trust code over
prose; when they disagree, fix the block. One run = one pass through the phases,
after which you REWRITE this file with an updated STATE block and stop with a
one-line pointer (never paste the prompt into chat).

## Mission
Make the crawler **reliably and easily usable**, use it to crawl, continuously
**measure crawl quality**, and turn the **biggest measured gap** into the next
improvement — looping until the usability bar and quality targets hold on a
medium rung and the backlog is empty.

## Phases (one pass per run; plan only when needed)
1. **ORIENT** — Load STATE; verify its claims against code/tests (~5 min). Reuse,
   don't reinvent. Prior evidence to mine (not inherit):
   `tmp/cycle11-forensics.md` (seed root cause + sandbox recipes),
   `tmp/cycle12-notes.md` (stale-test triage), `tmp/cycle13-notes.md`
   (useSitemap falsification + direct-dispatch recipe). Minimal (re)planning
   ONLY if STATE is stale or a crawl exposed a strategic gap.
2. **IMPROVE** — Take the top of `backlog_ranked` that THIS node can execute
   (say so honestly when the top item needs the Windows node and take the next
   feasible one). ONE bounded, tested change. Keep focused tests green.
3. **CRAWL** — Bounded real crawl to a SAMPLE db (`npm run crawl:sample`),
   monitored live. Loopback fixtures for deterministic levers. Obey robots +
   `Crawl-delay` as a HARD floor. Cowork sandbox: network + npm UNBLOCKED but
   nothing survives between bash calls — bound to one ≤44s call
   (`--max-pages 3 --watch-timeout 24` via sample.js, or the faster direct
   dispatch: boot UI + `POST /api/v1/crawl/operations/<op>/start` with
   `{startUrl, overrides:{dbPath,maxDownloads,...}}` in a single call, then
   score the DB with the quality-scorecard lib in the next call). Long rungs:
   Windows node.
4. **REVIEW+REWRITE** — Score the crawl; record numbers as evidence. Largest
   politeness-safe gap becomes the next lever. Update STATE, overwrite this
   file, kill stray processes (ONLY yours), emit a one-line chat pointer.

## Quality signals (measure every CRAWL; store numbers in STATE.last_crawl)
fetch reliability ((2xx+304)/(content − discovery misses)) · error taxonomy ·
politeness (robots loaded; no 429 storm) · freshness (stored AND reused — c5) ·
dedup (recording vs genuine, by timestamps) · throughput (self-clocked, content
rows) · host coverage · fetch-visibility (ledger == rows — c7/c8) · infra
fetches (info) · discovery misses (info) · **seed-fetched (HARD: every requested
URL must have a recorded fetch — PASSING c11/c12/c13 on bounded live runs;
full-rung confirmation pending on Windows)** · queue-event trail
(enqueued→dequeued→fetch-skip persisted — c10, proven live c11).

## Usability bar (definition of "reliably & easily usable")
ONE documented command runs a bounded, observable crawl to a sample DB and
returns a clear PASS/FAIL plus a quality scorecard; failures self-explain; safe
defaults; no manual DB surgery. Track this in `STATE.usability`.

## Tools (reuse)
`npm run crawl:sample -- <url>` (probe-aware, 304-aware, seed-fetched hard
check, `--override k=v`, `--max-pages N --watch-timeout S`; revalidation:
`--keep-db --override maxAgeArticleMs=0`) · `CRAWLER_LOG_QUEUE_DROPS=1`
([queue] stderr lines; when dispatching via run.js they land in
`tmp/_unified-ui.log`, not the caller's stderr — c13) · `local-fixture-server.js`
(ETag/304s + `--request-log`) · `run.js` · `crawl-progress-monitor.js` ·
`validate-continuation-state.js`. Persistence: `../news-crawler-db` (dist/;
build + vitest). Engine facts: baseUrl keeps ports (c6); queue mode is
concurrency-gated (c11): `NewsCrawler.js:325` usePriorityQueue = concurrency
> 1, single-worker crawls use FIFO arrays — priority ignored there EXCEPT the
c11 override-unshift in `QueueManager._pushItem` (this is what makes
seed-fetched pass); c10's "discarded post-dequeue" theory FALSIFIED c11 (seed
was never dequeued: FIFO starvation); `_maybeAttachCacheContext` intentionally
propagates `requestMeta` even on cache miss (811b7def — don't "fix" it back,
c12); `useSitemap=false` WORKS end-to-end on current code (c13 falsified the
c9 dead-knob claim; regression test pins it; `_harvestSitemaps` only records
URLs from robots.txt, never fetches — `sitemapCount>0` with zero fetches is
normal); ops schema is docs not a filter; remaining DEAD-KNOB history:
`preferCache=false` (c4, fixed via maxAgeArticleMs).

## Remote fleet (Oracle VM — REFRESHED 2026-07-07; see deploy-staged-loop/stage13-14-deploy-record.md)
KEY CORRECTIONS: (1) VM runs OLD build `20260527035514` on `--db data/news-simple.db`
(2026-07-07 deploy ROLLED BACK precautionarily; new build 20260707163023 staged at
VM /tmp/deploy-v2/). (2) Sandbox CAN deploy — a sandbox-generated key can be
authorized on the VM (one operator-pasted line); sandbox resets wipe the key.
(3) deploy-remote-server.js default remoteDb=data/news.db MISMATCHES production
(news-simple.db) — always pass --db data/news-simple.db. (4) Server queue/stored
counters are SESSION-SCOPED — restart-proof is pm2 uptime + direct sqlite, and
status buildId reads the disk manifest (changes BEFORE restart). (5) Boot-time
newsSourcesSeeder ENOENT warn is pre-existing/benign. Everything below is the
older map, still valid where not contradicted:
Host: `141.144.193.218` (Oracle Cloud, user `ubuntu`), resolved by
`tools/crawl/lib/fleet-host-resolver.js` (FLEET_HOST env → `tools/crawl/.fleet-host`
gitignored file (absent) → hardcoded default). Live server: Multi-Domain Crawl
Server v4, pm2 service `crawl-server-v4`, dir `~/apps/remote-crawler-v2`, API
port 3200 (reachable from Cowork sandbox; port 22 open too). As of 2026-07-04:
up 37 days, build `20260527035514` (2026-05-27 — STALE vs repo), orchestrator
idle, 1273 pending URLs, shield active. Deploy CLI:
`npm run crawl:deploy-remote` (= `tools/crawl/deploy-remote-server.js`;
dry-run default, `--apply` executes, busy-guard trips on the 1273 pending →
needs `--force` or a drain; `--preflight-only --json` works from the sandbox,
no SSH). SSH auth: `--ssh-key` / `REMOTE_CRAWLER_SSH_KEY` / ssh-agent /
operator `~/.ssh` — key exists ONLY on the operator's Windows machine (alias
`oracle-worker` in their ssh config; sandbox probe returns
`Permission denied (publickey)`), so DEPLOYS RUN FROM WINDOWS. Sandbox CAN
drive the full HTTP API (status/start/stop/seed/domains/config/throttle/
export) — still gated by the no-remote-mutation-without-approval rail.
`tools/remote-crawl/` is legacy; don't use. Flow docs: `tools/crawl/AGENT.md`
lines ~49/356-366/875-916.

## Safety (hard rails)
Local + sample DB by default. Production `data/news.db` writes GATED (promotion
needs explicit operator approval — never autonomous). Never breach
robots/`Crawl-delay`/host rate. Bounded caps + artifacts; explicit cleanup. No
remote crawl/queue mutation, deploy, prune, or drain without approval. Classify
failures with evidence; don't hide them. Never revert unrelated changes
(`../news-crawler-db` has unrelated pre-existing uncommitted modifications).
Commit only if asked.

## STATE (authoritative; keep small — externalize to STATE.json only if > ~40 lines)
```json
{
  "cycle": 14,
  "phase_next": "ORIENT",
  "usability": {
    "target": "one command -> bounded observable sample crawl + PASS/FAIL scorecard",
    "status": "met-on-small-bounded (seed-fetched PASSING c11/c12/c13 live Guardian; full 20-page small + medium rung confirmation REQUIRES Windows node)",
    "command": "npm run crawl:sample -- <url>  (exit 0=PASS 2=FAIL 3=usage; CRAWLER_LOG_QUEUE_DROPS=1 for queue trace; --max-pages/--watch-timeout to bound)",
    "proven": "c11 seed fix verified live 3x; suites green in sandbox: 57/57 focused (c12) + RobotsAndSitemapCoordinator 6/6 incl. new c13 knob guard; useSitemap knob verified end-to-end (c13)"
  },
  "current_lever": "WINDOWS NODE (top, blocked on sandbox): (1) broad crawler jest suite — confirm c11 FIFO contract tests + c12 queueManager.basic contract fix + c13 useSitemap regression guard all green on Windows. (2) Full unbounded small rung: npm run crawl:sample -- https://www.theguardian.com/world — seed-fetched must PASS at 20 pages. (3) Medium rung (120 pages, depth 2) + record numbers — gates the mission stop-condition. SANDBOX NODE (next feasible): conditional sitemap fetching — news.xml 574-583KB re-downloaded EVERY crawl (c8/c9, reconfirmed c12: sitemap-probes=2 fresh each run); reuse the RobotsCache TTL+revalidation pattern in sitemap.js loadSitemaps (ETag/If-Modified-Since via stored validators); verify with two consecutive --keep-db runs: second run must show 304s or skipped re-downloads in the ledger",
  "backlog_ranked": [
    "Windows validation: broad jest suites + full 20-page small rung + medium rung; seed-fetched must PASS at full caps (blocked on sandbox: 44s per-call limit)",
    "conditional sitemap fetching: news.xml 574-583KB re-downloaded EVERY crawl — reuse RobotsCache TTL+revalidation pattern (sandbox-feasible; verify with 2x --keep-db runs -> 304s)",
    "right-size medium rung with pace data (11-62s/page variance)",
    "operator decisions pending (14 cycles of work, partially committed as 811b7def/a5c22e51): (a) commit remaining changes (c11 QueueManager fix + FIFO contract tests, c12 queueManager.basic contract fix, c13 RobotsAndSitemapCoordinator regression test), (b) production rung-3 promotion (hold until seed-fetched passes at full rung caps on Windows)"
  ],
  "quality_targets": {"success_rate": 0.95, "politeness_breaches": 0, "stall": false, "recording_duplicates": 0, "seed_fetched": true},
  "last_crawl": {
    "cycle": 13, "rung": "two bounded live diagnostics (engine-direct harness + direct UI dispatch POST), both with useSitemap=false",
    "target": "https://www.theguardian.com/world", "db": "sandbox-only; evidence in tmp/cycle13-notes.md",
    "verdict": "PASS for the lever: zero sitemap fetches with useSitemap=false on BOTH paths; seed fetched 200 both runs (3rd/4th consecutive live seed-fetched success)",
    "numbers": {"engine_direct": "robots 200 + seed 200 + 1 article 200, sitemap fetches 0", "dispatch_path": "robots 200 + seed 200, sitemap fetches 0, 'Sitemap ingestion disabled' x2 in UI log", "politeness": "0x429 0x5xx both runs"},
    "instrument": "RobotsAndSitemapCoordinator suite 6/6 (new regression guard pins the knob)",
    "artifacts": "tmp/cycle13-notes.md (chain trace + dispatch recipe); tmp/_unified-ui.log (in-repo UI/queue trace location, discovered c13)"
  },
  "recent_done": [
    "cycle13: useSitemap 'dead knob' (c9) FALSIFIED on current code — verified live at engine level AND full HTTP dispatch level: sitemap stage skipped, zero sitemap fetches, robots+seed only. Override chain code-traced clean end-to-end. +1 regression test pins the knob (suite 6/6). Discovered tmp/_unified-ui.log as the queue-trace location for dispatched crawls + single-call direct-dispatch recipe. No engine change needed",
    "cycle12: focused suites 57/57 (first fully green). Fixed stale queueManager.basic contract test (contradicted committed requestMeta behavior since 811b7def). Second consecutive live Guardian PASS (bounded): seed-fetched 1/1",
    "cycle11: seed-starvation ROOT-CAUSED and FIXED: usePriorityQueue = concurrency>1 -> single-worker FIFO ignored priority; seed starved behind sitemap flood (c10 theory falsified). Fix: _pushItem unshifts priorityMetadata.override items in FIFO mode (+2 contract tests). Verified live: PASS, seed-fetched 1/1. First sandbox live crawl; UI boots on Linux via cifix.js",
    "cycle10: end-to-end queue visibility (fetch-skip/dequeued/seed-enqueue persisted + CRAWLER_LOG_QUEUE_DROPS knob) + self-explaining seed-fetched FAIL; +10 tests (green c11)",
    "cycle9: seed-fetched HARD check shipped; seed enqueue hardened (necessary but not sufficient — c11)",
    "cycle8: real-site validation PASS + sitemap waste quantified; c7: 100% fetch visibility; c6: ledger + robots recording + port politeness; c5: 304 proof; c4: fixture overrides; c3: conditional GET; c2: throughput+medium; c1: dedup; c0: crawl:sample"
  ],
  "blocked_on": "full-rung validation + broad suite need the Windows node (sandbox: 44s per-call cap, no surviving background processes)"
}
```

## Rewrite contract
Each run: bump `cycle`, set `phase_next`, move the finished lever into
`recent_done` (keep last ~6), refresh `last_crawl` numbers, re-rank
`backlog_ranked`, set `current_lever`, then overwrite THIS file with the same
shape. Keep it dense — the STATE block is the memory. STOP (say so, don't invent
work) when `usability.status == "met"`, `quality_targets` hold on a medium rung,
and `backlog_ranked` is empty.
