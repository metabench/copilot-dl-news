# Plan: url-filter-client
Objective: Finish the fetched-URL toggle by wiring the jsgui activation flow and client refresh logic so the `/urls` page updates via `/api/urls` without a full reload.

Done when:
- A session folder documents how the filter control, API, and activation pieces fit together.
- The `UrlFilterToggleControl` updates DOM/meta/pager state after fetching new data and exposes sufficient data attributes for activation.
- The bundled client initializes jsgui, finds the registered controls, and keeps the table, metadata, and URL in sync when the toggle changes.

Change set: `/src/ui/controls/UrlFilterToggle.js`, `/public/assets/ui-client.js` (via rebuild), `/docs/sessions/2025-11-15-url-filter-client/PLAN.md`, `docs/sessions/SESSIONS_HUB.md`
Risks/assumptions: New client logic depends on the registration helper; the API already returns filter metadata.
Tests: Manual smoke test on `/urls` page after rebuilding `ui-client.js` to confirm toggle works.
Benchmark: None planned.
Docs to update: `docs/sessions/SESSIONS_HUB.md` entry for the session.
