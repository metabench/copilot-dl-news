# jsgui3 control adoption plan — project-status app

**Owner directive 2026-07-30:** the UI should be built from jsgui3 controls,
declarative where the framework allows, using mixins where possible. "Some,
such as Data_Grid, could be very useful."

**Method correction that produced this plan.** The previous "build ~28 controls"
list was written without reading the catalogue, and proposed inventing `Panel`,
`Chip`, `Badge` and `Button` — all of which jsgui3 already ships. The library
holds **155 exported controls and 48 mixins**. So the rule here is:
**survey first, and the build list is only what survives the survey.** Every
candidate below was checked against `controls/controls.js`, and the four
load-bearing ones were instantiated and SSR-rendered before being planned.

## Verified before planning (not assumed)

| Control | Verified |
| --- | --- |
| `Panel` | resolves; `new Panel({title})` SSRs |
| `Stat_Card` | resolves; `{value, label}` SSRs |
| `Key_Value_Table` | resolves; `{data: {k: v}}` SSRs |
| `Data_Grid` | resolves; `{columns, rows}` SSRs |
| `Master_Detail`, `Progress_Bar`, `Modal`, `Chip`, `Button`, `Activity_Feed`, `Scroll_View`, `Tooltip` | resolve from `jsgui.controls` |

`Data_Grid` spec (read from source): `columns`, `data_source` (array | async fn
| adapter returning `{rows, total_count}`), `rows`, `sort_state`, `filters`,
`page`, `page_size`, `selection`, `selection_mode`, `empty_text`,
`persist_activation_state`.

`Master_Detail` spec: `items`, `selected_id`, `master_renderer`,
`detail_renderer`, `layout_mode` (auto/tablet/phone), breakpoints,
`phone_stacked` + back button, `touch_item_height`, `aria_label`.

## What is NOT adopted, and why

`Tree_View` / `Tree` / `File_Tree` are **nested expand/collapse lists**
(chevrons, `children`, `expanded`) — a file-tree idiom. The tech tree is a DAG
laid out as positioned SVG with cross-band prerequisite edges. Tree_View does
no graph layout, so `Tech_Tree_Board` / `Tech_Tree_Node` / `Tree_Edge` /
`Band_Label` stay custom. Its `select`/`expand` event contract is worth
copying, and it remains a candidate for an alternative list-navigation of the
same data later.

## Adopt vs build

**ADOPT (existing controls replace hand-rolled code)**

| Hand-rolled today | Adopt |
| --- | --- |
| `ps-panel` + `h2`, ×6 | `Panel` (`title`, `variant`, `collapsible`) |
| stat chips (CHIP_DEFS) | `Stat_Card` |
| XP bar | `Progress_Bar` |
| SIGNAL LOG list | `Data_Grid` |
| LEDGER TRAIL rows (createElement) | `Data_Grid` |
| detail panel field lists | `Key_Value_Table` |
| prereq chips | `Chip` |
| BEGIN RESEARCH | `Button` |
| settings dialog | `Modal` |
| board scroll box | `Scroll_View` |
| SVG `<title>` hovers | `Tooltip` mixin |
| collapsible prelim | `collapsible` mixin / `Accordion` |
| tree + detail layout | `Master_Detail` (brings responsive + a11y) |
| — (absent today) | `keyboard_navigation`, `a11y` mixins |

**BUILD (nothing in the library covers these — domain concepts)**

`Tech_Tree_Board`, `Tech_Tree_Node` (exist), `Tree_Edge`, `Band_Label`,
`Branch_Card`, `Road_Card`, `Player_Bar`, `Module_Card`.

## Stages

Each stage ends green: suites + probes + a real-browser check, committed
separately so any stage can be reverted alone.

- **Stage 1 — kill the hand-built DOM (this cycle).** `Data_Grid` for the
  signal log and ledger trail; `Key_Value_Table` for the detail panel's field
  block; `Panel` for the six panels; `Stat_Card` for the chips;
  `Progress_Bar` for the XP bar. Removes the 19 `createElement`/`innerHTML`
  sites — the ones that are *structurally* the old string-page habit.
- **Stage 2 — file split.** One control per file under
  `controls/{primitives,hub,work,tree,detail,app}/`, following jsgui3's own
  230-files/one-class convention; `index.js` holds registration. Retire the
  6 module-level globals into control state.
- **Stage 3 — Master_Detail + mixins.** Re-seat the tree/detail split on
  `Master_Detail`; add `tooltip`, `collapsible`, `keyboard_navigation`, `a11y`.
  Remove the redundant hand-added `mousedown` (proven redundant: the mixin's
  own handler fires — `defaultPrevented === true`) and test whether the
  module-level selection coordinator is still needed.
- **Stage 4 — restore lost coverage.** The c161 migration deleted 20 tests and
  shipped zero replacements; selection behaviour has none. Add control-level
  tests plus a browser check for select → panel → armed button.

## Invariants (must hold at every stage)

1. `/tech/*` URLs keep redirecting; `#node=` / `#branch=` deep links keep working.
2. SSR renders the full board (no activation required to see the tree).
3. Escaping stays structural — controls compose text, never string-concatenated HTML.
4. SSE semantics unchanged: `activity` patches, `cards` re-applies.
5. `progress-surface` P1–P3 stay green.
