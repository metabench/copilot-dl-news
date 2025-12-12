# JSGUI3 Debugging Guide

This guide is a concise playbook for debugging jsgui3 controls, activation (called “hydration” in some other frameworks), and UI servers in this repo. It aligns with AGENTS.md and the UI Singularity workflow.

## Core Principles
- **Session-first, plan-first.** Create a session folder before work; note commands in `WORKING_NOTES.md`.
- **js-scan/js-edit-first.** Use `node tools/dev/js-scan.js --what-imports <control>` to map usage before editing; prefer batch edits via js-edit.
- **Safe server lifecycle.** Never run servers ad-hoc; use `--check` or `--detached` + `--stop/--status`.
- **Checks beside controls.** Every control/renderer gets a tiny `checks/*.check.js` script to render or assert HTML.
- **Isomorphic awareness.** Always consider server render + client activation paths.

## Quick Checklist (before debugging)
- Server start/stop flow understood? (`--check`, `--detached`, `--stop`, `--status`)
- Client bundle up-to-date? (`node <server>/build-client.js`)
- Controls registered on client? (`context.map_Controls[...] = ControlClass`)
- Activation logs enabled? (`page.on('console', ...)` in tests; temporary `console.log` in client activation)
- Pointer events enabled where needed? (e.g., `CanvasControl` element layer)

## Server-Side Debugging
- **Dry-run render:** `node src/ui/server/<app>/server.js --check` to validate composition and HTML length.
- **Detached mode (if available):** `node src/ui/server/<app>/server.js --stop; node ... --detached --port <p>; node ... --status`.
- **Port selection:** Allow `--port <n>` and `PORT` env to avoid `EADDRINUSE` during tests.
- **Unhandled errors:** Add `process.on('unhandledRejection/uncaughtException')` logging and exit non-zero on listen errors.
- **Log composition:** Temporary logs inside `compose()` for key controls (rendered layers, positions).

## Client-Side Debugging
- **Early globals:** Expose `window.jsgui` (and `window.page` if hydrated) early for tests/console.
- **Control registration:** Ensure `context.map_Controls` contains all controls (`canvas_control`, `draggable_control`, etc.) before `pre_activate`.
- **Activation tracing:** Log `pre_activate`/`activate` control counts and IDs; watch for missing `__ctrl` on DOM nodes.
- **Fallbacks:** When activation wiring is unreliable, add temporary fallback event handlers (e.g., manual drag listeners) but log and remove after root cause is fixed.
- **Console capture:** In Puppeteer tests, capture page console and errors:
  ```js
  page.on('console', msg => { console.log('PAGE LOG:', ...msg.args().map(a => a.jsonValue())) });
  page.on('pageerror', err => console.error('PAGE ERROR:', err.message));
  ```

## Interaction Debugging (Drag/Resize/Connectors)
- **Pointer events:** Verify container layers allow pointer events (e.g., `pointerEvents: auto`).
- **Position state:** Controls should keep `position`/`pos` in sync; provide setters/getters for mixins that expect `pos`.
- **Snap-to-grid:** When using Canvas, confirm snapping doesn’t overwrite drag state; log `drag-start`/`drag-end` events with positions.
- **Testing movement:** If synthetic mouse drag fails, call control APIs (`moveBy`) as a fallback to assert state updates, but investigate why events failed (often missing `__ctrl` binding).

## Puppeteer / E2E Patterns
- **Free port per run:** Pick a port with `net.createServer` and pass `--port`; kill processes on timeouts.
- **Server start timeout:** Reject after ~10–15s if no “listening” log; ensure server process kills on timeout.
- **Wait for selectors, not just globals:** `await page.waitForSelector('.draggable-control', { timeout: 10000 });`
- **Diagnostics in tests:** Log activation state (has jsgui, page, control), bounding boxes, deltas, fallback usage.
- **Bundle rebuild:** Before UI E2E, run the app’s `build-client.js` if client code changed.

## Checks (Lightweight Verification)
- **Server check:** Small script calling `Page` + `all_html_render()`; assert HTML length > 0.
- **Client check (future):** Script that loads HTML in JSDOM/puppeteer-lite to assert activation sets `window.jsgui` and binds controls.
- **Control check:** `node src/ui/server/<area>/checks/<control>.check.js` to render markup and print critical attributes/classes.

## Common Failure Modes & Fixes
- **EADDRINUSE:** Add port arg/env; implement `--stop`/`--status`; ensure tests pick random ports.
- **Missing `__ctrl` after hydration:** Ensure control registration, matching `__type_name`, and correct `context.map_Controls` keys; verify client bundle is current.
- **Drag not moving:** Pointer events blocked; mixin expecting `pos`; no bounds; fallback drag handler or ensure `dragable` mixin runs in `activate()`.
- **Esbuild platform mismatch:** Run `npm rebuild esbuild` when switching OS/WSL; then rebuild bundles.
- **Headless Chrome missing:** `npx puppeteer browsers install chrome`.

## Example Commands
- Map usages: `node tools/dev/js-scan.js --what-imports src/ui/server/shared/isomorphic/controls/interactive/DraggableControl.js --json`
- Build bundle: `node src/ui/server/wysiwyg-demo/build-client.js`
- Server check: `node src/ui/server/wysiwyg-demo/server.js --check`
- Run E2E: `npm run test:by-path tests/ui/e2e/wysiwyg-demo.puppeteer.e2e.test.js`

## Follow-up Improvements
- Add a client-side activation check script for the WYSIWYG demo to avoid full Puppeteer for smoke tests.
- Reduce hydration console noise once activation is reliable; remove temporary fallback drag handlers.
- Extend jsgui3 activation doc (`docs/guides/JSGUI3_UI_ARCHITECTURE_GUIDE.md`) with a section summarizing these debugging steps.
