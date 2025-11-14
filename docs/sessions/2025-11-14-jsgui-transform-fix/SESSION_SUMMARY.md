# Session Summary – 2025-11-14 jsgui transform fix

- Patched `vendor/jsgui3-client/node_modules/jsgui3-gfx-core/core/ta-math/transform.js` so the `each_source_dest_pixels_resized*` helpers are declared with `const` instead of implicit globals, allowing esbuild’s strict-mode bundle to access them safely.
- Rebuilt the browser bundle via `npm run ui:client-build`, producing an updated `public/assets/ui-client.js` without warnings.
- Documented the fix and left a follow-up to keep an eye on future upstream refreshes of the vendored package.
- Updated `node_modules/htmlparser/lib/htmlparser.js` to resolve `Tautologistics` via `globalThis`/fallback before assigning exports so the same bundle can run under strict-mode without `this` being undefined.
- Added `scripts/ui/puppeteer-console.js`, which starts the URL table server, streams the page console, waits 1 s, and reports the logs in the terminal for quick verification (the only remaining error is the expected favicon 404).
- Hardened `vendor/jsgui3-client/client.js` by explicitly registering `jsgui` on `globalThis` (rather than assigning to an implicit global) and by declaring `page_context`; the bundle now gets past those ReferenceErrors, revealing the next runtime issue inside `Data_Model_View_Model_Control`.
