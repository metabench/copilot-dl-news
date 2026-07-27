# Workflow Measurement & Improvement

*How the improvement loop measures — and improves — its own workflows. Added 2026-07-21 (cycle 47).*

The loop's success criterion (see the `IMPROVEMENT_LEDGER.md` header and
`.claude/skills/singularity/SKILL.md` → "Is it actually compounding? — falsifiable
metrics") is: **cost-per-verified-improvement falls while second-order tools accrete.**
Historically four of the five compounding signals were asserted in prose and only one
(ncdb coordination-debt) was machine-checked. This plan closes that gap: make the loop's
effectiveness **computed, not narrated**, using the same pattern that already works for
ncdb-debt (a numeric baseline + a probe that re-checks it at every orient).

Two complementary instruments, each with a small additive record and a tool:

| Instrument | Measures | Record | Tool | Status |
|---|---|---|---|---|
| **Cycle metrics** | the whole loop's compounding (cost, recursion, quality, coordination-debt) | `<!-- cycle:{...} -->` stanza co-located under each ledger row | `tools/agi/cycle-metrics.js` | **shipped (cycle 47)** |
| **Workflow scorecard** | whether each *workflow run* earned its cost | `docs/agi/WORKFLOW_LEDGER.jsonl` (one line per workflow run) | `tools/dev/workflow-scorecard.js` | **shipped (cycle 48)** — bootstrapped with 13 labeled runs |

---

## 1. Cycle metrics — is the loop compounding?

At cycle close, emit one machine-readable stanza directly **below** the human ledger row,
as an HTML comment (invisible in rendered markdown, co-located so it cannot drift from its
prose):

```
<!-- cycle:{"id":47,"date":"2026-07-21","model":"opus-4.8","tracks":["A","B"],"cost_turns":2.2,"verified_improvements":2,"second_order":["cycle-metrics.js"],"scaffold_added":["cycle-metrics.js","WORKFLOW_MEASUREMENT.md"],"scaffold_retired":[],"defects":[{"caught_by":"adversarial-workflow","preship":true}],"verification":["unit-test","live-validate","audit-workflow"],"adversarial_workflow":true,"ncdb_debt":258,"pages_crawled":39,"reused":["diff-article-cascade.js"]} -->
```

**Required fields:** `id` (stable integer, reused as the SELF_MODEL lineage join key),
`date`, `model`, `cost_turns` (numeric), `ncdb_debt`. **Recommended:** `tracks[]`
(A=scaffold/instruction, B=product), `verified_improvements`, `second_order[]`,
`scaffold_added[]`, `scaffold_retired[]`, `defects[]` (each `{caught_by, preship,
origin_cycle?}`), `verification[]`, `adversarial_workflow` (bool), `pages_crawled`,
`reused[]` (prior second-order artifacts this cycle consumed).

**The metrics** `cycle-metrics.js` computes over a rolling window (default 6):

1. **Cost-per-verified-improvement trend** — the primary signal. Falling = compounding,
   rising = scaffold bloat. Works on existing prose (`~N turns` regex) before stanzas
   backfill, and sharpens as stanzas accrue.
2. **Second-order tool rate** — fraction of cycles producing a tool/instruction that
   improves *production*, not just the product. Trending to zero = accumulation without
   recursion. `reused[]` lets the tool test the recursion claim directly (did cost fall in
   cycles that consumed a prior artifact?).
3. **Pre-ship defect containment** — defects caught during a cycle's own verification vs
   escaped to a later cycle, attributed to the layer that caught each (`unit-test` /
   `differential-e2e` / `live-db-evidence` / `adversarial-workflow` / `screenshot` /
   `probe`). Turns "live verification caught what unit tests could not" from anecdote into a
   measured coverage gap.
4. **ncdb coordination-debt trajectory** — the north-star series, cross-checked against the
   live `ncdb-debt-scan --json` to catch SQL added-but-unrecorded.
5. **Scaffold net-capital + bloat flag** — added − retired; bloat = scaffold growing while
   cost is flat/rising. Retirement is a first-class improvement.
6. **Composite verdict** — `COMPOUNDING | PLATEAU | BLOATING | MIXED`, computed, so
   plateau-honesty does not depend on the agent's self-judgment (the exact bias the quality
   gate warns about).

**Discipline (do these):**

- **Never append a prose ledger row without its stanza.** The stanza is purely additive —
  do not rewrite existing rows. Backfill old rows only opportunistically.
- Populate `ncdb_debt` from `node tools/dev/ncdb-debt-scan.js --json` at cycle close (the
  scan keeps no history; the stanza is the only durable per-cycle series).
- Repeat the cycle `id` in the SELF_MODEL.md lineage note so cost/ledger and model/prose
  finally share a join key.
- At orient, run `node tools/agi/cycle-metrics.js` and **read the verdict before picking
  threads**: `PLATEAU` → pivot to portable-capital work (tests/harnesses/memory for the
  next model); `BLOATING` → spend the cycle pruning scaffold. Record the reading in the
  LOOP_STATE line.
- A no-product / no-measurable-delta / pure-maintenance cycle still emits a stanza (record
  it honestly — `scaffold_retired[]` counts).

**Guard:** `node tools/agi/cycle-metrics.js --check` is registered in `tools/dev/probes.json`
(`needsServer:false`), so a malformed stanza or a cycle ≥ the instrumentation floor missing
required fields FAILS the orient probe run — the same ratchet discipline that guards ncdb-debt.

---

## 2. Workflow scorecard — did *this workflow* earn its cost?

The mission requires "validate the workflow verdict yourself with DB-evidence" precisely
because verdicts have been wrong at material cost (the crawl-rate false "4 MB/s" burned two
cycles; the stale May "whole-process silence" verdict; the task-44 red-herring gap) — and
right (delegation #3's destructive-collision catch; task-39's wedge-vs-crash re-diagnosis).
Make workflow effectiveness a tracked number so a workflow that has quietly stopped earning
its cost surfaces automatically instead of on the next expensive surprise.

**Record:** after every workflow run (adversarial multi-lens, judge panel, differential-e2e,
multi-agent investigation, or a measurement-tool verdict), append one line to
`docs/agi/WORKFLOW_LEDGER.jsonl`:

```json
{"date":"2026-07-21","cycle":47,"workflow":"stream-audit+corpus+design","shape":"2audit+2design","task_type":"resilience-audit","cost_turns":0.6,"verdict":"1 high + 1 medium + 3 low unguarded stream sites","validation_method":"read each site + confirm try/catch misses async error","validation_outcome":"CONFIRMED","issues_flagged":[{"claim":"crawlObserver:307 spawn no error handler","validated":"real","severity":"medium"}],"escaped":[]}
```

`validation_outcome` ∈ `CONFIRMED | REFUTED | PARTIAL | NA`. **Ground truth is your own
validated finding, never the workflow's self-report** — verdict (its claim) and
validation_outcome (your confirmed finding) are separate fields; when they disagree the
validated one wins and the run is REFUTED.

*Optional additive field:* on a REFUTED run set `"refuted_kind":"wrong-verdict"` (bad — a false
verdict, e.g. crawl-rate's fake 4.83 MB/s) or `"correct-refutation"` (good — disproving a bad
premise, e.g. task-44 saving a compliance-violating change). It does **not** change verdict-accuracy
(a REFUTED run stays a miss there); the scorecard surfaces a `refuted_breakdown` and a companion
`verdict_accuracy_adjusted` that credits correct-refutations. Absent on every legacy record ⇒ unlabeled.

**The metrics** `workflow-scorecard.js` (to build) computes, segmented by (shape, task_type):

- **verdict-accuracy** — CONFIRMED / (CONFIRMED + REFUTED + PARTIAL·0.5).
- **catch-rate** — runs that surfaced ≥1 validated-real issue / all runs.
- **false-alarm-rate** — flagged issues that were not real / all flagged. (Pairs with
  catch-rate so a flag-everything workflow can't game it.)
- **cost-to-catch** — Σ cost_turns / Σ real catches. The workflow-scoped instance of the
  loop's top-line signal; `∞` when a workflow caught nothing real.
- **escape-rate** — real defects first caught by live/DB evidence *after* the workflow
  blessed the change / runs. The blind-spot counterweight (P4 urlId gap, article-vs-hub
  mis-model) that stops cheap-but-weak workflows from looking effective.

> **Reading nuance (learned from the cycle-48 bootstrap):** a low **verdict-accuracy** is not
> automatically bad. A REFUTED verdict can be the workflow *working* — task-44 correctly refuted
> a "whole-process dead-time" premise and *saved* a robots-compliance-violating change; crawl-rate
> refuted its own false "4 MB/s" only after burning two cycles. Both are REFUTED in the enum but
> opposite in value (the `evidence` field distinguishes them). The bootstrap shows **diagnosis**
> workflows at verdict-accuracy **0.50** yet catch-rate **1.0** / cost-to-catch **0.9** — their
> first verdict is a coin-flip, which is exactly why "validate the verdict yourself" is mandatory
> for diagnosis, but they still reliably surface real issues cheaply. So prefer **cost-to-catch**
> and **escape-rate** as the ratchet signals (they measure value-per-turn and blind-spots without
> the refutation-conflation); use verdict-accuracy as a *diagnostic to read*, not a hard gate.

**Discipline (do these):**

- **Right-size before running.** Consult `workflow-scorecard.js --group-by task_type` and
  prefer the shape that has historically earned its cost on THIS task type. A proof-style
  check (string-equal built SQL, differential post-state) needs no adversarial fan-out; a
  live-reachable destructive/write-path change earns the full multi-lens + synthesis.
  Running a low-catch/high-false-alarm shape out of habit is bloat — skip it and say why.
- **The workflow gate is necessary but not sufficient.** After any workflow blesses a
  change, still verify against live/DB/differential evidence (tests verify the model;
  due-reads verify the world). Record every post-workflow escape in `escaped[]`.
- **To evaluate a CHANGE to a workflow, A/B it** skill-creator-style: replay the changed
  shape AND the baseline against the labeled past cases in the ledger (delegation-#3,
  task-39, task-44 — ground truth known) plus the next real correctness-sensitive task.
  Ship only if catch-rate or cost-to-catch improves WITHOUT raising false-alarm/escape-rate,
  on ≥ ~5 labeled runs (workflow effectiveness is high-variance and small-n — one good run
  is anecdote).
- **Measurement tools are workflows too.** A measurement tool's verdict (crawl-rate,
  timed-probe, host-health) goes in the same ledger and is held to the same bar: *verify the
  measurement tool before trusting its measurement.* A wrong number is the most expensive
  workflow output there is.
- **Bootstrap:** seed `WORKFLOW_LEDGER.jsonl` by back-filling the ~10 workflow-bearing
  ledger rows whose ground truth is already known (delegation #3, task #39/#40/#42/#44),
  giving the scorecard a labeled corpus on day one.
- **Guard:** register a `verdict-accuracy` floor / `cost-to-catch` ceiling (with `--min-runs`
  ≥ 5 so anecdotes can't trip it) as a `needsServer:false` probe in `probes.json`.

---

## Why this shape (not more prose)

The corpus already *proves* it can operationalize a loop metric: the ncdb-debt ratchet
(`probes.json --max 258`, baselined 269 → 265 → 261 → 258) is a numeric baseline ratcheted
as work lands and re-checked at every orient, failing loud on regression. This plan gives the
other compounding signals — cost-per-improvement (segmented by model), recursion, quality,
and workflow-effectiveness — the **same** treatment: a small additive per-record structure +
a computing tool + an orient-time probe. The definitions already live in the singularity
skill and the ledger header; the gap was machine-readability and a computed check, not more
narrative. Keep the prose ledger as the human story; let the stanzas and JSONL carry the
numbers.
