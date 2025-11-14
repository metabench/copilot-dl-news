# Working Notes – 2025-11-14 jsgui transform fix

## 2025-11-14
- Initialized session to track the `each_source_dest_pixels_resized` ReferenceError investigation.
- Confirmed `vendor/jsgui3-client/node_modules/jsgui3-gfx-core/core/ta-math/transform.js` relied on implicit globals for `each_source_dest_pixels_resized*` helpers, which breaks under esbuild strict mode.
- Declared both helper bindings with `const` so the module exports them explicitly, preventing the browser from seeing undefined references.
- Rebuilt the bundle via `npm run ui:client-build`; esbuild completed and regenerated `public/assets/ui-client.js` without errors.
- Found that `htmlparser` tried to read `this.Tautologistics`, which is undefined under strict bundler runtime, so switched the bootstrap to use `globalThis`/fallback roots before wiring exports.
- Ran another `npm run ui:client-build` after the htmlparser guard patch so the new bundle reloads the corrected parser module.
- Added `scripts/ui/puppeteer-console.js` to spin up the URLs server, capture the page's console events, and wait 1 s so we can inspect what the browser reports in the terminal.
- `vendor/jsgui3-client/client.js` no longer relies on implicit globals: the module now registers `jsgui` on `globalThis` and declares `page_context` explicitly, letting the bundle run under strict mode (next blocker is `Data_Model_View_Model_Control` expecting a defined `model` that emits `on`).
