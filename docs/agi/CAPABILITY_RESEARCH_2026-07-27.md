# Advancing agent capability in this ecosystem — research notes (2026-07-27)

**Owner ask:** how do agents (this one and others) advance AI capability within these repos,
serving the project goals, with three development goals in view: **do a lot per turn**,
**generate the next turn's prompt**, and — most importantly — **make the workflow produce
visible progress artifacts (SVGs)**. These notes are grounded in the 76 instrumented cycles
in [IMPROVEMENT_LEDGER.md](IMPROVEMENT_LEDGER.md), not in general principles.

---

## 1. What the ledger actually shows about capability

Recomputable from the stanzas (`node tools/agi/progress-svg.js --print-metrics`):
**76 cycles · 98 verified improvements · 132 defects found, 118 (89%) caught pre-ship ·
3 formal correction events · 16,856 pages crawled during measured work.**

The single biggest capability lever this session was not a better model or a bigger prompt —
it was **moving measurement off the live internet onto a deterministic fixture** (cycles
17→18): same-condition variance fell from ~60% to ~5%, and a question five cycles failed to
answer was settled in one run. Generalization: **when an agent keeps failing at a task, first
ask whether the ENVIRONMENT can express the answer at all.** Building the instrument that can
is a per-turn multiplier for every later turn.

## 2. Do-a-lot-per-turn: the levers with evidence behind them

| lever | evidence here |
|---|---|
| Long waits run in the background; the agent keeps building | every crawl/measurement this session ran backgrounded while docs/tools were written |
| Pre-registered predictions make verification cheap | cycle 29: the −1.5–2.5 ms prediction FAILED and one control-arm read settled it |
| Instruments that verify the treatment APPLIED (not just the outcome) | `maxInFlight` ended five ambiguous cycles; the fixture's request counter caught a crawl aimed at the wrong site |
| Adversarial subagent review BEFORE an expensive/outward-facing step | cycle 10: one reviewer killed a doomed 35-min trial AND answered its question from existing data |
| A cheap falsifier before the build step | cycle 12: one API call (jobs completed 200/200) killed a fix already designed |
| Owner gates checked per-action, never inferred | zero unauthorized live-DB writes or politeness loosening in 76 cycles |

Anti-lever, equally evidenced: **more work per turn without instruments is negative work.**
Cycles 5–8 produced four turns of throughput numbers that were all retracted at once.

## 3. Next-turn prompt generation: the working grammar

The recursive prompt used across this session is **externalized working memory with a fixed
grammar**, regenerated (never appended) each cycle:

```
HEADER (workstream · cycle N)
REFERENCE      — pointers to docs that hold the detail; the prompt stays small
STANDING CONSTRAINT — owner limits, verbatim, never paraphrased away
PROGRESS       — ✅ done / ⚠️ partial-or-retracted / ▶ the ONE next step
THIS CYCLE     — a single step, with its success criterion incl. honest-NULL
METHOD         — rules EARNED from real mistakes in this workstream only
GATED          — ask-first list, verbatim
ON COMPLETION  — doc row · ledger row + stanza · regenerate SVG · regenerate this prompt
```

Regeneration rules that made it work: advance PROGRESS truthfully (retractions stay visible);
add a METHOD line **only** when a mistake actually happened (a rule without a scar gets
ignored); carry constraints and gates verbatim; keep the whole thing under ~a page by pushing
detail into REFERENCE docs. Failure mode observed: METHOD grows monotonically — consolidate
into memory/LESSONS when it exceeds ~12 lines. **RB-014** proposes generating the skeleton
mechanically from the latest stanza + doc §0, so any agent (or a cron) can emit the next
prompt without a human relay.

## 4. The substrate principle

Everything above works because the loop's artifacts are **parseable, not just readable**:
ledger rows carry `<!-- cycle:{...} -->` stanzas → `cycle-metrics.js` verdicts and now the
progress SVG; scope is `config/repo-scope.json` → `check-repo-scope.js` (probe), after prose
scope drifted twice (the ecosystem doc called the engine "an EMPTY placeholder" months after
it held 36 files). **Rule: when an agent states something durable, it should also emit the
machine-readable form and, where possible, the probe that re-verifies it** (RB-011). Counts a
tool can recount; claims a probe can re-check.

## 5. SVG progress artifacts — the workflow change (owner: most important)

**Shipped:** `tools/agi/progress-svg.js` renders `docs/agi/progress/progress.svg` from the
ledger stanzas. Design decisions, each load-bearing:

- **Regenerate, never mutate.** The SVG is a pure function of (stanzas + annotations
  sidecar). "Modifying" the picture = editing data (`--annotate "118=Warm-up bug fixed"`),
  then re-rendering. Hand-edited pictures drift from the record they claim to summarize.
- **Deterministic** — no timestamps or randomness in output; the "data through" date comes
  from the data. Same inputs → byte-identical SVG, so git diffs are meaningful and CI can
  assert the committed picture is current.
- **Honest by construction** — retractions render as red diamonds ON the progress line;
  every tile is a count the tool can recount. A progress picture that only shows wins would
  repeat the append-only-doc failure §0.2 exists to fix.
- **Palette validated** (dataviz validator, dark surface): gold `#b8862e` / green `#55a377`
  / red `#b34d4d`, worst adjacent CVD ΔE 16.1; identity never color-alone (legend + position).

**Integration with the Claude system — loose vs tight:**

| mode | mechanism | works for | status |
|---|---|---|---|
| Loose | CLI at cycle close (BOOT.md now instructs it); SVG committed; embeds in README/GitHub | any agent, CI, humans | **adopted** |
| Loose | CI step re-runs the tool and fails if the committed SVG is stale (determinism makes this a byte-compare) | GitHub Actions | proposed |
| Tight | Claude Code sends the SVG into chat after regenerating (side-panel render) | this app | **demonstrated this turn** |
| Tight | A `PostToolUse` hook on ledger edits auto-regenerates | Claude Code settings.json | described only — installing standing hooks is an owner action |
| Tight | A `/progress` skill: render + send on demand | Claude Code skills | proposed (RB-015) |

Recommended posture: **loose-first** (the artifact must outlive any one agent harness),
tight layered on top where it pays.

## 6. Risks, stated now rather than discovered later

- **Goodhart:** once the SVG is visible, "make the line go up" pressures the
  `verified_improvements` field. Mitigation: the field is only credited alongside a
  verification list in the same stanza, and corrections render on the same line.
- **Schema drift:** stanzas are free-form JSON; 2 of 78 already fail to parse. A stanza
  schema probe is the natural next ratchet (fold into `cycle-metrics --check`).
- **Prompt bloat:** §3's METHOD cap; consolidate earned rules into LESSONS/memory.

## 7. Registered in the backlog

- **RB-013** — scope as an executable probe (delivered: manifest + checker + probe entry).
- **RB-014** — next-prompt generator: assemble the §3 grammar from the latest stanza + §0
  summaries, so prompt regeneration itself is tooling, not prose discipline.
- **RB-015** — progress SVG v2: stanza-schema probe, CI staleness check, per-repo lanes,
  optional `/progress` skill + hook (owner-installed).
