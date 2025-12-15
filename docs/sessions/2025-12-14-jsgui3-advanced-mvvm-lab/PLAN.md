# Plan – jsgui3 advanced MVVM lab

## Objective
Build a new lab experiment exploring more complex MVVM patterns (computed fields, two-way binding, nested state) with deterministic checks.

## Done When
- [x] Experiment 023 exists with `README.md`, `client.js`, and `check.js`.
- [x] Deterministic check passes (SSR + Puppeteer interactions).
- [x] Lab index + manifest include experiment 023.
- [ ] Key deliverables are summarized in `SESSION_SUMMARY.md`.
- [ ] Follow-ups are recorded in `FOLLOW_UPS.md`.

## Change Set (initial sketch)
- src/ui/lab/experiments/023-advanced-mvvm-patterns/README.md
- src/ui/lab/experiments/023-advanced-mvvm-patterns/client.js
- src/ui/lab/experiments/023-advanced-mvvm-patterns/check.js
- src/ui/lab/manifest.json
- src/ui/lab/README.md

## Risks & Mitigations
- Risk: child control activation / `ctrl_fields` may be incomplete (generic Control warnings).
	- Mitigation: activation uses `root.querySelector(...)` for DOM wiring instead of relying on child control instances.
- Risk: `Data_Object` string values encode with extra JSON quoting (e.g. `"Ada"`).
	- Mitigation: normalize values on read (`readDataValue`) and during decode (`coerceScalar`).

## Tests / Validation
- `node src/ui/lab/experiments/023-advanced-mvvm-patterns/check.js`
