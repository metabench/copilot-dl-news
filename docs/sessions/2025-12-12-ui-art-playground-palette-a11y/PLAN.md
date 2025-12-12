# Plan: art-playground-palette-a11y (2025-12-12)

Objective: Add keyboard + ARIA accessibility for Fill/Stroke swatch palettes in Art Playground without changing click behavior or undo/redo semantics.

Done when:
- Fill + Stroke palettes render with `role="radiogroup"` and an accessible label.
- Swatches render with `role="radio"`, `aria-checked` synced to selection, and roving `tabindex`.
- Arrow keys move focus within a palette; Enter/Space activates the focused swatch via the same code path as click.
- Visible keyboard focus styling added via `:focus-visible`.
- Validations pass:
  - `node src/ui/server/artPlayground/checks/art-playground.check.js`
  - `npm run test:by-path tests/ui/e2e/art-playground.puppeteer.e2e.test.js`

Change set (expected):
- src/ui/server/artPlayground/isomorphic/controls/PropertiesPanelControl.js
- src/ui/server/artPlayground/public/art-playground.css (or equivalent)
- src/ui/server/artPlayground/checks/art-playground.check.js
- tests/ui/e2e/art-playground.puppeteer.e2e.test.js
