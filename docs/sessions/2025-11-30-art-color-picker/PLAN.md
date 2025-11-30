# Plan – Art Playground Color Picker

## Objective
Prototype improved color selection in lab then integrate into Art Playground

## Done When
- [ ] Art Playground renders with three rectangles and the new color selector wired through Toolbar → Canvas.
- [ ] Research lab hosts a reusable color selector control with documentation + sanity check script.
- [ ] jsgui3 event/pixel validations or screenshots capture the selector behavior.
- [ ] Tests/notes recorded in `WORKING_NOTES.md`, and next steps captured in `FOLLOW_UPS.md`.

## Change Set (initial sketch)
- `src/jsgui3-lab/controls/` – add ColorSelectorControl + docs/readme updates.
- `src/jsgui3-lab/checks/` – harness/check script for selector.
- `src/ui/server/artPlayground/isomorphic/controls/ToolbarControl.js` – embed selector UI.
- `src/ui/server/artPlayground/isomorphic/controls/CanvasControl.js` – honor user-selected colors.
- `public` / CSS bundles – styling tokens for palette + swatches.

## Risks & Mitigations
- Palette UI may break toolbar layout → iterate in lab first, capture screenshot before shipping.
- Event wiring between toolbar + canvas might desync → add ActivationHarness logging + tests to confirm events.
- Client bundle regression risk → run Art Playground check + manual verification in browser.

## Tests / Validation
- `node src/jsgui3-lab/checks/colorSelector.check.js` (new) for control sanity.
- `node src/ui/server/checks/artPlayground.check.js` (or existing) to render with selector.
- Manual Art Playground session: add 3 rectangles, change colors, confirm screenshot/logs.
