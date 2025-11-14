# Session 2025-11-13 — Crawl Config Runner

**Objective**: Make `crawl.js` the simple entrypoint for running crawls by teaching it to load crawler options from a reusable config file instead of long CLI argument lists.

**Status**: 🚧 Active

## Scope
- Understand current `crawl.js` arguments, defaults, and how they thread into `NewsCrawler`.
- Introduce a config file (JSON/YAML) that `crawl.js` can read to supply crawler settings.
- Preserve the ability to override specific options via CLI while allowing zero-argument runs.
- Document the workflow so operators know where to store configs and how to run them.

## Quick Links
- [Working Notes](./WORKING_NOTES.md)
- [Roadmap](./ROADMAP.md)
- [Session Summary](./SESSION_SUMMARY.md)
- [Follow Ups](./FOLLOW_UPS.md)
- [Search Index](./SEARCH_INDEX.md)
