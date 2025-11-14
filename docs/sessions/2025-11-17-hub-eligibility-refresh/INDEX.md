# Session 2025-11-17 — Hub Eligibility Refresh

**Objective**: Ensure navigation/front-page URLs can be re-enqueued when we request fresh hubs via `maxAgeHubMs`, even if they already exist in the database.

**Status**: ⏳ Active

## Scope
- Diagnose why QueueManager drops nav URLs found in SQLite.
- Update URL eligibility logic so stale hubs respect `maxAgeHubMs`.
- Backfill documentation/tests covering the new behavior.

## Quick Links
- [Working Notes](./WORKING_NOTES.md)
- [Roadmap](./ROADMAP.md)
- [Session Summary](./SESSION_SUMMARY.md)
- [Decisions](./DECISIONS.md)
- [Search Index](./SEARCH_INDEX.md)
- [Follow Ups](./FOLLOW_UPS.md)
