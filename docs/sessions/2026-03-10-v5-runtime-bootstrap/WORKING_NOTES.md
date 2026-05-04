# Working Notes – V5 Runtime Bootstrap

- 2026-03-10 — Session opened to start actual v5 implementation after planning. Scope is the first backend slice only: namespace boundary plus minimal bootable API contract.
- 2026-03-10 — `deploy/remote-crawler-v2/multi-domain-server.js` remains incomplete in this worktree because most of its `lib/` imports are missing. That makes a clean `src/v5/remote/` bootstrap safer than trying to repair the entire legacy server in one shot.
- 2026-03-10 — Existing reusable ideas retained for this slice: multi-domain state model, health/status/domain inventory, start/stop semantics, and compatibility-friendly crawl control nouns.
- 2026-03-10 — Implemented `src/v5/remote/server.js` and `src/v5/remote/runtime.js` as the first explicit v5 backend boundary. The runtime is intentionally thin: in-memory domain/run state plus importable app/server factories that can be tested without launching the whole legacy stack.
- 2026-03-10 — Added `src/v5/AGENT.md` because `src/v5/` is now a real subsystem directory and needs local guidance.
- 2026-03-10 — Included the first hub-intelligence contract in the bootstrap API via `GET /api/v5/hub-suggestions`. It currently supports provider injection and returns `status: "unconfigured"` by default, which is enough to make the route part of the boundary without pretending the intelligence layer is already finished.
- 2026-03-10 — Added focused tests in `tests/v5/remote-server.test.js` for domain normalization, config loading, state transitions, API responses, and hub-suggestion contract behavior.
- 2026-03-10 — Validation:
  - `npm run test:by-path -- tests/v5/remote-server.test.js` → passed, 1 suite / 9 tests.
  - `npm run test:by-path -- tests/tools/crawl-remote-bounded.test.js` → passed, 1 suite / 6 tests.
  - Manual boot check: `node src/v5/remote/server.js --domains bbc.com,reuters.com --port 3410` started cleanly; `curl http://127.0.0.1:3410/api/v5/health` returned healthy bootstrap metadata; `curl http://127.0.0.1:3410/api/v5/hub-suggestions?domain=bbc.com` returned the expected default `unconfigured` payload; server stopped cleanly on `SIGINT`.
