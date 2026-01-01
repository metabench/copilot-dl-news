# Next Agent Prompt (ready to paste)

You are continuing the repo’s **Single UI App Cohesion (No-Retirement)** program.

Constraints:
- Do not delete/retire existing servers, ports, scripts, or workflows.
- Windows + PowerShell; Node.js only (no Python).
- Jest must run via repo runners (use `npm run test:by-path`).
- Keep DB access behind adapters/services; do not add DB logic to UI servers.
- The “no weighted signals” rule applies only inside Fact→Classification boolean decision trees.

Context:
- Continue session `docs/sessions/2025-12-30-single-ui-cohesion-next/`.
- Read `GOALS_REVIEW.md`, `SINGLE_UI_COHESION_IMPLEMENTATION_PLAN.md`, and `WORKING_NOTES.md` first.

Task:
1) Add one more cheap regression guard for the unified shell:
   - either a small check script that validates `GET /api/apps` includes required ids
   - or extend `tests/ui/unifiedApp.registry.test.js` to validate the `/api/apps` response schema.
2) Run the validation ladder in `VALIDATION_MATRIX.md` and record evidence.
3) Update session `SESSION_SUMMARY.md` + `FOLLOW_UPS.md` with outcomes.

Commands to use:
- `npm run schema:check`
- `npm run diagram:check`
- `node src/ui/server/unifiedApp/server.js --check --port 3055`
- `node src/ui/server/opsHub/server.js --check --port 3056`
- `node src/ui/server/qualityDashboard/server.js --check --port 3057 --db-path data/news.db`
- `npm run test:by-path tests/ui/unifiedApp.registry.test.js`
