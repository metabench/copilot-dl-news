# Plan: ui-home-cleanup

Objective: Remove the legacy URL table snippet from the dashboard view so the home page renders only the dashboard shell/cards while the table lives exclusively on `/urls`.

Done when:
- HOME route (DATA_VIEWS entry `home`) sets `hideListingPanel`/`layoutMode` and stops passing URL columns/rows.
- `renderHtml`/`renderDashboardView` no longer inject the table when no listing is desired.
- `/urls` route keeps full table, filters, pagination.
- UI server starts cleanly and home page shows no `# ID URL Host ...` header.
- Session docs updated; next steps queued for docs/agents as needed.

Change set:
- `src/ui/server/dataExplorerServer.js` (home view payload + render options)
- `src/ui/render-url-table.js` (renderHtml gating of listing panel, CSS tweaks if needed)
- Potential follow-on updates to nav/breadcrumb helpers or client bootstrap.
- `docs/sessions/2025-11-17-ui-home-cleanup/WORKING_NOTES.md` & summary once work advances.

Risks/assumptions:
- Assume downstream routes (domains/errors) still rely on table layout; must avoid regressions.
- Need to ensure nav highlighting remains accurate when panel hidden.
- Binding plugin + control manifest injection may expect listing state; guard before removing table.

Tests/checks:
- `node src/ui/server/dataExplorerServer.js` manual smoke
- (Optional) `npm run ui:client-build` if client bundle touched later

Docs/memory:
- Update WORKING_NOTES + SESSION_SUMMARY under this directory.
- Mention follow-up in `/docs/agi/journal` if new workflow gap discovered.