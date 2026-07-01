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
   don't reinvent: crawl-quality modules already exist (`RobotsCache`,
   `FreshnessClassifier`, `tools/crawl/throughput-analyzer.js`, guardian
   place-hub learning). Prior evidence to mine (not inherit):
   `docs/sessions/2026-05-29-crawler-reliability-recursive-plan/`. Do minimal
   (re)planning ONLY if STATE is missing/stale or a crawl exposed a strategic
   gap; else skip to IMPROVE.
2. **IMPROVE** — Take `current_lever` (top of `backlog_ranked`). Make ONE
   bounded, tested change toward reliability / ease-of-use (fewer steps to run,
   clearer self-explaining errors, safer defaults) or a quality fix a crawl
   revealed. Keep focused tests green.
3. **CRAWL** — Run a bounded real crawl to a SAMPLE db
   (`tools/crawl/run.js --local --crawl-db data/samples/<rung>-sample.db ...`),
   monitored live. Small rung by default; medium only after a clean small. Obey
   robots + `Crawl-delay` as a HARD floor.
4. **REVIEW+REWRITE** — Score the crawl (signals below); record numbers as
   evidence. Diff measured-vs-target: the largest gap that doesn't breach
   politeness becomes the next lever (re-rank backlog). Update STATE, overwrite
   this file, kill stray processes, emit a one-line chat pointer.

## Quality signals (measure every CRAWL; store numbers in STATE.last_crawl)
success rate · error taxonomy · politeness compliance (no robots/Crawl-delay
breach, no 429 storm) · freshness (304/unchanged skipped vs genuinely new) ·
dedup · throughput docs/s + bytes/s with the binding constraint
(politeness- / latency- / bandwidth-bound) · host coverage. Any signal under
target is a candidate lever; prefer the cheapest lever closing the biggest gap.

## Usability bar (definition of "reliably & easily usable")
ONE documented command runs a bounded, observable crawl to a sample DB and
returns a clear PASS/FAIL plus a quality scorecard; failures self-explain; safe
defaults; no manual DB surgery. Track this in `STATE.usability`.

## Tools (reuse)
`npm run crawl:sample -- <url>` (**the usable one-command crawl+scorecard**;
`tools/crawl/sample.js` + `lib/quality-scorecard.js` + `lib/sample-db-signals.js`) ·
`run.js` (bounded crawl, `--crawl-db`, watch gates) · `monitored-small-crawl.js`
(baseline/verify) · `crawl-progress-monitor.js` (read-only live packets from the
WRITER/sample db) · `crawl-packet.js` (scored packets + cadence compare) ·
`local-fixture-server.js` (loopback, no-network proofs) ·
`validate-continuation-state.js` (invariant check if STATE is externalized).

## Safety (hard rails)
Local + sample DB by default. Production `data/news.db` writes are GATED on clean
small AND medium sample proofs. Never breach robots/`Crawl-delay`/host rate.
Bounded caps + artifacts; explicit cleanup. No remote crawl/queue mutation,
deploy, prune, or drain without explicit approval. Don't hide failures — classify
and keep evidence. Never revert unrelated changes.

## STATE (authoritative; keep small — externalize to STATE.json only if > ~40 lines)
```json
{
  "cycle": 1,
  "phase_next": "ORIENT",
  "usability": {
    "target": "one command -> bounded observable sample crawl + PASS/FAIL scorecard",
    "status": "met-on-small",
    "command": "npm run crawl:sample -- <url>  (exit 0=PASS 2=FAIL 3=usage; --rung small|medium)",
    "proven": "small BBC crawl PASS; medium rung NOT yet proven"
  },
  "current_lever": "investigate+fix 3x duplicate fetching in basicArticleCrawl (each URL fetched exactly 3x; measured 39/59 dup on small BBC crawl) — biggest measured gap, politeness-relevant",
  "backlog_ranked": [
    "fix 3x duplicate fetching per URL in basicArticleCrawl (add crawl-level URL dedup / stop re-enqueue)",
    "store response validators (etag/last-modified) during basicArticleCrawl so re-crawls can do conditional GETs (measured etag=0,lastmod=0)",
    "prove crawl:sample on a MEDIUM rung (gate before any prod), then promote dedup+freshness from info-only to hard scorecard checks",
    "add self-explaining preflight for native better-sqlite3 load failure at crawl startup (actionable 'npm rebuild better-sqlite3')",
    "surface robots Crawl-delay adherence + throughput binding-constraint in the scorecard (currently no bytes/s: fetches table empty, http_responses has bytes)"
  ],
  "quality_targets": {"success_rate": 0.95, "politeness_breaches": 0, "stall": false},
  "last_crawl": {
    "cycle": 0, "rung": "small", "target": "https://www.bbc.com/news", "profile": "gentle",
    "db": "data/samples/small-sample.db", "verdict": "PASS", "run_exit": 0, "elapsed_sec": 105.8,
    "downloads": 59, "responses": 59, "success_rate": 1.0, "status_taxonomy": {"200": 59},
    "rate_limited_429": 0, "server_errors_5xx": 0, "stall": false,
    "distinct_hosts": 1, "requested_hosts": 1,
    "dedup": {"total": 59, "distinct_urls": 20, "duplicates": 39},
    "freshness": {"etag": 0, "last_modified": 0, "not_modified_304": 0},
    "binding_constraint": "politeness-bound (gentle single-worker) + 3x re-fetch waste; bytes/s unmeasured (fetches table empty)"
  },
  "recent_done": [
    "cycle0: built npm run crawl:sample (sample.js + quality-scorecard.js + sample-db-signals.js), 30 focused tests green; pre-seed sample DB schema + follow job to terminal so watch does not abort; documented in docs/cli/crawl.md",
    "cycle0: fixed better-sqlite3 native ABI mismatch on Node 25 (npm rebuild better-sqlite3 in ../news-crawler-db) — crawler was un-runnable before this"
  ],
  "blocked_on": null
}
```

## Rewrite contract
Each run: bump `cycle`, set `phase_next`, move the finished lever into
`recent_done` (keep last ~6), refresh `last_crawl` numbers, re-rank
`backlog_ranked`, set `current_lever`, then overwrite THIS file with the same
shape. Keep it dense — the STATE block is the memory. STOP (say so, don't invent
work) when `usability.status == "met"`, `quality_targets` hold on a medium rung,
and `backlog_ranked` is empty.
