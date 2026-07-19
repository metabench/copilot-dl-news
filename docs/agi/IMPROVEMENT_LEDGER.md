# Improvement Ledger

Falsifiable record of whether the compounding-improvement loop
(`.claude/skills/singularity/SKILL.md`) actually compounds. Two signals, per the skill:
**cost-per-verified-improvement should fall**, and **second-order tools should appear**
(instructions/tools that improve instruction/tool production — recursion, not accumulation).
If cost rises across comparable rows, the scaffold is bloating: say so and prune.

Method note: "cost" is a rough per-improvement share of an agent working turn (wall-clock +
tool-calls burden), judged by the agent that did the work — coarse, but comparable across rows
of the same kind. Bugs = defects found in the NEW work during its own verification (finding a
*pre-existing* bug counts as a discovery, not a cost).

## Delegations (copilot → ncdb, semantics-preserving)

| # | Date | Surface | Cost | Bugs in new work | Verification stack | Notes |
| - | ---- | ------- | ---- | ---------------- | ------------------ | ----- |
| 1 | 2026-07-19 | crawl_milestones INSERT (milestones.js) | ~1.0 turn | 1 (eager-prepare group crash — caught by real-fixture e2e, fixed in 63ad5d8) | round-trip + real-NewsDatabase e2e + live-schema probe + 4-lens adversarial workflow | First of its kind; recipe established here |
| 2 | 2026-07-19 | sync-site-geo full 8-statement surface | ~0.5 turn | 0 | differential e2e (9/9) + live dry-run before/after identical | Recipe applied up front; own-cache-key + real-fixture lessons pre-empted the #1 bug class |
| 3 | 2026-07-19 | article-read canonical join, detect-articles + find-place-hubs (4 statements, −91 lines) | ~0.5 turn | 0 | differential e2e (10/10, trap fixtures) + built-SQL **string equality** + repointed-CLI smoke + sql:check-ui 0 | No adversarial workflow: string-equal SQL is a proof, not a heuristic — verification right-sized to risk. Side discovery: ArticlePlaceMatcher wrong-row join bug (92% live mismatch), filed as its own task |

Trend: cost halved after row 1 and held; defects in new work went 1 → 0 → 0 while verification
got *cheaper* (proof-style checks replacing fan-outs where applicable). Compounding: **yes so
far** — driven by codified lessons (own cache key, real fixtures) and the reusable
differential-e2e harness pattern.

## Second-order tools (the recursion signal)

| Date | Artifact | Why second-order |
| ---- | -------- | ---------------- |
| 2026-07-19 | docs/agi/BOOT.md + reconciliation method (probe-readers → verdicts) | Improves how all future knowledge is found, trusted, and filed; the sweep method is repeatable |
| 2026-07-19 | Differential-e2e harness pattern (two identical real NewsDatabases, original SQL vs export, trap fixtures) | Reused 3× already; makes every future delegation cheaper and safer — a tool that produces verified tools |
| 2026-07-19 | Probe-stamped-claim convention (RB-011) | Makes staleness machine-detectable; improves the quality of all future written knowledge |
| 2026-07-19 | Model-lineage table + swap calibration (SELF_MODEL.md) | Preserves scaffold value across model generations — the cross-model ratchet, operationalized |

## Tool health observed in passing (fix-or-file, per the tools directive)

- 2026-07-19: `tools/dev/crawl-status.js` + `task-events.js` probe-verified working. Nit:
  crawl-status lists the Electron shell process (cli.js) as an "ACTIVE CRAWL" — process-detection
  false-positive; cosmetic, unfixed.
- 2026-07-19: `sql:check-ui` repaired externally (comment-aware matcher, honest 0 baseline,
  src/ui scope) — now a real regression tripwire; does NOT cover src/tools / src/intelligence.
- 2026-07-19: detect-articles candidate query is slow-by-construction on the live 1.68M-url DB
  (COALESCE in ORDER BY + LOWER(host) defeat indexes — the documented sharp edge). Pre-existing;
  a perf variant would be a behavior change — candidate for a deliberate, tested follow-up.

## Ledger discipline

Append a row per completed improvement cycle (or per major artifact). Keep judgments honest —
a "no measurable delta" cycle gets recorded as such. Subtraction (retiring stale
skills/memories/tools) is improvement too: log it here.
