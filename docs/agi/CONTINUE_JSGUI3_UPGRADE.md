# CONTINUE — jsgui3 upgrade of the project-status app (self-rewriting prompt)

**How to use:** paste this whole file as the prompt, or say
"follow docs/agi/CONTINUE_JSGUI3_UPGRADE.md". The last instruction in this file
tells you to rewrite this file before your turn ends, so the next turn starts
from the true state. Keep it accurate; it is the only handoff.

---

## 1. Your task THIS turn

**Stage 2 of [JSGUI3_CONTROL_ADOPTION_PLAN.md](JSGUI3_CONTROL_ADOPTION_PLAN.md):
one control per file, and retire the module globals.**

Concretely:

1. Split `src/ui/server/projectStatus/controls.js` (1,160 lines, 8 classes) into
   `src/ui/server/projectStatus/controls/{primitives,hub,work,tree,detail,app}/`,
   **one class per file**, matching jsgui3's own convention (230 control files,
   one class each). `controls/index.js` holds the client-reattachment
   registration and re-exports; `server.js`'s `src_path_client_js` must point at
   whatever remains the bundle entry.
2. Retire the module-level mutables — `TREE_SELECTED`, `TECH_INDEX`,
   `SIGNAL_HISTORY`, `NODE_CTRLS`, `PAGE_WIDGET`, `HASH_GUARD`, `SIGNAL_GRID`,
   `TRAIL_CACHE` — into control state or models passed down. Selection belongs
   to the board (or a selection scope); indexes belong to whoever renders them.
3. Kill the remaining **11** `document.createElement` / `innerHTML` sites, all
   in `Status_Widget._apply`'s list rebuilds, by giving those lists real
   controls and re-composing them (`clear()` + compose) instead of patching DOM.
4. Move each control's CSS next to it rather than one ~200-line string on
   `Status_Widget`.

Land it in slices that each stay green; commit per slice if that helps.

## 2. State of the work

| Stage | Status |
| --- | --- |
| 1 — adopt stock controls (Panel, Stat_Card, Progress_Bar, Data_Grid, Key_Value_Table, Chip, Button); recompose the detail panel from controls | **DONE** (cycle 162). Hand-built DOM 19 → 11. |
| 2 — one control per file; retire module globals; kill the last 11 DOM sites | **NEXT — this turn** |
| 3 — `Master_Detail` for the tree/detail split; adopt `tooltip`, `collapsible`, `keyboard_navigation`, `a11y` mixins; remove the proven-redundant hand-added `mousedown`; test whether the selection coordinator is still needed | pending |
| 4 — restore lost coverage: cycle 161 deleted 20 tests and shipped none; selection behaviour has **zero** tests | pending |

Background, read once if you lack context: [JSGUI3_MIGRATION_REPORT.md](JSGUI3_MIGRATION_REPORT.md)
(why one app, and the recorded deviations), [TECH_TREE_INTERFACE.md](TECH_TREE_INTERFACE.md)
(the owner⇄AI contract), and `src/ui/server/projectStatus/AGENTS.md`.

## 3. Working rules — each was learned expensively; do not relearn them

1. **Survey the catalogue before building anything.** jsgui3 ships **155
   exported controls** (`controls/controls.js`) and **48 mixins**
   (`control_mixins/`). Proposing to build something it already has has now
   happened twice in this project, once immediately after diagnosing that exact
   reflex. Check first; the build list is only what survives the survey.
2. **Verify a control before adopting it:** resolve it from `jsgui.controls`,
   SSR-smoke it with the *real* spec shape, and confirm it exists in **both**
   the server (`jsgui3-html`) and client (`jsgui3-client`) builds — a control
   that SSRs but cannot reattach breaks activation silently.
3. **Never retreat to hand-built DOM.** When an adopted control misbehaves,
   measure the lifecycle. `createElement` always works and is always available,
   which is precisely how the string pages were born.
4. **Known constraint:** controls composed INTO an already-activated parent get
   their markup inserted but never receive `activate()`; `Data_Grid` renders
   rows from `activate()` after browser reconstruction. Use `activateChildren()`
   (already in the file) after runtime composition.
5. **Verify in a real browser, against the owner's need, not your design.**
   Restart the detached server, load the page, assert on DOM properties (not
   `textContent` — it counts hidden nodes). A green test suite cannot see a
   wrong architecture.
6. **Invariants that must hold at every stage:** `/tech/*` still redirects;
   `#node=` / `#branch=` deep links still select and scroll; SSR renders the
   full board without activation; escaping stays structural (controls compose
   text, never concatenated HTML); SSE semantics unchanged (`activity` patches,
   `cards` re-applies); `progress-surface` P1–P3 green.
7. **Report progress at phase boundaries** (the owner watches :3184 live):
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
  "continue stage 3" but what to do, in which files, to what end.
- Update the **§2 table**: mark what genuinely landed, and add anything the
  turn discovered as new pending work.
- Add to **§3** any rule this turn paid for. Rules only earn a place if
  something went wrong without them; do not pad the list.
- Keep **§4** and **§5** intact, including this instruction, so the chain
  continues.
- Commit the rewritten file with the rest of the turn's work.

**STOPPING CONDITION — this chain must be able to end.** A recursive prompt
without one manufactures busy work, which the owner has explicitly forbidden.
Apply the convergence contract from
[TECH_TREE_INTERFACE.md](TECH_TREE_INTERFACE.md): every remaining item must name
a **measured axis** and a **monotonic direction** (hand-built DOM sites → 0;
controls-per-file → 1; module globals → 0; untested behaviours → 0; mixins
adopted where they replace hand-rolled code). When stages 2–4 are done and a
fresh catalogue survey finds nothing above the bar:

> rewrite §1 as **"DONE — no further work above the bar"**, record the final
> measured values in §2, state plainly in the ledger that the loop converged,
> and do **not** invent a stage 5.

Reversal check before proposing anything new: search the ledger for the same
surface. If a previous cycle moved it the other way, it is oscillation and must
be rejected — unless the earlier direction was measured wrong, which is a
labelled correction, not a new idea.
