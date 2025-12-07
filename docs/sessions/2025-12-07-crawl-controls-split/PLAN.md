# Plan – Split crawl widget controls into modules

## Objective
Modularize crawl widget controls for reuse and SSR

## Done When
- [ ] Controls live in separate modules (title, type selector, URL selector, buttons, progress, log viewer) and export constructors.
- [ ] Factory (if still used) imports the split controls cleanly without duplicate exports.
- [ ] Renderer builds successfully and widget boots with no console errors.
- [ ] Notes/tests captured in WORKING_NOTES and any follow-ups in FOLLOW_UPS.

## Change Set (initial sketch)
- `crawl-widget/ui/controls/*.js` — new modules for each substantial control.
- `crawl-widget/ui/crawlWidgetControlsFactory.js` — slim aggregator/wiring to imported controls.
- `crawl-widget/renderer.src.js` (and generated bundle) — updated imports if factory path changes.

## Risks & Mitigations
- Import path regressions when bundling → keep CommonJS requires aligned with esbuild inputs; run bundle rebuild.
- Activation/context wiring differences across modules → preserve helper utilities (e.g., `getBodyControl`) in a shared helper file to avoid duplication.
- Bundle drift between src and public → rebuild bundle and note in WORKING_NOTES.

## Tests / Validation
- Rebuild renderer bundle: `npx esbuild renderer.src.js --bundle --outfile=public/renderer.bundle.js --format=iife --platform=browser --external:electron`.
- Smoke run: launch widget in Electron context (or existing check) to ensure selectors, dropdowns, and buttons respond without errors (manual/observational).
