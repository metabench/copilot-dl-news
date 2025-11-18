# Plan: puppeteer-e2e

**Objective**: Ship Puppeteer-based end-to-end coverage that exercises the `/urls` toggle flow against the Express data explorer so regressions are caught automatically.

**Done when**:
- A repeatable Puppeteer runner spins up the UI server (or connects to an existing instance) and drives the `/urls` page.
- The test flips the "Show fetched URLs" toggle, observes an API refresh, and asserts the table + subtitle reflect the filter state.
- The suite is wired into `npm run test:file` / `tests/run-tests.js e2e` via a documented command.
- Session docs capture commands, findings, and open follow-ups.

**Change set**:
- `docs/sessions/2025-11-15-puppeteer-e2e/WORKING_NOTES.md` (live log)
- `tests/e2e/ui/` (new Puppeteer test + helpers)
- `scripts/` or `tests/` utilities for booting the data explorer locally
- `package.json` / `tests/README.md` updates if new scripts are required

**Risks & assumptions**:
- `/api/urls` requires seeded SQLite data; need fixtures or lightweight mocking.
- Puppeteer must launch reliably in CI/agents; default headless mode preferred.
- Server startup time could dominate test runtime without reuse; may need shared helper to boot once per suite.

**Tests**:
- `npm run test:file "UrlFilterToggle.puppeteer.test"`
- `node tests/run-tests.js e2e` (spot-check inclusion)

**Docs to update**:
- Session files listed above
- `docs/AGENT_REFACTORING_PLAYBOOK.md` (note new automation entry point) if time permits.
