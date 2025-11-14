# Plan: ui-controls-table
Objective: Render the first 1000 URLs from the crawler DB into a styled HTML table using new jsgui3-html based controls under src/ui/controls.

Done when:
- src/ui/controls contains reusable table/row/cell control modules built on jsgui3-html patterns.
- A script under src/ui renders the first 1000 DB URLs into HTML via those controls with pleasant CSS.
- Styling matches the "nice" requirement (basic typography, zebra stripes, responsive width).
- Session docs updated with discoveries and follow-ups, and instructions adhered to (js-scan discovery, dry-run where applicable).

Change set: src/ui/** (new directories and files), possibly docs/sessions updates, package scripts if needed for running the renderer.

Risks/assumptions:
- Need to understand existing DB access patterns; ensure we use official adapters (likely better-sqlite3) without duplicating logic.
- jsgui3-html API unfamiliar; must review node_modules implementation for control instantiation.
- Performance when pulling 1000 rows must be acceptable; ensure DB path and schema accessible in script environment.

Tests: Manual execution of the rendering script to confirm HTML output; consider lightweight unit coverage for controls if time allows.

Docs to update: docs/sessions/2025-11-14-ui-controls-table notes + docs/sessions/SESSIONS_HUB.md entry.

## Implementation Outline

- **Data access**: add `selectInitialUrls(db, { limit })` under `src/db/sqlite/v1/queries/ui/` leveraging `getCachedStatements` + `sanitizeLimit`, joining `urls` with `latest_fetch` (fall back gracefully if the latter table is missing). Default limit 1000.
- **Controls**: create `src/ui/controls/Table.js` exporting `TableControl`, `TableRowControl`, and `TableCellControl` (header-aware). Each control will attach semantic classes (`ui-table`, `ui-table__row`, etc.) and accept pre-formatted text so they stay presentation-focused.
- **CSS**: embed a `<style>` block via `jsgui.style` in the document head. Apply a modern neutral palette, zebra striping, sticky header shade, responsive typography, and status badges for `classification`/`http_status`.
- **Rendering script**: `src/ui/render-url-table.js` should resolve the DB path (`--db` override, default `data/news.db`), fetch the first `limit` URLs, map them into display rows (preformatted timestamps, classification labels, fallback placeholders), compose a `Blank_HTML_Document`, add metadata (title, description, timestamp summary), instantiate the table control, and output full HTML (stdout or optional `--output`).
- **CLI ergonomics**: parse simple flags without extra dependencies (`--db`, `--limit`, `--output`, `--theme`). Provide exit codes on failure and helpful console errors.
