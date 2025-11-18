# Plan: url-filter-e2e
Objective: Strengthen the URL filter e2e test by verifying that toggling back to "all URLs" restores the table and meta summary.
Done when:
- The Puppeteer test covers switching the toggle on and off, asserting row count/subtitle for both states.
- Network assertions confirm the second `/api/urls` call runs without errors.
- Session docs capture the change and next steps.
Change set: `tests/ui/e2e/url-filter-toggle.puppeteer.e2e.test.js`, session docs, `docs/sessions/SESSIONS_HUB.md`.
Risks/assumptions: Puppeteer timing may be flaky; ensure waits rely on DOM state rather than arbitrary sleeps.
Tests: `npm run test:by-path tests/ui/e2e/url-filter-toggle.puppeteer.e2e.test.js`.
Docs to update: `docs/sessions/SESSIONS_HUB.md`, session summary.
