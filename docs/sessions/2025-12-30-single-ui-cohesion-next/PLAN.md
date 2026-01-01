# Plan – Single UI app cohesion  next steps

## Objective
Make unified UI shell reliable + verifiable without breaking existing servers.

## Done When
- [ ] Key deliverables are complete and documented in `SESSION_SUMMARY.md`.
- [ ] Tests and validations (if any) are captured in `WORKING_NOTES.md`.
- [ ] Follow-ups are recorded in `FOLLOW_UPS.md`.

Additional acceptance criteria for this slice:
- [ ] `npm run schema:check` is stable on Windows (CRLF/LF).
- [ ] `npm run diagram:check` completes quickly and exits cleanly.
- [ ] Unified shell + Ops Hub + Quality Dashboard each support `--check` on a non-default port.
- [ ] A focused Jest test exists to keep unified sub-app registry stable.

## Change Set (initial sketch)
- `tools/schema-sync.js` (normalize CRLF/LF for drift hashing)
- `src/ui/server/checks/diagramAtlas.check.js` (fast check mode)
- `src/ui/server/opsHub/server.js` (add `--check` + `--port`)
- `src/ui/server/unifiedApp/server.js` (add `--port` parsing)
- `src/ui/server/qualityDashboard/server.js` (add `--port`/`--db-path`; fast `/` during `--check`)
- `tests/ui/unifiedApp.registry.test.js` (new)
- `tests/tools/__tests__/schema-sync.line-endings.test.js` (new)
- `docs/workflows/single-ui-app-cohesion.md` + `docs/INDEX.md`

## Risks & Mitigations
- Risk: Changing `schema:check` behavior could hide real drift → Mitigation: only normalizes line endings + ignores timestamp (schema shape still hashed).
- Risk: `--check` could mask real SSR errors (e.g. Quality Dashboard) → Mitigation: only short-circuits `/` during `--check`; normal runtime unchanged.
- Risk: Port collisions across servers → Mitigation: require `--port` support and use non-default ports in checks/tests.

## Tests / Validation
- `npm run schema:check`
- `npm run diagram:check`
- `node src/ui/server/unifiedApp/server.js --check --port 3055`
- `node src/ui/server/opsHub/server.js --check --port 3056`
- `node src/ui/server/qualityDashboard/server.js --check --port 3057 --db-path data/news.db`
- `npm run test:by-path tests/tools/__tests__/schema-sync.line-endings.test.js tests/ui/unifiedApp.registry.test.js`
