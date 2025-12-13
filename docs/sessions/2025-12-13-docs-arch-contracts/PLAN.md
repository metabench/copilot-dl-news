# Plan – Architectural Contracts Docs

## Objective
Create docs/arch contract docs and index existing contract data

## Done When
- [x] Key deliverables are complete and documented in `SESSION_SUMMARY.md`.
- [x] Tests and validations (if any) are captured in `WORKING_NOTES.md`.
- [x] Follow-ups are recorded in `FOLLOW_UPS.md` (if any).

## Change Set (initial sketch)
- `docs/arch/README.md`
- `docs/arch/CONTRACTS_OVERVIEW.md`
- `docs/arch/CONTRACTS_DB_ACCESS.md`
- `docs/arch/CONTRACTS_UI_QUERY_MODULES.md`
- `docs/arch/CONTRACTS_SERVICE_LAYER.md`
- `docs/arch/CONTRACTS_SERVER_LIFECYCLE_CHECK_MODE.md`
- `docs/arch/CONTRACTS_TELEMETRY_SERVER_STANDARD.md`
- `docs/arch/CONTRACTS_TELEMETRY_CRAWLER_EVENTS.md`
- `docs/INDEX.md`
- `.github/agents/🧭 Architecture Contract Keeper 🧭.agent.md`

## Enforcement / Contract Tests
- `tests/ui/server/serverStartupCheckUtility.test.js`
- `tests/db/sqlite/ui/urlListingNormalized.contract.test.js`

## Risks & Mitigations
- _Note potential risks and how to mitigate them._

## Tests / Validation
- `docs/arch/` directory created with contract docs.
- `docs/INDEX.md` updated to link to `docs/arch/README.md`.
