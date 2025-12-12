# Plan – Art Playground: Idiomatic Activation Refactor

## Objective
Refactor Art Playground controls to use idiomatic jsgui3 activation patterns (SSR + client activation), simplify client boot, and keep check + E2E green.

## Done When
- [x] Controls self-hydrate internal DOM refs during `activate()` (no client-side patching of internals).
- [x] Client boot is simplified to instantiating top-level controls + calling `activate()`.
- [x] Art Playground check script passes.
- [x] Art Playground Puppeteer E2E passes.
- [x] Work is documented in `SESSION_SUMMARY.md` and `WORKING_NOTES.md`.

## Change Set (initial sketch)
- src/ui/server/artPlayground/client.js
- src/ui/server/artPlayground/isomorphic/controls/ToolbarControl.js
- src/ui/server/artPlayground/isomorphic/controls/CanvasControl.js
- docs/sessions/2025-12-11-art-playground-idiomatic-activation/*

## Risks & Mitigations
- Risk: hydration/activation breaks because `compose()` was skipped.
	- Mitigation: all controls that depend on cached child references rebuild them from `this.dom.el` during `activate()`.
- Risk: event handlers bind multiple times.
	- Mitigation: keep `__active` guards; avoid per-activation rebinds.

## Tests / Validation
- `node src/ui/server/artPlayground/checks/art-playground.check.js`
- `npm run test:by-path tests/ui/e2e/art-playground.puppeteer.e2e.test.js`
