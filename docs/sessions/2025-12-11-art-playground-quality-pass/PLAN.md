# Plan – Art Playground: Quality & Idioms Pass

## Objective
Continue improving Art Playground code quality and idiomatic jsgui3 patterns beyond activation, keeping checks/E2E green.

## Done When
- [ ] Key deliverables are complete and documented in `SESSION_SUMMARY.md`.
- [ ] Tests and validations (if any) are captured in `WORKING_NOTES.md`.
- [ ] Follow-ups are recorded in `FOLLOW_UPS.md`.

## Change Set (initial sketch)
- `src/ui/server/artPlayground/client.js` (terminology + small boot idioms)
- `src/ui/server/artPlayground/isomorphic/controls/*.js` (idiomatic activation patterns; reduce dead wiring; expose small public APIs)
- `docs/guides/*` (only if terminology drift is found)

## Risks & Mitigations
- Risk: breaking SSR + client activation wiring.
	- Mitigation: keep changes small; run the Art Playground structural check + Puppeteer E2E after edits.
- Risk: accidental behavior change in interactive flows.
	- Mitigation: ensure selectors and `data-*` attributes remain stable; avoid layout/CSS edits in this pass.

## Tests / Validation
- Structural check: `node src/ui/server/artPlayground/checks/art-playground.check.js`
- E2E: `npm run test:by-path tests/ui/e2e/art-playground.puppeteer.e2e.test.js`
