# Working Notes – Art Playground: Idiomatic Activation Refactor

- 2025-12-11 — Session created via CLI.

Goal
- Remove brittle client-side “hydration patching” of internal fields (e.g. `_buttons`, `_svgWrapper`, `_selectionHandles`).
- Make each control responsible for reconnecting DOM references during `activate()` when constructed with `{ el }`.

Edits
- src/ui/server/artPlayground/isomorphic/controls/ToolbarControl.js
	- `activate()` now reconstructs `_buttons` from `button[data-action]` when `compose()` was skipped.
- src/ui/server/artPlayground/isomorphic/controls/CanvasControl.js
	- `activate()` now reconnects `_svgWrapper` and ensures `SelectionHandlesControl` exists (reuses `__jsgui_control` or instantiates).
	- `_setupEvents()` now guards against missing DOM/document.
- src/ui/server/artPlayground/client.js
	- Simplified to: create app + hydrate top-level controls + call `activate()`.
	- Removed manual patching of toolbar buttons and canvas internals.

Validation
- `node src/ui/server/artPlayground/checks/art-playground.check.js`
	- Result: ✅ All 63 checks passed
- `npm run test:by-path tests/ui/e2e/art-playground.puppeteer.e2e.test.js`
	- Result: 19 passed, 0 failed
