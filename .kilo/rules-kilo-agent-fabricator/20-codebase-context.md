# Repo Context Snapshot

- **Source roots**: `/src` (modules, db, models, utils), `/tests`, `/docs`. UI controls + checks live under `src/ui/controls/**`.
- **Tooling**: `node tools/dev/js-scan.js` + `js-edit.js` for discovery/editing; use `npm run test:by-path <test>` for Jest; keep CLI output compact/JSON.
- **Documentation Loop**: Every task must create `docs/sessions/<yyyy-mm-dd>-<slug>/` with PLAN + WORKING_NOTES + SUMMARY, and update `docs/sessions/SESSIONS_HUB.md`.
- **Data layer**: All persistence flows through `/src/db/**` adapters; never inline SQL elsewhere.
- **Performance**: If a planned agent touches DB-heavy areas (`src/ui/server/services/metricsService.js`, `src/db/sqlite`), call out EXPLAIN plans + batching expectations inside its rules file.
- **Testing**: Agents must schedule unit/integration tests via `tests/ui/**`, `tests/ui/server/**`, etc., and add regression coverage for bug fixes.
- **Docs**: When new workflows appear, extend `/docs/workflows` or `/docs/agents` and cross-link from AGENTS.md.

Keep this bullet list synced with AGENTS.md whenever the repo structure changes.
