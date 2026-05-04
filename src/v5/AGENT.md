# Agent Guide: `src/v5/` — V5 Remote Crawler Application

Read this before expanding the v5 implementation.

## What This Directory Contains
- The explicit v5 application boundary for the remote crawler product.
- Bootstrapping layers that turn existing crawler/runtime/UI assets into a coherent remote application.

## Essential Reading
- `docs/books/v5-crawler-architecture.md`
- `docs/plans/2026-03-v5-remote-crawler-application/PLAN.md`
- `docs/plans/2026-03-v5-remote-crawler-application/WORKSTREAMS.md`
- `docs/plans/2026-03-v5-remote-crawler-application/TESTING_STRATEGY.md`

## Key Workflows
- Start with the smallest bootable slice.
- Prefer importable `createApp` / `createServer` factories over script-only entrypoints.
- Reuse existing runtime concepts and services before replacing them.

## Critical Knowledge
- `v5` is the product boundary, not a greenfield crawler rewrite.
- Keep the UI/gateway event loop free from heavy crawl and bundle work.
- Intelligent place/topic hub guessing is a core workflow, not side tooling.

## Related Paths
- `deploy/remote-crawler-v2/`
- `tools/crawl/`
- `src/services/CountryHubGapAnalyzer.js`
- `src/services/PlaceHubPatternLearningService.js`
- `src/ui/server/unifiedApp/`
