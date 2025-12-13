# Plan – Art Splayground: color palette + selection

## Objective
Improve the art-splayground colour palette and selection UX in a consistent, reusable way

## Done When
- [x] Art Playground palette tokens align with WLILO (leather/obsidian/gold/highlight) and remain readable.
- [x] Fill/stroke colour selection is easier than typing hex (palette UI + clear selected state).
- [x] Palette interactions feed the existing undo/redo command stack (no duplicate/no-op commands).
- [x] Selection outline/handles look intentional (WLILO-friendly highlight/glow) without breaking interactions.
- [x] Checks pass: `node src/ui/server/artPlayground/checks/art-playground.check.js`.
- [x] E2E passes: `npm run test:by-path tests/ui/e2e/art-playground.puppeteer.e2e.test.js`.
- [x] Follow-ups recorded in `FOLLOW_UPS.md` and outcomes summarized in `SESSION_SUMMARY.md`.

## Change Set (initial sketch)
- UI (primary)
	- `src/ui/server/artPlayground/public/art-playground.css`
	- `src/ui/server/artPlayground/isomorphic/controls/PropertiesPanelControl.js`
	- `src/ui/server/artPlayground/isomorphic/controls/CanvasControl.js` (only if default component colors/palette constants are centralized)
	- `src/ui/server/artPlayground/isomorphic/controls/SelectionHandlesControl.js` (if selection UI needs additional hooks)
- Tests / checks
	- `src/ui/server/artPlayground/checks/art-playground.check.js` (assert palette UI exists)
	- `tests/ui/e2e/art-playground.puppeteer.e2e.test.js` (extend with palette interaction if feasible)

## Scope Notes
- Prefer CSS variables/design tokens over hard-coded hex in JS.
- Keep control count lean; don’t introduce heavyweight new controls unless needed.
- Favor simple clickable swatches over complex pickers; avoid dependencies.

## Risks & Mitigations
- Risk: changing tokens breaks contrast/readability → Mitigation: keep WLILO reference values; validate in screenshots/E2E.
- Risk: palette UI emits duplicate property-change events (undo spam) → Mitigation: reuse existing no-op/duplicate guards in `ArtPlaygroundAppControl` and `PropertiesPanelControl`.
- Risk: selection styling interferes with pointer events → Mitigation: keep selection outline pointer-events none; only handles pointer-events all.

## Tests / Validation
- `node src/ui/server/artPlayground/checks/art-playground.check.js`
- `npm run test:by-path tests/ui/e2e/art-playground.puppeteer.e2e.test.js`
- Optional (if touch resize UI): `npm run test:by-path tests/ui/e2e/art-playground-resize.puppeteer.e2e.test.js` (requires server at `http://localhost:4950`)
