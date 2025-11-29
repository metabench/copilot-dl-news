# Working Notes – Fix gazetteer context menu events

- 2025-11-28 — Session created via CLI. Add incremental notes here.
- Initial discovery: geo-import client targets `.database-selector`, but `DatabaseSelector` renders `.db-selector-window` with `data-jsgui-control="database_selector"`, so the selector is null and no database handlers/context menu wiring run. Context menu code in `DatabaseSelector` also never activates in the browser because no jsgui client context is present.
- Implemented fixes: added `.database-selector` class to `DatabaseSelector` and switched its context menu closing logic to jsgui body control events (fallback to DOM only if needed). Geo-import client now imports `jsgui3-client`, targets `[data-jsgui-control="database_selector"]`/`.db-selector-window`, and wires a right-click context menu with show/hide + outside/Escape handling via the body control.
- Build note: local esbuild binary is Windows-only; used `npx esbuild-wasm@0.21.5 ... --target=es2020` to rebuild `public/assets/geo-import.js` after code changes.
