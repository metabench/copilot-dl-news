# Debt-reduction plan (cycle 183+)

Owner-requested (2026-08-04): "ideas for how you could best reduce technical
debt — integrate into future plans as well as the prompt." This doc is the
durable half of that integration; the recursive continuation prompt is the
operating half. Doctrine unchanged: **debt only moves when an instrument
counts it** (the 2026-08-03 audit's causal split, confirmed every cycle
since). So every idea below is expressed as an instrument plus a cadence,
not as prose intent.

## Measured starting state (2026-08-04, cycle 182)

| Debt | Instrument | State | Trend |
|---|---|---|---|
| engine-debt | tools/dev/checks/engine-debt.check.js | 292 | 365→292 in 8 cycles — healthy |
| ui-debt | ui-debt check | 488 | **flat 8 stanzas — stalled** |
| ncdb-debt | ncdb-debt check | 241 | **flat 8 stanzas — stalled** |
| known-failing crawler tests | none — a memorized "known 51" | 51 tests / 19 suites | uninstrumented; normalized brokenness |
| phantom test edges | none | 3 found by accident of transit | class bit 3× (utils.safeCall c177, milestoneTracker c181, enhanced-features c182) |
| silent catches | none | 103 files match `catch (_/e) {}` | class produced both silent-shim defects (c176, c177) |

## The ideas, ranked by measured leverage

1. **Phantom-edge sweep + zero-ratchet.** One script resolving every
   `require()` and `jest.mock()` target in every test file, both repos,
   against the real tree. Unresolvable = never-ran-class defect. All three
   resurrections so far were found *by accident* when transit forced the
   edge; each resurrection restored a whole suite of working coverage
   (13/13 first-ever run in c182). Sweep once, fix what it finds, then wire
   it into probes at zero so the class cannot recur. Cheapest item; kills a
   class that has bitten three times. **Do first.**

2. **Known-51 named-set ratchet + triage.** Convert the memorized known-51
   into a check pinning the exact failing test NAMES (set-shrink-only: a
   NEW failure reds immediately; removing one banks it). Then triage 2–3
   suites per cycle into four classes — (a) phantom/never-ran kin,
   (b) stale expectation, (c) real defect, (d) needs-environment — each
   with its own fix pattern. This is the biggest quality lever: it restores
   regression-catching power to the exact suite the extraction operates in,
   de-risking every future batch. Today a batch-caused failure hides only
   by name-checking against a memorized list.

3. **Pave the road ahead of the extraction** (recipe change, not a queue
   item). Before each batch, on the named next movers only: prune dead
   requires (NewsCrawler carried two dead organ-imports for cycles — dead
   requires create FALSE tendrils that inflate closure scans), run the
   movers' own tests pre-transit, and note inline-duplicate fallbacks
   (PriorityScorer carried a private copy of PriorityCalculator logic).
   Makes every subsequent per-file scan cheaper and more truthful.

4. **Silent-catch survey (report-not-act first).** 103 files match the
   pattern that produced both silent-shim defects. Not all are wrong (some
   guard best-effort telemetry); a survey classifies hot-path swallows vs
   legitimate guards, converts the dangerous ones loud (c176/c177
   precedent), and only then decides whether a count-ratchet earns its keep.

5. **Unfreeze or honestly park the stalled ratchets.** ncdb 241 and ui 488
   have not moved in 8 stanzas. A ratchet nobody turns is the prose-freeze
   failure mode with better decoration. Either name the next batch for each
   (ui: the dashboard migration slot already exists) or park them on the
   board with an owner-visible reason. Parked-with-reason beats
   silently-flat.

6. **Debt lanes on progress artifacts.** The progress SVG shows commits;
   it should also plot the debt vector per stanza so a flat lane is
   *visible* stall. Low cost; makes all ratchets honest to the owner at a
   glance.

## Cadence (the actual integration)

Each cycle = **primary engine batch + ONE secondary debt item, sized ≤~20%
of the turn**, taken in order from the queue: (1) phantom sweep+check — DONE cycle 183: built, measured 18, fixed 2 same-cycle self-names, probe ratchets from 16 toward the zero floor (six of the 16 ARE known-51 crawler suites — they cannot even load, so item 2 starts there),
(2) known-51 named-set check — DONE cycle 184 (known-failures.json pins 17 suites / 49 tests by NAME, quick mode probed, --verify at cycle close; the set already shrank: placeHubs.data left it via a REAL-DEFECT fix — broken legacy INSERT preferred by delegation + dedup unenforced by any unique index, app-level guard added, schema migration owner-gated) — then per-cycle triage pairs — COMPLETE cycle 194: THE REGISTRY IS EMPTY (17 suites / 51 tests at birth → 0; the crawler suite is fully green, 864/864) and the FULL-repo re-measure moved 169→88 failed suites, 460→174 failed tests, 4842→6012 passing (+1170) — the remaining 88 are dominated by e2e/needs-server/scratch-tree classes (owner-scale decision on instrumenting them stands), (3) silent-catch
survey, (4) stalled-ratchet unfreeze-or-park prep (owner rules), (5) debt
lanes. Pave-the-road (idea 3) is not queued — it joins the settled recipe
as a standing pre-move step. The continuation prompt carries this cadence
forward each turn; this doc is its anchor.

## The 88-suite census (cycle 198 — owner decisions requested)

Full-run 2026-08-05: 86 failed suites / 169 failed tests / 6017 passing.
Classified; each class has a different right treatment — rulings requested:

| Class | Count | Recommended treatment |
|---|---|---|
| LEGACY-TESTS-TREE (the old parallel tests/ root) | 43 | census-then-burn like the phantom playbook, or bulk-retire the tree if superseded by src/__tests__ — RULING NEEDED |
| E2E/BROWSER (puppeteer, guardian runs) | 13 | separate jest project + servers-up lane (npm run test:e2e), excluded from the unit denominator — RULING NEEDED |
| SRC-ADJACENT (in-tree fixable classes) | 11 | normal debt-work territory; schedulable now without a ruling |
| SERVER-BOUND (spawns/expects services) | 10 | join the e2e lane or gain spawn-own-server harnesses per suite |
| SCRATCH-TREE (tmp/, wip/ — incl. a VENDORED ncdb helper collected as a test) | 6 | jest testPathIgnorePatterns for tmp/ + wip/ — config hygiene, changes the measured denominator so ratification requested |
| ENV-DEP + tools + other | ~3 | the standing better-sqlite3 / @playwright/test rulings |

**Stopping condition per instrument:** an instrument retires when its class
is structurally impossible (phantom edges once probed), its count reaches
its floor (engine-debt at shell-state), or the owner parks it with a
reason. Instruments are scaffolding, not monuments.
