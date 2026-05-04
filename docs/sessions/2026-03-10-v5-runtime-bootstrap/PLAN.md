# Plan – V5 Runtime Bootstrap

## Objective
Create the first real v5 backend slice by introducing a bootable `src/v5/remote/` boundary with a minimal, tested API contract for remote crawler health, status, domain inventory, and start/stop control.

## Linked Long-Term Session
- `docs/sessions/long-term/lt-001-advanced-crawler-ui/`

## Done When
- [x] A new `src/v5/remote/` namespace exists with a small server/app factory instead of another script-only entrypoint.
- [x] The first v5 API contract is implemented and bootable: health, status, domains, per-domain status, start, and stop.
- [x] The initial runtime shape is thin and compatibility-oriented rather than a greenfield crawler rewrite.
- [x] Focused tests prove the new v5 contract and core state transitions.
- [x] Session notes and the long-term session reflect the implementation evidence and next steps.

## Change Set
- `src/v5/remote/*`
- `tests/v5/*`
- `docs/sessions/2026-03-10-v5-runtime-bootstrap/*`
- `docs/sessions/SESSIONS_HUB.md`
- `docs/sessions/long-term/lt-001-advanced-crawler-ui/WORKING_NOTES.md`

## Risks & Assumptions
- Risk: trying to fully restore `deploy/remote-crawler-v2` in one pass will sprawl. Mitigation: establish the v5 boundary and minimal API contract first, then layer in deeper runtime reuse.
- Risk: v5 bootstrap becomes a dead-end mock. Mitigation: align route shapes and state concepts with the existing multi-domain server and current v5 plan.
- Risk: missing path-local `AGENT.md` files under `deploy/` and `src/v4/` indicate doc drift. Mitigation: rely on current code and the active v5 plan, and keep this slice small.

## Validation
- `npm run test:by-path -- tests/v5/remote-server.test.js`
- `npm run test:by-path -- tests/tools/crawl-remote-bounded.test.js`
- One safe boot check against the new v5 server entrypoint.
