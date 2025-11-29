# Follow Ups – Fix gazetteer context menu events

- Reinstall esbuild for the active platform (or run `npm ci` inside WSL) so `node scripts/build-geo-import-client.js` works without esbuild-wasm; regenerate the bundle with the standard es2019 target to trim size.
- Manually verify in the browser: right-click a non-new database entry shows the context menu; outside click or Escape hides it; “Open in Explorer” hits `/api/geo-import/open-in-explorer`.
