# Plan: client-control-hydration
Objective: populate browser contexts with UrlListingTable, UrlFilterToggle, and PagerButton constructors so Puppeteer toggle test passes.
Done when:
- `context.map_Controls` contains the three custom control constructors before activation.
- `npm run test:by-path tests/ui/e2e/url-filter-toggle.puppeteer.e2e.test.js` passes without missing-control logs.
- Session notes and follow-ups captured in docs/sessions/2025-11-19-client-control-hydration.
Change set:
- src/ui/client/index.js (bootstrap hooks, logging)
- public/assets/ui-client.js (rebuilt bundle)
- docs/sessions/2025-11-19-client-control-hydration/* (plan, notes)
Risks/assumptions:
- jsgui vendor may reset `map_Controls` during pre_activate; need to wrap accessors safely.
- Puppeteer test relies on real browser events, so reruns are slow (~9s).
Tests:
- npm run test:by-path tests/ui/e2e/url-filter-toggle.puppeteer.e2e.test.js
Docs to update:
- docs/sessions/2025-11-19-client-control-hydration (PLAN, WORKING_NOTES, SUMMARY)
