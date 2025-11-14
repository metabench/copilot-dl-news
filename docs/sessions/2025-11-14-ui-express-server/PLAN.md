# Plan – Ui Express Server

## Objective
Implement Express server for URL table with pagination and provide automation for generating small-sample renderings plus screenshots.

## Done When
- [ ] Key deliverables are complete and documented in `SESSION_SUMMARY.md`.
- [ ] Tests and validations (if any) are captured in `WORKING_NOTES.md`.
- [ ] Follow-ups are recorded in `FOLLOW_UPS.md`.

## Change Set (initial sketch)
- `src/ui/render-url-table.js` – lift rendering helpers so the server can reuse them without duplication.
- `src/ui/server/urlsExpressServer.js` (new) – Express app, routing, pagination, dependency injection hooks.
- `scripts/ui/capture-url-table-screenshots.js` (new) – drive smaller renders (e.g., 10 rows) and take screenshots via Puppeteer.
- `package.json` / `package-lock.json` – add npm script entry for the capture workflow (dependencies already installed).
- `docs/sessions/2025-11-14-ui-express-server/WORKING_NOTES.md` – capture express vs resource publisher observations, server usage, testing evidence, and screenshot automation steps.

## Risks & Mitigations
- **Large page sizes hitting DB repeatedly** – keep pagination limit sanitized and leverage existing normalized query with `offset` to avoid heavy memory usage.
- **Render divergence between CLI script and server** – share rendering helper to avoid two copies of markup/CSS.
- **Doc expectations** – explicitly document how Express differs from jsgui3-server resource publishers to satisfy request.

## Tests / Validation
- Manual: start Express server, request `/urls?page=1` (default limit 1000) and `/urls?page=2` to confirm pagination + nav links.
- Spot-check HTML output vs standalone renderer to ensure layout preserved.
- Capture curl/HTTPie output snippets in `WORKING_NOTES.md`.
- Run screenshot automation script to generate HTML + PNG artifacts for at least one small limit (10 rows) and document the paths.
