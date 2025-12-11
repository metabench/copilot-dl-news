# Plan – Support multiple decision systems

## Objective
Add DB + UI support to list and switch decision systems in decision tree viewer

## Done When
- [ ] Key deliverables are complete and documented in `SESSION_SUMMARY.md`.
- [ ] Tests and validations (if any) are captured in `WORKING_NOTES.md`.
- [ ] Follow-ups are recorded in `FOLLOW_UPS.md`.

## Change Set (initial sketch)
- decision config set API: wire into API server + add active-set endpoints that persist to DB (`crawler_settings`).
- decision tree viewer: load active set from DB, expose active-set API, keep fallback to config directory + example.
- shared helper/service for active decision system state.
- Docs/notes: session docs only (no global doc churn).

## Risks & Mitigations
- DB availability (file missing / readonly) — guard and return 503 + fall back to file-based config.
- Slug drift (config set deleted) — validate against repository list and production snapshot before saving.
- Viewer bundle drift — ensure client bundle exists/builds automatically as today.

## Tests / Validation
- `node src/crawler/observatory/checks/DecisionConfigSet.check.js`
- Manual: hit decision-tree viewer `/`, `/api/config-sets`, `/api/active-config-set` to verify active-set persistence.
- (If time) lightweight integration check via decision tree viewer server rendering after changing active set.
