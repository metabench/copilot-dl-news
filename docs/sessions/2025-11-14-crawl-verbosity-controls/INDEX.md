# Session 2025-11-14 – Crawl Verbosity Controls

**Objective**: Add operator-facing controls that drive how terse or verbose crawl output is, defaulting the basic crawl to an extra-terse per-page summary (URL, download ms, running total such as `10/100`).

## Quick Links
- [Plan](./PLAN.md)
- [Working Notes](./WORKING_NOTES.md)

## Status
- 🔄 Active — planning and implementation in progress

## Scope Highlights
- Introduce an `outputVerbosity` option within crawl config manifests that also respects CLI overrides.
- Wire verbosity settings through `crawl.js`, `NewsCrawler`, `CrawlerEvents`, and any log formatting helpers.
- Ensure the default basic crawl run emits extra-terse per-page lines with `URL ms total/goal` formatting while keeping overrides intact.
- Keep telemetry accurate so monitoring still reports when max download counts are reached.

## How to Use This Session Folder
- Start with `PLAN.md` for the current implementation checklist.
- Append discoveries and open questions to `WORKING_NOTES.md` as the crawl logging pipeline evolves.
- Summaries and follow-ups will be captured once work concludes.
