# Working Notes: 2025-11-20 Client Activation

Canonical reference: see [docs/guides/JSGUI3_UI_ARCHITECTURE_GUIDE.md](../../guides/JSGUI3_UI_ARCHITECTURE_GUIDE.md#client-side-activation-flow-critical) for the consolidated activation workflow and the `map_controls` vs `map_Controls` distinction.

## 2025-11-20 09:00
- Created session folder + plan targeting client activation wiring.
- Next: catalog existing client bundle hooks (js-scan) and plot implementation steps.

## 2025-11-20 09:20
- Ran `node tools/dev/js-scan.js --deps-of src/ui/client/index.js --json --ai-mode` to map the controls + binding modules feeding the client bundle.
- Executed `npm run test:by-path tests/ui/e2e/url-filter-toggle.puppeteer.e2e.test.js`; Puppeteer timed out waiting for `/api/urls` because the browser console spammed `Missing context.map_Controls ...` (no `[copilot] context.map_Controls keys` log fired), confirming our injection isn’t running yet.
- Next: patch `src/ui/client/index.js` so `injectControlsIntoContext` runs during `activate` and eliminate the duplicate `ensurePreActivateHook()` call.
