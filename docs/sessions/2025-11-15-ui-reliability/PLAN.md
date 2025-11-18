# Plan: ui-reliability
Objective: Improve the UI’s reliability/debuggability through targeted code and tooling updates.

Done when:
- Key UI reliability pain points are identified and addressed with concrete code or configuration changes.
- Debuggability improvements (logging, diagnostics, or tooling) are implemented and documented.
- Relevant docs/tests/checks are updated and validated.

Change set:
- `src/ui/server/dataExplorerServer.js` — structured API diagnostics + JSON error handling.
- `src/ui/controls/UrlFilterToggle.js` + bundle — client debug instrumentation & event hooks.
- Supporting tests under `tests/ui/**` plus any new helper utilities.
- Session documentation under `docs/sessions/2025-11-15-ui-reliability/` plus index updates.

Risks/assumptions:
- Existing UI build/test flows remain green; large refactors might need coordination with other branches.
- Some UI code may still reference legacy jsgui3 bindings; ensure compatibility.

Tests:
- Targeted UI unit/integration tests (via `npm run test:by-path ...`).
- Any lightweight checks (`node <feature>/checks/*.check.js`) touched during the work.

Benchmark (if DB-heavy):
- Not applicable unless UI changes touch data adapters (unlikely but monitor for perf regressions in client build duration).

Docs to update:
- `docs/AGENT_REFACTORING_PLAYBOOK.md` or related workflow notes if tooling changes occur.
- `docs/sessions/SESSIONS_HUB.md` with this session link.
- Session folder working notes & summary.
