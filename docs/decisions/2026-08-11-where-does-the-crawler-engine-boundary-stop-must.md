---
decision: DEC-ENGINE-BOUNDARY
status: open
question: Where does the crawler-engine boundary stop — must the composition root and the app-side intelligence seam leave the monorepo too?
options: [full-extraction, engine-only, measured-floor]
blocks: [TECH-ENGINESPLIT]
---

# Where does the crawler-engine boundary stop?

**Date:** 2026-08-11

Paths are relative to the repos directory and begin with the repo name.

## Why this is being asked now

`TECH-ENGINESPLIT` gates on the engine-debt ratchet reaching **`atMost: 0`** —
every file gone from `copilot-dl-news/src/core/crawler`. Nobody ever measured
whether zero is reachable; the 2026-08-09 crawler architecture review
(`copilot-dl-news/docs/agi/reviews/architecture-crawler.md`) flagged it as an
assumption and named settling it the most useful next step.

It has now been measured. **Zero is not obviously reachable**, and the gap is not
a pile of work — it is this decision.

## What was measured

`node tools/dev/extraction-endpoint.js` — 257 tracked `.js` files under
`src/core/crawler`:

| class | files | meaning |
|---|---|---|
| portable | **200** (78%) | no `require()` outside the scope at all — these can follow their module today, no decision needed |
| soft | **26** (10%) | reach out only to targets that an already-extracted file also depended on and survived |
| HARD | **31** (12%) | reach a surface no completed extraction has resolved |

The `soft` class is derived from evidence, not judgement: the 2026-08-04 run moved
**108 files**, and the 13 distinct out-of-scope targets they depended on were all
resolved somehow — the target moved too, the require was re-pointed at
`news-crawler-itself`, or the dependency was inverted and injected (the c180
`QueueManager` pattern). *Caveat:* that proves the dependency **class** was
resolvable, not that any particular target relocated.

The instrument was built acceptance-test-first. Run against the 108 files
**already known to have left**, the raw rule calls 15 of them anchored — a 13.9%
false-anchor rate. Reading those 15 is what produced the `soft` class. The rate is
deliberately not zero: a zero would mean the proven set had been fitted to its own
test.

### The 31 HARD anchors are seven questions, not thirty-one chores

| files | cluster | representative targets |
|---|---|---|
| 9 | shared utils | `src/shared/utils/{pipelines,optionsBuilder,domainUtils,attributeBuilder,…}` |
| 8 | db & storage | `src/data/db/sqlite`, `src/db/dbAccess`, `src/db/TaskEventWriter` |
| 4 | app services | `src/services/{CountryHubGapAnalyzer,CountryHubMatcher,NewsWebsiteService,…}` |
| 4 | intelligence | `src/intelligence/{teacher/TeacherService,planner/PlannerHost,planner/register,…}` |
| 4 | orchestration | `src/core/orchestration/{SequenceRunner,SequenceConfigLoader,…}` |
| 3 | tools & labs | `src/tools/placeHubDetector`, `tools/crawl/lib/fleet-host-resolver`, `src/wip/labs/…` |
| 3 | legacy crawl | `src/crawl` (all three are tests) |

Two files carry most of the weight and are the actual subject of this decision:

- **`src/core/crawler/CrawlerServiceWiring.js`** — the composition root. It wires
  `PlaceHubPatternLearningService` and `TeacherService` into the crawler.
- **`src/core/crawler/NewsCrawler.js`** — 2,519 lines, anchored on
  `optionsBuilder`, `src/data/db/sqlite`, and three `src/core/orchestration/*`
  sequence modules.

One file contains a computed `require()` the instrument will not classify; it is
reported rather than guessed at.

Note that `src/core/orchestration` is **already excluded from the ratchet by
design** — `engine-debt.check.js` says widening scope is a ceiling-affecting
decision, not a drive-by. So four HARD anchors point at a surface the ratchet has
explicitly declared out of bounds, which is a contradiction in the current target
whichever way it is resolved.

## The options

**A — `full-extraction`: zero really means zero.** Every file leaves, including
the composition root; the seven clusters are resolved by dependency inversion
(the proven c180 pattern) and the app injects everything from outside.
*Buys:* `news-crawler-itself` becomes genuinely standalone and the module-ecosystem
directive completes as written. *Costs:* ~31 inversions across 35 targets, and a
composition root that lives in a library rather than in the app that composes it —
which is backwards, and is usually the thing you keep.

**B — `engine-only`: the composition root and the app-side seams stay.
`atMost: 0` is wrong and should be corrected to the measured floor.**
The engine leaves; the wiring that binds it to *this* app does not.
*Buys:* an honest, reachable target, and a boundary that matches how the code
already behaves. *Costs:* the ratchet stops at a non-zero number, so "done" has to
be defined by a list rather than by zero.

**C — `measured-floor`: adopt 31 as the target now, revisit when it is hit.**
*Buys:* movement without a philosophical ruling.
*Costs:* 31 is a measurement of *today's* couplings, not a designed boundary —
it will drift with every commit, and a target that drifts is not a target.

**Recommendation: B.** The composition root belongs to the application, not to the
library it composes; that is what a composition root is. B is also the only option
that removes the existing contradiction with the ratchet's own scope note.
It requires naming which clusters stay — the smallest honest version is
*composition root + intelligence seam stay, everything else goes*, which would put
the floor near 6–8 files rather than 31.

## Why this is the owner's call

No technically correct answer exists. The measurement bounds the problem but
cannot choose a boundary: whether `news-crawler-itself` is meant to be a
standalone crawler others can run, or the engine *this* app drives, is a product
question. The module-ecosystem plan is an **ACTIVE OWNER DIRECTIVE** and this
would amend its endpoint.

It also has a ceiling consequence: option B changes what `TECH-ENGINESPLIT` can
ever mean, and `engine-debt.check.js` states that scope changes are deliberate
decisions rather than drive-bys.

**Until this is answered, extraction can continue on the 200 portable files
without touching any of it** — nothing is blocked today.
