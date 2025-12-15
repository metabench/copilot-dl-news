# Plan – Activation debugging with mixed controls

## Objective
Add a lab that mixes built-in and custom controls and produces structured activation diagnostics with gated debug output.

## Done When
- [ ] Key deliverables are complete and documented in `SESSION_SUMMARY.md`.
- [ ] Tests and validations (if any) are captured in `WORKING_NOTES.md`.
- [ ] Follow-ups are recorded in `FOLLOW_UPS.md`.

## Change Set (initial sketch)
- Added new lab experiment:
	- src/ui/lab/experiments/029-mixed-builtins-custom-activation/client.js
	- src/ui/lab/experiments/029-mixed-builtins-custom-activation/check.js
	- src/ui/lab/experiments/029-mixed-builtins-custom-activation/README.md
- Registered the experiment:
	- src/ui/lab/manifest.json

## Risks & Mitigations
- _Note potential risks and how to mitigate them._

## Tests / Validation
- node src/ui/lab/experiments/029-mixed-builtins-custom-activation/check.js
	- SSR asserts: custom types + ctrl_fields + expected type coverage
	- Client asserts: data-activated=1, contract ok, report invariants, click interaction works
