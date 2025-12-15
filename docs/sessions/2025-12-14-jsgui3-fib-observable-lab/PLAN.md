# Plan – jsgui3 Fibonacci Observable MVVM Lab

## Objective
Create a lab that streams Fibonacci numbers from a server-side observable to an MVVM client via jsgui3, with deterministic checks.

## Done When
- [x] Key deliverables are complete and documented in `SESSION_SUMMARY.md`.
- [x] Tests and validations (if any) are captured in `WORKING_NOTES.md`.
- [x] Follow-ups are recorded in `FOLLOW_UPS.md`.

## Change Set (initial sketch)
- `src/ui/lab/experiments/024-fib-observable-mvvm/` (new)
	- `server.js`, `client.js`, `check.js`, `README.md`
- `src/ui/lab/manifest.json` (fix JSON + register 023/024)
- `src/ui/lab/README.md` (add experiment 024 row)

## Risks & Mitigations
- **Transport choice**: no obvious existing server→client stream primitive; use SSE with permissive CORS headers to keep it minimal.
- **Activation fragility**: jsgui3 may create generic controls for some nodes; use root attribute updates + querySelector fallbacks for robust checks.
- **Timer nondeterminism**: use bounded assertion (index reaches threshold) rather than relying on exact tick counts.

## Tests / Validation
- `node src/ui/lab/experiments/024-fib-observable-mvvm/check.js`
- JSON validity: `src/ui/lab/manifest.json` parses cleanly.
