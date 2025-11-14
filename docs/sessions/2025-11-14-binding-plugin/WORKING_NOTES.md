# Working Notes – 2025-11-14 binding-plugin

## 2025-11-14
- Stand up session folder, record plan.
- Confirm regression via `node src/ui/test/pager-button-state.js` → all buttons MISSING because rendered nav shows `data-kind="kind"` for every button.
- Inspect nav snippet via `renderPaginationSnapshot` to capture exact HTML (see console log in terminal history) – `pager-button--kind-kind` highlights binding failure.
- Hypothesis: `ensureBindingViewModel` builds a scalar `Data_Value` (no `.set`) when Control view data exists but no `.model`; need to enforce Data_Object view models before binding.
- Next: adjust plugin to promote scalar models into Data_Object instances and rerun snapshot script.
- Updated `ensureDataModel`/`ensureViewModel` to replace placeholder `Data_Value` instances with real `Data_Object` models before applying defaults/attributes.
- Re-ran `node src/ui/test/pager-button-state.js` → PASS for first/middle/last scenarios, confirming SSR output now exposes correct `data-kind` and disabled states.
- `npm run test:by-path tests/ui/binding-plugin.test.js` completes without failures.
- Added `src/ui/client/index.js` as the browser entry that loads `jsgui3-client`, installs the binding plugin by default, and exposes `window.CopilotBindingPlugin` hooks for opt-out/inspection (`data-binding-plugin="off"` on the script tag or `window.CopilotBindingPlugin = { enabled: false }` before loading disables it).
- Introduced `scripts/build-ui-client.js` (`npm run ui:client-build`) to bundle the new entry with esbuild into `public/assets/ui-client.js`; respects `NODE_ENV` for minification and `BINDING_PLUGIN_ENABLED=false` to emit a bundle that skips plugin installation.
- Updated `renderHtml` + URL Express server to emit a `<script src="/assets/ui-client.js" defer>` control for every rendered page and mounted `express.static` on `public/`, so the built bundle downloads automatically alongside the server-rendered HTML.
