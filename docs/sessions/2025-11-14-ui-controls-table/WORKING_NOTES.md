# Working Notes

## 2025-11-14
- Session initialized. Plan focuses on introducing `src/ui/controls` and an HTML rendering script backed by `jsgui3-html`.
- Ran `node tools/dev/md-scan.js --dir docs/sessions --search "jsgui" --json` and "UI controls"; no prior sessions mention `jsgui3-html`, so we will document fresh patterns here.
- Skimmed `node_modules/jsgui3-html/README.md`, `html.js`, and `html-core/html-core.js` to confirm that:
	- Controls extend `jsgui.Control` (alias of `Data_Model_View_Model_Control`) and can be instantiated per tag via auto-generated helpers like `new jsgui.table({ context })` or subclass definitions.
	- Rendering is via `control.all_html_render()` (falling back to string for primitive controls) once a `Page_Context` exists.
	- CSS classes/styles attach through `control.add_class` and `control.style`, while child controls live under `control.content`.
- Reviewed `src/db/sqlite/v1/SQLiteNewsDatabase` and `StatementManager` plus UI query helpers; no modern helper exposed for listing URLs, so we plan to add a `selectInitialUrls` query under `src/db/sqlite/v1/queries/ui/` that returns normalized rows from `urls` + `latest_fetch`.
- Confirmed `find-place-hubs` and other tools resolve DB paths via `findProjectRoot` with `data/news.db` default—will reuse the same pattern inside the rendering script.
- Added `src/ui/controls/Table.js` (table/row/cell controls) plus `src/db/sqlite/v1/queries/ui/urlListingNormalized.js` for normalized URL listings, then authored `src/ui/render-url-table.js` which outputs a styled HTML snapshot via jsgui controls.
- Verified the script with `node src/ui/render-url-table.js --limit 5 --output tmp/url-preview.html`; it generated `tmp/url-preview.html` using the current `data/news.db`.
