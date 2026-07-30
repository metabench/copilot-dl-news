# jsgui3 migration report — project-status app (cycle 161, 2026-07-30)

**Owner directive:** "complete the migration. I want this all using idiomatic
jsgui3. If it's not clear what to do that, produce a report saying what blocks
that."

**Outcome: the migration COMPLETED.** Nothing blocked it outright. This report
records the design consequences and the deliberate deviations, so they are
decisions on the surface rather than workarounds discovered later — the exact
failure mode the owner called out when the string pages were exposed.

## What is true now

- **One render model.** `techPages.js` (≈1,000 lines of hand-built HTML
  template strings + inline scripts, accreted cycles 138–159) is deleted, with
  its test file. Every surface renders in the ONE jsgui3 app:
  `Server({Ctrl: Project_Status_Page, src_path_client_js: controls.js})` —
  SSR + bundled client + activation.
- **All controls, including SVG.** The research tree is an `svg`-tagged
  Control with `g`/`rect`/`text`/`line` child controls (the jsgui3-html charts
  idiom), nodes carry the `selectable` mixin, the detail panel and BEGIN
  RESEARCH are controls, and the migrated pieces — `Live_Strip` (SSE),
  `Settings_Control`, `Signal_Log` — are controls registered for reattachment.
- **Old URLs live on.** `/tech/{agi,tree,crawler,factory}` → 302 →
  `/#branch=<key>`; `/tech/node?id=X` → 302 → `/#node=X`. The hash router
  selects the node (through the mixin, so the panel and button follow) or
  scrolls to the branch band. Selection updates the hash, so every selection
  is a shareable deep link.
- **Per-node depth stayed.** YOUR REQUESTS renders from the signal history in
  the status payload; the LEDGER TRAIL is fetched per node from `/api/node`
  (ledger mining is too heavy to ride every status response).

## Architectural consequence (not a blocker — the shape of the framework)

`jsgui3-server`'s `Server({Ctrl})` publishes **one activated webpage per
server**: `new Webpage({ content: Ctrl })` → one `HTTP_Webpage_Publisher` →
one bundle, published once at boot. Four separately-SSR'd activated pages
would mean four publishers and four boot-time bundles (minutes of startup) or
four ports. The idiomatic resolution is what shipped: **one application
control, client-side view state, hash deep links** — the framework is
activation-centric, and this leans into it instead of around it.

## Deviations, deliberate, each revisitable

1. **No-JS walkability is gone.** The retired datalinks pages were readable
   with JavaScript disabled. The app SSRs the full board and hub, but node
   DETAIL now requires activation (panel + fetch). Cost accepted for one
   render model; restoring it would mean a server-rendered read-only export,
   which is a new feature, not a blocker.
2. **Settings scale uses CSS `zoom`, not rem.** The retired pages were
   rem-based and scaled the root font. The app's CSS is px-based throughout;
   converting ~200 declarations to rem was out of scope, so the 80–250%
   control applies `zoom` on the app root (persisted in the same
   `tp-settings` key). Same owner capability, different mechanism. Revisit =
   rem conversion sweep.
3. **The decorative SVG header art (branch scapes) was not ported.** It was
   ornament on the string pages; porting hand-drawn path art into controls is
   pure transcription work. `techArt.js` is retained (the favicon route uses
   it) so the art can return as controls if wanted.
4. **The modal is gone by design** — owner directive: selection + side panel,
   never a popup.
5. **selection-scope is bypassed.** The `selectable` mixin is used for state,
   class and events, but exactly-one-selected is coordinated at module level:
   the scope's `action_select_only` fallback walks `ctrl.siblings`, which is
   not reliably populated in this client-reattachment stack. If jsgui3's
   selection-scope is hardened for reattachment, the coordinator collapses to
   one line.
6. **`cards` SSE events now re-apply data in place** (through the app's
   `_apply`); a full self-refresh (scroll preserved) happens only when the
   tree's NODE SET changed, since the SSR'd board cannot restructure itself
   client-side. A future step could rebuild the board client-side from the
   fetched model — the layout function is pure and already shared.

## Verified (cycle 161, live browser)

302s from all five old URLs · hash-select on arrival (panel + trail + requests
populated) · SSE strip live · signal log rendering (9 rows) · settings
zoom 150% applied, persisted, reset · suites 31/31 · SSR smoke: 54 nodes,
strip, gear, log rows, 4 band anchors.
