# Plan: ui-home-grid-refresh

Objective: Improve the `/urls` landing experience by enhancing the home cards/back-links, adding lightweight render checks for the core controls, and correcting the `src/ui/README.md` guidance so future UI work is easier to onboard.

Done when:
- Home cards emitted from `render-url-table.js` expose actionable links/tooltips that deep-link to the relevant views without breaking existing styling/tests.
- New `checks/` scripts exist for UrlListingTable, DomainSummaryTable, CrawlJobsTable, and PagerButton controls and can be run via `node` to inspect rendered markup.
- `src/ui/README.md` reflects the current data explorer implementation, bundle entry point, and diagnostics/testing story.
- Session docs capture discovery commands, verification steps, and follow-ups.

Change set:
- `docs/sessions/2025-11-15-ui-home-grid-refresh/PLAN.md`
- `docs/sessions/2025-11-15-ui-home-grid-refresh/WORKING_NOTES.md`
- `docs/sessions/2025-11-15-ui-home-grid-refresh/SESSION_SUMMARY.md`
- `docs/sessions/SESSIONS_HUB.md`
- `src/ui/render-url-table.js`
- `src/ui/controls/checks/*.check.js`
- `src/ui/README.md`

Risks/assumptions:
- Assumes existing CSS classes cover the richer card content; keep markup minimal to avoid layout regressions.
- Checks must avoid DB access; rely on fixture data baked into the scripts.
- README updates should not conflict with other branches—stick to factual current-state descriptions.

Tests:
- Run each new check script via `node src/ui/controls/checks/<name>.check.js` to ensure they execute and log markup.
- No Jest changes expected, but rerun if any control logic is modified.

Docs to update:
- Session PLAN/WORKING_NOTES/SESSION_SUMMARY.
- `docs/sessions/SESSIONS_HUB.md` entry for this session.
- `src/ui/README.md` to describe the implemented data explorer and diagnostics.
