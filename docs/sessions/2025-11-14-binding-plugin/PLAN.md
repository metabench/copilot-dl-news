# Plan: binding-plugin-stability

**Objective**: Fix the binding plugin + `PagerButtonControl` so server-rendered pagination exposes correct attributes/classes and the binding tests guard against regressions.

**Done when**:
- Pager buttons render `data-kind` + disabled state correctly for first/middle/last scenarios.
- `bindingPlugin.ensure*Model` guarantees Data_Object models and no longer emits scalar-only view models.
- Updated Jest + pager-state script run green.
- Session docs and follow-ups capture any remaining binding design debt.

**Change set**:
- `src/ui/jsgui/bindingPlugin.js`
- `src/ui/controls/PagerButton.js`
- `src/ui/test/pager-button-state.js` (expectations only if needed)
- `tests/ui/binding-plugin.test.js` (extend coverage if feasible)
- Session docs hub + folder notes.

**Risks / Assumptions**:
- Replacing existing Data_Value models with Data_Object must not break other controls relying on scalar view data; need to gate via capability checks.
- Pager buttons rely on SSR only (no client activation), so attribute binding must run synchronously during render.
- No direct DB impact; main risk is regressing existing binding consumers.

**Tests**:
- `node src/ui/test/pager-button-state.js`
- `npm run test:by-path tests/ui/binding-plugin.test.js`

**Docs**:
- Update this session folder as work progresses.
- Append a short entry to `docs/sessions/SESSIONS_HUB.md` referencing this session.
