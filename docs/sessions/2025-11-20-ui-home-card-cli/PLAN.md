# Plan: ui-home-card-cli
Objective: Align the CLI-rendered `/urls` HTML with the shared home card helper so diagnostics and badges match the server output, then capture future UI improvements.

Done when:
- `src/ui/render-url-table.js` imports the shared home card loaders/helper and renders cards with badges + hints identical to the server.
- Jest + control check scripts confirm the new helper behaves and renders as expected.
- Session docs record executed commands plus planned follow-ups.
- Brainstormed list of lightweight UI/workflow improvements is captured for next passes.

Change set:
- `src/ui/render-url-table.js`
- `docs/sessions/2025-11-20-ui-home-card-cli/*`

Risks/assumptions:
- Loader wiring must avoid hitting the DB when CLI runs without data (needs safe fallbacks).
- CSS/layout drift between CLI and server must be avoided; reuse helper output as-is.
- Instructions mandate using js-scan/js-edit; need to ensure tooling outputs are logged.

Tests:
- `npm run test:by-path tests/ui/homeCards.test.js`
- `node src/ui/controls/checks/UrlListingTable.check.js`
- `node src/ui/controls/checks/DomainSummaryTable.check.js`

Benchmark: Not applicable (no DB-heavy code paths).

Docs to update:
- `docs/sessions/2025-11-20-ui-home-card-cli/WORKING_NOTES.md`
- `docs/sessions/2025-11-20-ui-home-card-cli/SESSION_SUMMARY.md`
- `docs/sessions/2025-11-20-ui-home-card-cli/FOLLOW_UPS.md`
- `docs/sessions/SESSIONS_HUB.md` entry for this session.