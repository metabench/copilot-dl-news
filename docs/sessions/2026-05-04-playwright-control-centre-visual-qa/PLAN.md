# Plan: Playwright Control Centre Visual QA

Objective: Explore the unified control centre and crawl-related apps with Playwright visual tooling, make only simple low-risk fixes, and validate display behavior with bounded 5x5 crawl evidence.

Done when:
- The control centre is inspected across several apps with screenshots or browser snapshots.
- Any simple, low-risk visual or presentation fixes discovered during inspection are applied and validated.
- Crawl testing, if run, is limited to five sites with five pages per site.
- Screenshots and notes are saved under this session for later Control Center review.
- Validation commands and visual judgement are recorded in `WORKING_NOTES.md`.

Change set:
- `docs/sessions/2026-05-04-playwright-control-centre-visual-qa/` session artifacts.
- Potentially small `src/ui/**` presentation fixes only if clearly safe.

Risks/assumptions:
- Playwright MCP is exploratory; repeatable findings should be captured with the existing screenshot helper when practical.
- No broad layout rewrite or crawler behavior change will be made in this pass.
- Remote crawl operations must stay bounded to 5 domains x 5 pages.

Tests / validation:
- Playwright MCP visual inspection and screenshots where available.
- `node scripts/ui/capture-unified-crawl-display.js --output docs/sessions/2026-05-04-playwright-control-centre-visual-qa/screenshots --save-screenshots --save-dom-snapshots`
- Focused UI checks for any files changed.

Docs to update:
- Session `WORKING_NOTES.md`, `USER_JOURNEYS.md`, `SCREENSHOT_REVIEW.md`, and `SCREENSHOT_COMMENTS.md`.
