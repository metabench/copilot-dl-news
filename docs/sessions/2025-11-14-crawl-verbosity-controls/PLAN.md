# Plan – Crawl Verbosity Controls

## Objective
Expose a configurable verbosity setting for crawl output, defaulting the basic crawl workflow to an extra-terse per-page log (`<url> <downloadMs> <count>/<goal>`), while honoring CLI overrides.

## Done When
- Config manifests accept `outputVerbosity` (e.g., `extra-terse`, `terse`, `verbose`) with documented defaults.
- `crawl.js` reads the new option, merges CLI overrides, and passes the resolved level into the crawler stack.
- Per-page logging respects the verbosity level, including the bespoke extra-terse formatting with running totals.
- Existing telemetry (progress events, final summaries) continues to reflect accurate download caps.
- Session docs capture the design choices and remaining follow-ups.

## Change Set (initial)
- `config/config.json` (default verbosity)
- `crawl.js` (CLI + runtime wiring)
- `src/crawler/NewsCrawler.js` and/or `src/crawler/CrawlerEvents.js` (telemetry + formatting)
- `docs/sessions/2025-11-14-crawl-verbosity-controls/WORKING_NOTES.md` (running notes)

## Risks & Assumptions
- Must not break existing log consumers that rely on richer telemetry (ensure verbosity default applies only to basic crawl unless overridden).
- Need to confirm where per-page logs originate (`PageExecutionService` vs `CrawlerEvents`) before inserting formatting logic.
- Monitor for performance impact from string formatting in hot paths.

## Tests & Validation
- Run a capped basic crawl (100 downloads) with default config to confirm extra-terse output and accurate totals.
- Run the same crawl with `--output-verbosity verbose` to confirm overrides.

## Documentation Updates
- Session docs (this folder)
- Any operator-facing README or CLI reference pointing to the new option (TBD after implementation).
