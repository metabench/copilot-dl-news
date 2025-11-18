# 2025-11-15 · Client controls bundling notes

## Context
- Goal: ensure every client control used by `/urls` hydrations is part of the esbuild entry so Puppeteer/E2E bundles include the constructors.
- Need to inspect `scripts/build-ui-client.js` (esbuild pipeline) and compare with `jsgui3-server` examples.

## Findings
- `npm run ui:client-build` runs `scripts/build-ui-client.js`, which just calls esbuild on `src/ui/client/index.js` and emits `public/assets/ui-client.js`. The entry registers controls via `registerControlType`, but it only imports `UrlListingTableControl` and `UrlFilterToggleControl`, so any other registered control (e.g. `PagerButtonControl`) never reaches the bundle.
- The server renders three registered controls in `src/ui/render-url-table.js`: the listing table, filter toggle, and pager buttons. When the browser hydrates that markup it asks the `Client_Page_Context` for each constructor; because `pager_button` is not present in `context.map_Controls`, `public/assets/ui-client.js` logs “Missing context.map_Controls for type …” and Puppeteer never sees an activated toggle.
- The jsgui3-server example at `node_modules/jsgui3-server/examples/boxes/square_boxes_client.js` shows how they solve this: the client entry requires `jsgui3-client`, attaches each custom control to `jsgui.controls`, and exports that mutated instance. `examples/boxes/square_boxes.js` then points the server’s `disk_path_client_js` at the same file so `HTTP_Webpage_Publisher` bundles it, guaranteeing the server render and browser bundle share the same registry.

## Follow-ups
- Update `src/ui/client/index.js` so every control that calls `registerControlType` (currently UrlListingTable, UrlFilterToggle, PagerButton) is imported and re-registered against `jsguiClient` before activation.
- Consider deriving that list programmatically (scan `src/ui/controls` for `registerControlType` calls) or centralize the exports so future controls opt in automatically.
