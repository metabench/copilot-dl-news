# CONTINUE — jsgui3 upgrade of the project-status app (self-rewriting prompt)

**How to use:** paste this whole file as the prompt, or say
"follow docs/agi/CONTINUE_JSGUI3_UPGRADE.md". The last instruction in this file
tells you to rewrite this file before your turn ends, so the next turn starts
from the true state. Keep it accurate; it is the only handoff.

---

## 1. Your task THIS turn

**Stage 3 — adopt the mixins that replace hand-rolled code, and close the one
open regression from stage 2.**

Concretely, in this order (the first item is a measured regression; the rest is
stage 3 proper):

1. **Recover the CSS bundle: 144 KB → ~28 KB.** The split grew served
   `/css/css.css` five-fold because jsgui3-server's control-elimination pass
   (`jsgui3-server/resources/processors/bundlers/js/esbuild/JSGUI3_HTML_Control_Optimizer.js`)
   is failing open and keeping every stock control's CSS. **Two hypotheses are
   already REFUTED by measurement — do not re-run them:** (a) the computed
   `jsgui.controls[name] = Ctrl` registration tripping
   `dynamic_control_access_detected` — made static, no change; (b) the scan
   being entry-scoped — named the seven stock controls in `controls/index.js`,
   no change. The optimizer has two documented fail-open branches
   (`dynamic_control_access_detected`, and `package_usage_without_detected_identifiers`
   at ~line 275); it also accepts `emit_manifest` and `log` options. **Turn the
   manifest/log on and read what it actually decided** rather than proposing a
   third guess. Measure with `curl -s localhost:3184/css/css.css | wc -c` on a
   WARM server — a cold curl returned 0 bytes once because the bundle publishes
   asynchronously at boot.
2. **Adopt `tooltip`, `collapsible`, `keyboard_navigation`, `a11y`** where they
   replace hand-rolled behaviour: node hovers currently carry nothing, the
   PRELIMINARY DATA / DETAIL blocks truncate at 4 items with a "N more" line
   that could collapse instead, and the board has no keyboard path at all —
   selection is mouse-only today, which is an accessibility gap, not a polish
   item. Verify each mixin exists on BOTH builds before adopting.
3. **Re-seat the tree/detail split on `Master_Detail`** (`items`, `selected_id`,
   `master_renderer`, `detail_renderer`, `layout_mode`, `phone_stacked`,
   `touch_item_height`, `aria_label`) — it brings the responsive + a11y
   behaviour `Tree_View` currently hand-rolls with a CSS grid and a media query.
   If it cannot host an SVG DAG as the master pane, say so with the reason and
   keep `Tree_View`; a recorded no is a result.
4. **Test whether the selection coordinator is still needed.** `Tree_View`
   owns exactly-one-selected because `action_select_only`'s sibling walk was
   judged unreliable here. That judgement predates this cycle's finding that
   `pre_activate_content_controls` DOES rebuild `content._arr` and `_ctrl_fields`
   on reattachment. Measure it; if the scope works, the coordinator collapses.

## 2. State of the work

| Stage | Status |
| --- | --- |
| 1 — adopt stock controls (Panel, Stat_Card, Progress_Bar, Data_Grid, Key_Value_Table, Chip, Button) | **DONE** (cycle 162) |
| 2 — one control per file; retire module globals; kill the last DOM sites; CSS onto the control | **DONE** (cycle 163) |
| 3 — Master_Detail + `tooltip`/`collapsible`/`keyboard_navigation`/`a11y`; retest the selection coordinator | **NEXT — this turn**, after item 1 |
| 4 — restore lost coverage | **DONE** (cycle 163): 31 → 51 tests, the count c161 deleted down from, now including structural guards on every axis |

**Measured axes (monotonic — a rise is a regression):**

| Axis | Before | Now | Target |
| --- | --- | --- | --- |
| classes per file | 8 in one file | 1 | 1 |
| hand-built DOM sites (`createElement`/`innerHTML`) | 11 | **0** | 0 |
| module-level mutables | 8 | **0** | 0 |
| controls carrying their own CSS | 1 of 8 | **17 of 17** | all |
| projectStatus tests | 31 | **51** | no drop |
| served CSS | 28 KB | **144 KB** | ~28 KB ← the open regression |

Background, read once if you lack context: [JSGUI3_MIGRATION_REPORT.md](JSGUI3_MIGRATION_REPORT.md),
[JSGUI3_CONTROL_ADOPTION_PLAN.md](JSGUI3_CONTROL_ADOPTION_PLAN.md),
[TECH_TREE_INTERFACE.md](TECH_TREE_INTERFACE.md), and
`src/ui/server/projectStatus/AGENTS.md`.

## 3. Working rules — each was learned expensively; do not relearn them

1. **Survey the catalogue before building anything.** jsgui3 ships **155
   exported controls** and **48 mixins**. Proposing to build something it
   already has has happened twice in this project, once immediately after
   diagnosing that exact reflex.
2. **Verify a control before adopting it:** resolve it from `jsgui.controls`,
   SSR-smoke it with the *real* spec shape, and confirm it exists in **both**
   the server and client builds.
3. **Never retreat to hand-built DOM.** `createElement` always works and is
   always available, which is precisely how the string pages were born.
4. **Reattachment skips compose.** A reattached control is constructed down the
   `spec.el` branch, so anything a control assigned to itself during compose
   (`this.grid = grid`) is **undefined in the browser**. Find collaborators
   through `context.map_controls` (see `controls/shared/page-controls.js`).
   This is not theoretical: it is why the SIGNAL LOG never refreshed.
5. **A stock control restored from SSR markup may come back EMPTY.** `Data_Grid`
   recovers neither `columns` nor `rows` — and rows without columns render the
   right *number* of blank rows, which reads as a styling bug rather than a data
   one. Re-supply what compose supplied (`set_columns` before `set_data_source`).
6. **Never swallow an error silently.** `_apply`'s bare `catch (_) {}` hid a
   dead feature for several cycles. Per-part isolation is right; per-part
   silence is not.
7. **Adopted controls carry their own theme.** `Key_Value_Table` and `Chip` ship
   light defaults that read as holes cut in a dark panel. Adoption includes
   seating the control in the page's palette — check computed styles, not just
   that it rendered.
8. **CSS belongs on the control**: `Ctrl.css = \`…\`` after the class, before
   `module.exports` — the documented `static css` hook (`html-core/control.d.ts`)
   that 101 stock controls use. The bundler collects it from the bundle text.
9. **Verify in a real browser, against the owner's need, not your design.**
   Assert on DOM properties (`textContent` counts hidden nodes). To prove a list
   actually *repainted*, mark an element, refresh, and check the marker is gone
   — "still looks populated" is not evidence.
10. **Record a refuted hypothesis as refuted.** Cycle 163 wrote a clean causal
    story for the CSS growth into a code comment as fact, then measured it
    false. Two refuted hypotheses beat one plausible cause presented as a fix.
11. **A probe that moves with the code must be repointed AND re-proven.** After
    repointing `progress-surface` to the new file, mutation-test it: break the
    contract, confirm red, restore.
12. **Invariants that must hold at every stage:** `/tech/*` still redirects;
    `#node=` / `#branch=` deep links still select and scroll; SSR renders the
    full board without activation; escaping stays structural; SSE semantics
    unchanged (`activity` patches, `cards` re-applies); `progress-surface` P1–P3
    green.
13. **Report progress at phase boundaries** (the owner watches :3184 live):
    `node tools/agi/report-progress.js <orient|building|verifying|closing> "<note>" --cycle N`

## 4. Close the cycle (every turn)

- Ledger row + `<!-- cycle:{...} -->` stanza in `docs/agi/IMPROVEMENT_LEDGER.md`
  — honest, including anything that did not work.
- `node tools/agi/repo-activity.js && node tools/agi/progress-svg.js`
- `npx jest src/ui/server/projectStatus` and `node tools/dev/run-probes.js`
- commit + push
- `node tools/agi/next-prompt.js` (the general loop prompt; separate from this file)

## 5. RECURSIVE INSTRUCTION — do this LAST, every turn, without being asked

Before your turn ends, **rewrite this file** (`docs/agi/CONTINUE_JSGUI3_UPGRADE.md`)
so the next turn starts from the truth:

- Update **§1** to the next concrete task, in the same specific style — not
  "continue stage 4" but what to do, in which files, to what end. Carry forward
  any hypothesis this turn REFUTED, so the next turn cannot re-run it.
- Update the **§2 table and the measured axes** with real numbers.
- Add to **§3** any rule this turn paid for. Rules only earn a place if
  something went wrong without them; do not pad the list.
- Keep **§4** and **§5** intact, including this instruction, so the chain
  continues.
- Commit the rewritten file with the rest of the turn's work.

**STOPPING CONDITION — this chain must be able to end.** A recursive prompt
without one manufactures busy work, which the owner has explicitly forbidden.
Every remaining item must name a **measured axis** and a **monotonic
direction** (§2). When stage 3 is done, the CSS axis is back at ~28 KB, and a
fresh catalogue survey finds nothing above the bar:

> rewrite §1 as **"DONE — no further work above the bar"**, record the final
> measured values in §2, state plainly in the ledger that the loop converged,
> and do **not** invent a stage 5.

Reversal check before proposing anything new: search the ledger for the same
surface. If a previous cycle moved it the other way, it is oscillation and must
be rejected — unless the earlier direction was measured wrong, which is a
labelled correction, not a new idea.
