# Architecture review — crawler

**Node:** `TECH-ARCHREVIEW-CRAWLER` · **Subject:** `copilot-dl-news/src/core/crawler`
**Run:** 2 · **Date:** 2026-08-11 · **Model:** opus-5
**Previous run:** 1, 2026-08-09 — `git show 19cca090:docs/agi/reviews/architecture-crawler.md`

Paths are relative to the repos directory and begin with the repo name.

This run was triggered by the mechanism, not by a schedule: `tools/agi/tech-state.js`
reported the record **STALE** — recorded 2026-08-11, subject changed 2026-08-11.
That is the recurring-review convention working as designed, and it is the first
time it has fired for real.

## Verdict

**Run 1's headline finding is resolved. Its most decision-relevant one got worse.**

The extraction is no longer stalled — it moved **258 → 164 files in one day**, and
the endpoint is now measured rather than assumed. But run 1 said the politeness
rework had never touched a live host, and this run found a second, independent
reason the first crawl needs watching: **a core service has been broken for seven
days and nothing could see it.**

## What changed since run 1

Seven commits. **Five touched `src/core/crawler`; one touched the loop's own
instruments.** That is the inversion of run 1's F3.

| | run 1 (2026-08-09) | run 2 (2026-08-11) |
|---|---|---|
| engine files | 258 | **164** (−94, −36%) |
| ratchet ceiling | 271, carrying 13 files of slack | 164, banked every slice |
| delegation requires | 111 across 12 subpaths | **191 across 50** |
| extraction | stalled 5 days | five slices in one day |
| endpoint | unmeasured, assumed 0 | 105 movable / 59 blocked |
| last live fetch | 2026-07-18 | **2026-07-18, unchanged** |

## Findings from run 1, re-measured

### F1 — ratchet carrying slack · **RESOLVED**

Banked 271 → 258 in run 1, and every slice since has banked in the same commit:
258 → 244 → 226 → 213 → 194 → 164. The ledger and the guard no longer disagree.

### F2 — the extraction had stalled · **RESOLVED**

Five slices: operation-schemas (14); healing/learning/coordinator/profiler (18);
pipeline/remote/scheduler (13); the operations core + sequence + telemetry schema
(19); and thirteen control-primitive directories behind one entry (30).

`docs/plans/INDEX.md` still marks the module-ecosystem plan **ACTIVE OWNER
DIRECTIVE, critical**, and it is now visibly moving.

### F3 — churn dominated by the loop's own instruments · **INVERTED, and the instrument was partly wrong**

By commits since run 1: 5 of 7 touched the engine, 1 touched instruments.

But `churn-scan` still ranks tooling on top for the last two days, and that is a
**blind spot rather than a contradiction**: moving a file to another repo shows up
as a *deletion*, not as churn, so extraction work is invisible to it while the
ratchet file it edits along the way is not. Ninety-four files left the engine and
churn-scan cannot see any of them.

Run 1 used the top-8 churn table as the headline for this finding. That was the
wrong instrument for extraction-shaped work; the commit-touch counts are the
honest measure. Recorded so run 3 does not repeat it.

### F4 — the politeness rework has never run against a live host · **UNCHANGED, AND NOW WORSE**

Last live fetch remains **2026-07-18T16:48:25.952Z — twenty-four days**. The
politeness floor and concurrency-3 default shipped 2026-07-27, eight days after
it. Nothing has exercised them.

**And now a second reason.** See F6.

### F5 — `NewsCrawler.js` grew for six months · **UNCHANGED at 2,519 lines, and now explained**

It did not shrink during a day that removed 94 files, because it is one of the 31
HARD-anchored files: it reaches `optionsBuilder`, `src/data/db/sqlite` and three
`src/core/orchestration/*` modules. It cannot move until `DEC-ENGINE-BOUNDARY` is
answered. Run 1 declined to propose a dedicated refactor for it; that still holds,
and the reason is now sharper — it is blocked, not neglected.

## New findings

### F6 — the fetch pipeline was broken for seven days, and nothing could see it `measured`

`src/core/crawler/services/groups/ProcessingServices.js` bound the fetch-pipeline
package's **named bag** as if it were the class:

```js
const FetchPipeline = require('news-crawler-itself/fetch-pipeline');
…
return new FetchPipeline({ … });   // "m is not a constructor"
```

The surrounding catch re-raises it as `FetchPipeline not available`, so
`container.get('fetchPipeline')` **failed outright**. Introduced by cycle 178's own
fetch-cluster extraction on **2026-08-04**.

Why nothing caught it: the require *resolves* — only the use is wrong — so
`entry-loads` passes. No test covers that container path. And the crawler has not
run since 2026-07-18, so no execution ever reached it.

> **CORRECTION, 2026-08-11, same day.** I first wrote here that "the first crawl
> after the politeness ruling would have hit a core service that will not
> resolve." **That was wrong, and I repeated it to the owner twice before
> checking.** Measured since: `src/core/crawler/services/` — `wireServices`,
> `ProcessingServices`, `PolicyServices`, `StorageServices` — has **zero
> non-test consumers** anywhere in the repo. `container.get('fetchPipeline')`
> genuinely would have thrown, but nothing calls it, so no crawl was ever going
> to reach it.
>
> Found by building the e2e crawl test below and running the defect back in as a
> counterfactual: the crawl passed 5/5 with the binding broken. I could have
> recorded that as the test being weak. The truthful reading is that the *claim*
> was weak — the test could not reach the code because nothing does.
>
> What survives: the binding was a real defect, the class is real and has now bitten
> **four** times (linkExtractor c177 and articleProcessor c176 each served a silent
> shim for an unknown period; scheduler; this one), and `delegation-bindings`
> catches all four shapes. What does not survive is the severity. This belongs
> with the unwired-modules finding, not with F4.

- **Axis:** unwrapped bindings onto a bag export · **Direction:** down · **now 0**

### F7 — that defect class is now guarded, because the suite provably cannot see it `measured`

The same shape appeared **three times in one day** — 51 scheduler tests red, then
nine bindings in the crawl-control slice of which three were production files,
then this seven-day-old one. Twice it was recorded as a lesson in a comment and
twice the lesson failed to prevent the next occurrence.

The decisive measurement: the `CrawlerServiceWiring.js` binding was **deliberately
re-broken**, and `tests/unit/crawler/CrawlerServiceWiring.test.js` still passed
1/1, as did `entry-loads`. And that call site sits one line above a catch that only
warns — the c188 quiet-fallback class.

`tools/dev/checks/delegation-bindings.check.js` now guards it, registered as a
probe (31 pass, was 30). It flags only an unwrapped binding onto a bag that *has*
that key; a module whose export genuinely is a function is never flagged, so the
check stays worth reading.

### F8 — the endpoint is measured; zero is not reachable `measured`

`tools/dev/extraction-endpoint.js`: **105 movable, 59 blocked.** The 59 group into
seven clusters, and four point at `src/core/orchestration`, which the ratchet
already excludes by design — so `TECH-ENGINESPLIT`'s `atMost: 0` contradicts the
check's own scope note. Raised as **`DEC-ENGINE-BOUNDARY`**, still open.

The recommendation there — the composition root belongs to the application, not
the library it composes — was applied in miniature this run: `operations/index.js`
stayed and became a call-through while its parts left.

## What I could not determine

- **Whether anything else is broken the same way F6 was.** `delegation-bindings`
  now covers one specific shape. The general problem — a delegation that resolves
  but is used wrongly, behind a catch that only warns — is bounded by nothing
  except tests that do not exist. **The crawler being idle means every defect of
  this class is still latent rather than absent.**
- **Whether the moved code behaves identically under load.** Every slice was
  proven by structural fingerprint plus the existing suites. That catches lost
  exports, changed signatures and shape errors. It does not catch a behavioural
  difference that only appears at runtime, and nothing has run.
- **Frontier behaviour.** Still not covered, for the same reason as run 1: it is
  DB-resident and the crawler is idle. Two runs have now declined to review it;
  that is a gap the record should stop hiding, and it will not close without a
  crawl.

### F9 — an unwired layer, larger than first thought `measured`

`src/core/crawler/services/` has **zero non-test consumers**. So does everything
in the 2026-08-11 leaf slice — `healing`, `learning`, `coordinator`, `profiler` —
whose injection points in `CrawlerMetricsService` are documented in JSDoc and fed
by nothing.

This is the honest home for F6: the fetch-pipeline binding was broken in a
subsystem nothing calls. It also explains why the e2e crawl test cannot catch
that defect, and why no test ever did.

**Whether these should exist is an owner call, not a review's.** Deleting a
built-but-unwired subsystem on this evidence is a bigger decision than any
extraction slice, and the measurement is now recorded for whoever makes it.

- **Axis:** engine subsystems with zero production consumers · **Direction:**
  down · **currently at least 5** (services, healing, learning, coordinator, profiler)

## Recommendation

Unchanged from run 1 in direction: **the extraction can continue without anyone,
and the crawler cannot.**

F4 stands on its own and is the reason to watch a first run: the politeness
rework shipped eight days after the last fetch and has still never touched a live
host. F6 does **not** add to that, per the correction above — it is an unwired-code
finding, not a crawl-blocking one.

The new e2e delegation test (`tests/e2e-features/engine-delegation.e2e.test.js`)
narrows the gap this review has now flagged twice: 152 files inside the extracted
package are provably executed by a real crawl in about eight seconds. It proves
the delegation is live. It does not prove behaviour under load, and it cannot
reach code that nothing calls.
