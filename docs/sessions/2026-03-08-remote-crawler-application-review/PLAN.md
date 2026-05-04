# Plan – Remote Crawler Application Review

## Objective
Assess what remote crawler application capability already exists in this repo, what is already deployable/operable, and what concrete gaps remain before it can be treated as a serious remotely hosted crawler application.

## Done When
- [x] Existing remote crawler generations and deployment surfaces are inventoried from code and docs.
- [x] Operator access surfaces are identified: CLI, API/server, UI/admin, sync/import/export, remote control, monitoring, and recovery.
- [x] The review distinguishes what is production-usable now vs partial vs missing.
- [x] Concrete recommendations are prioritized for turning the current system into a remotely hosted crawler application.
- [x] Session notes capture the evidence used for the assessment.

## Change Set
- `docs/sessions/2026-03-08-remote-crawler-application-review/*`
- `docs/sessions/SESSIONS_HUB.md`

## Risks & Mitigations
- Risk: docs describe components that are not present in this worktree. Mitigation: cross-check all claims against current files before treating them as available capability.
- Risk: remote crawler generations are overlapping and inconsistent. Mitigation: review each generation separately, then call out what appears current vs legacy.
- Risk: analysis drifts into greenfield design. Mitigation: anchor recommendations to existing code paths and operator surfaces first.

## Tests / Validation
- Code/document inspection only for this review.
- No source-code changes unless required for understanding.
- Safe runtime probes executed:
  - `node deploy/remote-crawler/server.js --help` → failed in current worktree due to missing `deploy/remote-crawler/lib/domain-intelligence.js`
  - `node deploy/remote-crawler-v2/multi-domain-server.js --help` → failed in current worktree due to missing `deploy/remote-crawler-v2/lib/schema.js`
  - `node tools/crawl/crawl-remote.js help` → succeeded and confirmed operator CLI surface still exists
