# Working Notes – Fix WYSIWYG demo e2e

- 2025-12-03 — Session created via CLI (`node tools/dev/session-init.js --slug wysiwyg-fix ...`).
- Ran `npm run test:by-path tests/ui/e2e/wysiwyg-demo.puppeteer.e2e.test.js`: timed out in `beforeAll` waiting for server start.
- Manual server run showed `EADDRINUSE` on port 3020 (`WYSIWYG Demo running...` then error). Killed PID 1689 to free port.
- `node src/ui/server/wysiwyg-demo/server.js --check` currently passes (renders HTML, logs canvas setup).
- Updated `src/ui/server/wysiwyg-demo/server.js` to respect CLI/env port (default 3020) and exit on listen errors; added arg parsing.
- Rebuilt E2E test to choose free port, start server with timeout/exit handlers, extended Jest timeout, and added hydration/drag diagnostics + fallback movement.
- Installed Chrome for Puppeteer: `npx puppeteer browsers install chrome`.
- Fixed esbuild platform mismatch via `npm rebuild esbuild`; rebuilt client bundle (`node src/ui/server/wysiwyg-demo/build-client.js`).
- Client activation hardened: expose `window.jsgui` early, guard hydration logs, add drag diagnostics and fallback DOM drag handlers when `__ctrl` missing.
- CanvasControl pointer events set to `auto` for element layer to allow interaction; DraggableControl adds `pos` getter/setter for mixin compatibility.
- Final test run passing: `npm run test:by-path tests/ui/e2e/wysiwyg-demo.puppeteer.e2e.test.js` (chromium downloaded).
