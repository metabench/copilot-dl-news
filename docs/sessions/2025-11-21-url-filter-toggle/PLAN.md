# Plan: url-filter-toggle-fix
Objective: Restore the “Show fetched URLs only” toggle so `/urls` refreshes its rows/meta/pagination client-side without reloading and the server/API stay in sync.

Done when:
- Toggling updates the table, summary cards, and browser history using fresh `/api/urls` data for both states.
- SSR data attributes + client activation deliver the same default query so hydration and manual fallback keep working.
- Diagnostics clearly surface toggle fetch failures to aid debugging, and new/updated tests guard the flow.

Change set:
- `src/ui/controls/UrlFilterToggle.js`
- `src/ui/server/dataExplorerServer.js`
- `src/ui/client/index.js` (if activation/wiring tweaks required)
- `tests/ui/**` (refresh toggle coverage as needed)
- `docs/sessions/2025-11-21-url-filter-toggle/*`
- `docs/sessions/SESSIONS_HUB.md`
- `docs/agi/journal/2025-11-21.md`

Risks/assumptions:
- `/api/urls` latency may cause slow updates; need loading cues + state rollback on failure.
- Pagination + totals rely on DB helpers; ensure we don’t break cached counts when filtering.
- Client bundle must stay rebuild-free for this change (prefer pure JS edits that don’t require re-running esbuild unless strictly necessary).

Tests:
- `npm run test:by-path tests/ui/e2e/url-filter-toggle.puppeteer.e2e.test.js`
- `npm run test:by-path tests/ui/server/dataExplorerServer.production.test.js` (sanity for API/SSR filters)

Docs to update:
- This session folder (plan, working notes, summary as work proceeds)
- `docs/sessions/SESSIONS_HUB.md` (new entry for this effort)
- `docs/agi/journal/2025-11-21.md` (Sense/Plan/Act/Verify log for the fix)
