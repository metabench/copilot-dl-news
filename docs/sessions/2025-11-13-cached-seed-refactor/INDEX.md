# Session 2025-11-13 — Cached Seed Refactor

**Objective**: Enable crawler runs to treat cached hub/article pages as queue seeds so we can reprocess content without immediate network fetches.

**Status**: ⏳ Active

## Scope
- Extend queue + fetch pipeline metadata so items can demand cache processing even when `allowRevisit` is true.
- Update PageExecutionService/FetchPipeline to hydrate work from ArticleCache when requested.
- Provide CLI/config hooks and safety tests documenting cached seed behavior.

## Quick Links
- [Working Notes](./WORKING_NOTES.md)
- [Roadmap](./ROADMAP.md)
- [Session Summary](./SESSION_SUMMARY.md)
- [Decisions](./DECISIONS.md)
- [Search Index](./SEARCH_INDEX.md)
- [Follow Ups](./FOLLOW_UPS.md)
