# Plan: slow-dashboard snapshot cache (c205 perf chip)

Objective: /quality and /place-hubs GET / must stop freezing the unified server's event loop and serve warm in <1s, so the puppeteer walk can run them with the plain 20s budget.

Done when:
- curl /quality and /place-hubs on the unified server: warm <1s, cold responds instantly (placeholder or snapshot — never a multi-second block)
- `npx jest tests/ui/unifiedApp.puppeteer.e2e.test.js` passes with BOTH c205 exceptions removed (`skipActivation` and `knownSlowRoutes`)
- `--check` fast paths untouched (quality's check-mode short-circuit stays first; snapshot children are never spawned under `--check`)
- zero changes to `data/news.db` (no migrations, no indexes — owner-gated)

Change set:
- `src/ui/server/utils/htmlSnapshotCache.js` (new — serve-stale HTML cache + child-build orchestration + computing placeholder)
- `src/ui/server/qualityDashboard/server.js`, `src/ui/server/qualityDashboard/snapshotChild.js` (new)
- `src/ui/server/placeHubGuessing/server.js`, `src/ui/server/placeHubGuessing/renderMatrixPage.js` (new, extracted), `src/ui/server/placeHubGuessing/snapshotChild.js` (new)
- `tests/ui/htmlSnapshotCache.test.js` (new), `tests/fixtures/ui/snapshot-child-fixture.js` (new)
- `tests/ui/unifiedApp.puppeteer.e2e.test.js` (exceptions removed)

Risks/assumptions:
- Snapshot children resolve the db via `--db-path` arg, `DB_PATH` env, or `<cwd>/data/news.db` — matches both standalone and unified startup; a router injected with an exotic handle path would need `dbPath` passed explicitly.
- Each cached /place-hubs entry is ~8.5MB (maxEntries capped at 6 ≈ 51MB worst case).
- First visitor to a cold route sees an auto-refreshing "computing" placeholder (same UX as /country-downloads).

Tests: unit test for the cache (6 cases, real child spawns — spawn→tmp-file→ingest path, single-flight, TTL, failure, eviction); e2e walk now exercises both routes with the plain budget.

Docs to update: this session; ADR-lite `docs/decisions/2026-08-05-dashboard-html-snapshot-cache.md`; SESSIONS_HUB entry.
