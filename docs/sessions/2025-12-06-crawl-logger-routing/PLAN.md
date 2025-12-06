# Plan – Crawl CLI logger wiring (🧠 Careful Refactor 🧠)

## Objective
Inject structured CLI logger so crawl.js honors verbosity/quiet/json uniformly

## Done When
- [ ] crawl.js delegates to the new src/cli/crawl modules (logger, args, reporting, runner) instead of duplicating helpers.
- [ ] Logger/verbosity and overrides keep parity with previous behavior (including JSON/quiet-like handling).
- [ ] Any validation steps are noted in `WORKING_NOTES.md`; follow-ups captured in `FOLLOW_UPS.md`.

## Change Set (initial sketch)
- crawl.js (thin orchestration; imports helpers from src/cli/crawl/*).
- src/cli/crawl/* (only if gaps surface while wiring entrypoint).

## Risks & Mitigations
- Logger interface mismatch with crawl operations → mirror console shape (`info`/`warn`/`error`/`log`).
- Double-printing or silent failures in JSON mode → gate info logs behind verbosity/format flags and keep errors visible.

## Tests / Validation
- Manual sanity: `node crawl.js availability --all --output-verbosity terse` to confirm formatter output.
- Spot-check JSON/quiet path by simulating `--json` flow for place commands (no extra stdout noise).
