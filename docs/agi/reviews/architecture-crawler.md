# Architecture review — crawler

**Node:** `TECH-ARCHREVIEW-CRAWLER` · **Subject:** `copilot-dl-news/src/core/crawler`
**Run:** 1 · **Date:** 2026-08-09 · **Model:** opus-5

Paths are relative to the repos directory and begin with the repo name — there
are five siblings and a bare `src/core/crawler` is ambiguous.

This is the first run. The node's `prelim` records that it has been *performed*
before without leaving an artifact; there is nothing here to compare against, so
"since last review" comparisons are made against **git**, not against a prior
document.

## Verdict

**The architecture is in good health. The problem is not its shape — it is that
the highest-priority owner directive stopped moving five days ago, and that
nothing has been crawled for twenty-two days.**

One improvement cleared the bar and was executed this run (a ratchet carrying
13 files of slack). Everything else I found is either healthy, or an allocation
fact rather than an architectural defect. Per the node's convergence contract,
**no further architectural changes are proposed** — the remaining suggestions I
considered are recorded as declined, with reasons, so the next run does not
re-derive them.

## Method

Every number below is `measured` — from `git`, from the checks, or from a
read-only query against `data/news.db`. Nothing here is inferred from reading
code and predicting behaviour; where I could only infer, I say so under
[what I could not determine](#what-i-could-not-determine).

## Healthy — measured

**The extraction is real, not bookkeeping.** 107 files left
`copilot-dl-news/src/core/crawler` and 115 `.js`/`.ts` files exist under
`news-crawler-itself/src`. The seam is load-bearing: **111 `require()` calls**
from the monorepo into `news-crawler-itself`, spread across 12 subpaths —
`fetch-pipeline` (18), `planner` (17), `signals` (7), `crawler-state` (7),
`crawl-infra` (6), `utils` (5), `playbook` (5), `output-verbosity` (5),
`politeness` (4), `worker-task-processor` (3), `url-services` (3),
`text-metrics` (3). Files were *moved*, not deleted.

**The founding ratchet more than halved.** This node's own seed list describes
ncdb-debt as "currently guarded at 241". It is now **106**.

**The politeness defects the ledger records are fixed.** Measured in code:

| defect | state |
|---|---|
| concurrency default 1 | now `default: 3`, `Math.max(1, val)` — at the owner cap |
| stored `domain_rate_limits` never read | honoured via `storedRateLimitProvider`, combined with the robots crawl-delay by `max()` so it *can only slow us down* |
| host-key inconsistency | lookup keyed on the **normalised** host, because the table holds both `www.` and bare forms |
| the fix itself shipped as a silent no-op (cycle 14) | extracted to its own module so the seam is testable against a real adapter; **12 tests pass** |

`DomainThrottleManager` now resolves from `news-crawler-itself/politeness` — the
politeness subsystem is already fully extracted.

**Guards are green.** 30 probes pass, 1 fails, 1 skips. The single red is
`bridge-health` (the dev bridge is not running), which is expected while nothing
is running and is not a crawler fault.

**Test coverage is respectable for an engine mid-extraction:** 64 test files
against 193 non-test sources across 38 directories.

## Findings

### F1 — the engine-debt ratchet was carrying 13 files of slack `measured` · ACTED ON

`CEILING` was **271**; the actual count has been **258** since `01df1fa6` on
2026-08-04. The gap was not progress waiting to be banked — it was a guard that
had quietly stopped guarding.

The detail that makes this worth recording: **cycle 185's own commit message says
`engine-debt 258`, and its ledger stanza says "258 files".** The extraction was
real and correctly reported. Only the constant was left behind. For five days the
ledger and the guard disagreed about the same fact, and the engine could have
grown back by 13 files without the ratchet making a sound.

This is the same two-records-one-fact failure the plans index had, and the reason
`copilot-dl-news/docs/agi/BOOT.md` prefers derived state.

- **Axis:** engine-debt ceiling · **Direction:** down · **271 → 258**
- **Cause named:** cycle 185 batch 11 (BrowserPoolManager — dead, ProxyManager,
  RateLimitTracker, RedownloadCooldownGuard and the rest of a 13-file cluster).
- **Nothing moved today to earn this.** It is a bookkeeping correction, not
  progress, and the check's comment block says so in those words.

### F2 — the extraction stalled on 2026-08-04 `measured`

Eleven slices in a single day took the count 365 → 258. Then it stopped dead:

| date | count |
|---|---|
| 2026-07-18 | 349 |
| 2026-07-27 | 365 *(rising — the engine was still growing in place)* |
| 2026-08-04 | 365 → 258 across eleven slices |
| 2026-08-09 | 258 |

**59 commits and 5 days since, with the count unchanged.** `news-crawler-itself`
last received a commit on 2026-08-05.

`copilot-dl-news/docs/plans/INDEX.md` marks the module-ecosystem plan
**ACTIVE OWNER DIRECTIVE**, priority *critical*, with "first extraction (remote
crawler engine + parallel compression) **next**". That is the work that stopped.

- **Axis:** engine-debt count · **Direction:** down · **currently flat at 258**

This is not an architectural defect and I propose no restructuring for it. It is
a statement of where the directive stands.

### F3 — churn is dominated by the loop's own instruments `measured`

Top 8 files by churn score over 30 days. **Not one is a crawler file:**

| score | commits | file |
|---|---|---|
| 636.96 | 115 | `docs/agi/progress/progress.svg` |
| 481.26 | 126 | `docs/agi/IMPROVEMENT_LEDGER.md` |
| 419.12 | 107 | `docs/agi/progress/repo-activity.json` |
| 165.61 | 48 | `docs/sessions/…/LOOP_STATE.md` |
| 139.15 | 38 | `tools/dev/probes.json` |
| 92.90 | 23 | `config/tech-tree.json` |
| 76.22 | 18 | `src/ui/server/unifiedApp/server.js` |
| 69.49 | 18 | `src/ui/server/projectStatus/statusData.js` |

Six are the loop's own record-keeping; the remaining two are the status board,
which is also loop instrumentation. Commit counts (categories overlap — one
commit can touch both):

| window | commits | touched `src/core/crawler` | touched loop instruments |
|---|---|---|---|
| 30 days | 281 | 54 (19%) | 160 (57%) |
| since 2026-08-04 | 72 | 16 (22%) | 65 (90%) |

The 16 recent engine commits changed the count not at all — the engine is being
*maintained*, not *extracted*.

This is the measured answer to the question the loop-audit skill asks: what
fraction of cycles improve the product versus the loop's own instrumentation.

### F4 — the politeness rework has never run against a live host `measured`

The single most decision-relevant finding.

- Last live fetch: **2026-07-18T16:48:25.952Z**
- Politeness floor + concurrency-3 default shipped: **2026-07-27**

**The repair postdates the last crawl by eight days.** Every claim in the
"healthy" table above is backed by unit tests and by reading the wiring; none of
it is backed by a single real request to a real host. Twelve passing tests
against a stubbed adapter prove the seam is wired, not that the pacing is right.

Format census on `fetches` (read-only): 54,452 rows ISO-8601, 33 rows with a
NULL `fetched_at`, no `sqlite`-format rows — so `MAX()` is trustworthy here. I
checked because `normalize-fetches` is still an unauthorised pending migration
and a mixed-format column would have made that `MAX()` lie (the cycle 221 class:
`T` sorts above space).

**This corrects a claim I made myself.** My own continuation prompt said the
crawler had been idle since 2026-08-04. That was the date the *extraction*
stalled. The crawler has been idle since **2026-07-18 — twenty-two days**.

- **Axis:** live requests made under the new pacing · **Direction:** up ·
  **currently 0**

### F5 — `NewsCrawler.js` grew for six months `measured`

**Reversal check performed** (the contract requires it before proposing):

| date | lines |
|---|---|
| 2026-01-29 | 2306 |
| 2026-02-24 | 2401 |
| 2026-07-11 | 2496 |
| 2026-07-19 | 2536 |
| 2026-08-04 | 2549 *(peak)* |
| 2026-08-09 | 2519 |

**No oscillation.** The direction was consistently up for six months, and only
turned on the extraction day. A proposal to shrink it therefore *continues* the
2026-08-04 direction rather than reversing an earlier one, and is admissible.

It is also the largest file in the engine by a wide margin (next: the Wikidata
ingestors at 1490/1488, which are data-mapping code and a different shape of
large).

- **Axis:** `NewsCrawler.js` line count · **Direction:** down · **2519**

I am **not** proposing a dedicated refactor. This file shrinks as a *consequence*
of F2 resuming; a standalone "split the god object" task would compete with the
extraction for the same lines and risks exactly the preference-shaped churn the
convergence contract forbids. Recorded here so the next run has the baseline.

## Declined — recorded so the next run does not re-derive these

| suggestion | why declined |
|---|---|
| Reorganise the 38 engine subdirectories | No measured axis. Directory count is not a defect measure, and the contract calls "restructure A as B" inadmissible without one. |
| Raise engine test coverage to a target ratio | 64/193 is a ratio, not a defect trace. No defect this run was attributable to an untested engine file. A coverage number chosen to be hit is a target, not a measurement. |
| Grind down the remaining 97 silent catches | **Already settled against, and re-proposing would be oscillation.** Cycle 232 read the tail and found it dominated by teardown (`db.close`, `controller.abort`) and logging wrappers, where swallowing is correct. The guard is explicitly a no-regression floor, not a backlog. |
| Split `NewsCrawler.js` as its own task | Real axis, but it competes with F2 for the same lines. See F5. |
| Widen the engine-debt scope to `src/core/{orchestration,…}` | The check's own header says widening is a deliberate ceiling-affecting decision, not a drive-by. It would also make the number jump, destroying comparability with 365→258. |

## What I could not determine

- **Whether the 107 files that left are the same 115 that arrived.** I matched
  magnitudes and confirmed the delegation seam resolves; I did not diff the two
  trees name-by-name. A file could have been dropped and another written fresh
  without this review noticing.
- **Whether all 258 remaining files are extractable.** The check's scope note
  implies some may legitimately stay. Nobody has written down the target, so
  `TECH-ENGINESPLIT`'s `atMost: 0` is an assumption about the endpoint, not a
  measured one. **This is the most useful thing the next run could settle.**

  > **Settled 2026-08-11, and the answer was no.** `tools/dev/extraction-endpoint.js`
  > measures 200 portable / 26 soft / **31 hard-anchored** files. The 31 group
  > into seven clusters — the remaining work is a boundary ruling, not thirty-one
  > chores — and four of them point at `src/core/orchestration`, which the ratchet
  > already excludes by design, so `atMost: 0` contradicts the check's own scope
  > note. Raised as `DEC-ENGINE-BOUNDARY` in `copilot-dl-news/docs/decisions/`.
  > Extraction of the 200 portable files is not blocked by it.
- **Whether the pacing is actually polite.** See F4 — unit tests only. This
  cannot be determined without running the crawler, which is owner-gated.
- **Frontier behaviour.** There is no `frontier/` module; selection is
  DB-resident (RB-012's "frontier reads") with `QueueManager` in front of it. I
  read the wiring but did not exercise it, and with the crawler idle there is no
  runtime evidence to read. The node names "frontier" as in scope; **this run
  did not cover it properly**, and I would rather say so than write impressions.

## Recommendation

The architecture does not need work. **Resume F2 or answer the politeness
question behind F4** — both are owner-gated, and both are worth more than any
change I could make to the engine's shape.

If the crawler is switched on, F4 says the first run is also the first live test
of pacing written eight days after the last crawl. Watch it rather than trusting
the green tests.
