# Working Notes – Fix Design Studio client errors

- 2025-11-29 — Session created via CLI. Add incremental notes here.
- 2025-11-29 — Inspected `src/ui/server/designStudio/client.js`; it bundles `jsgui3-client`, exposes it on `window`, and manually instantiates `jsgui.Page_Context` plus controls. This differs from Docs Viewer which piggybacks on `jsguiClient.Client_Page_Context`.
- 2025-11-29 — `DesignNavControl` pulls `String_Control` from `require("../jsgui")`. The Design Studio-specific resolver expects a pre-populated `window.jsgui3`, so esbuild ends up exporting `undefined` when bundling, causing the reported `String_Control` error.
- 2025-11-29 — Current isomorphic resolver (`designStudio/isomorphic/jsgui.js`) checks `window` first and never requires `jsgui3-client`, so client bundles run before `window.jsgui3` is set. Need to switch it to the shared resolver pattern used elsewhere (`shared/isomorphic/jsgui.js`).
- 2025-11-29 — jsgui3-client auto-creates a global `page_context` during `window.load`, but strict-mode bundles throw because no `window.page_context` property exists. Need to declare `window.page_context` (or stash it on `globalThis`) before the library runs to prevent the `ReferenceError` seen in Design Studio.
- 2025-11-29 — Rewired `designStudio/isomorphic/jsgui.js` to import the shared resolver (ensures `String_Control` and other helpers exist everywhere). Added a `window.page_context` guard + `Client_Page_Context` bootstrapper in the client entry, rebuilt via `npm run ui:design:build` (✅) so the updated bundle lands in `src/ui/server/designStudio/public/design-studio-client.js`.

## Continuation: Console Capture Tool & Final Verification

- 2025-11-29 — Enhanced `tools/dev/ui-console-capture.js` with better options: `--errors-only`, `--wait-for-idle`, `--screenshot`, `--json`, proper server readiness detection via HTTP polling, and prettier output formatting.
- 2025-11-29 — Used the tool to verify Design Studio: `node tools/dev/ui-console-capture.js --server=src/ui/server/designStudio/server.js --url=http://localhost:4800 --errors-only`
- 2025-11-29 — Initial capture confirmed: ✅ `String_Control` and `page_context` errors are FIXED (no longer appear)
- 2025-11-29 — Found remaining issue: favicon.ico 404 error. Added route handler in server.js: `app.get("/favicon.ico", (req, res) => res.status(204).end());`
- 2025-11-29 — Final verification: **0 errors, 0 warnings** — Design Studio console is now clean!

## Separate Scrollbars Implementation (VS Code Style)

- 2025-11-29 — Implemented independent scrolling for nav and main content panels, like VS Code:
  - Set `html, body { height: 100%; overflow: hidden; }` to prevent page-level scrolling
  - Added `min-height: 0` to all flex containers (`.design-app`, `.split-layout`, `.split-layout__panel`) to allow flex children to shrink below content height
  - Nav tree (`.design-nav__tree`) already had `overflow-y: auto`
  - Content column (`.design-app__content-column`) has `overflow-y: auto; overflow-x: hidden`
  - Updated scrollbar styling to be VS Code-like: 10px width, rounded thumb with border, gold highlight on hover
- 2025-11-29 — Verified with console capture: 0 errors, screenshot saved to `tmp/design-studio-scrollbars.png`
