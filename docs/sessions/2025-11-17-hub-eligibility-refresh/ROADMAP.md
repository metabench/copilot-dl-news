# Roadmap — 2025-11-17 Hub Eligibility Refresh

## Goals
1. Allow QueueManager to re-enqueue nav hubs when `maxAgeHubMs` demands freshness.
2. Cover UrlEligibilityService logic with regression tests.
3. Capture doc updates + follow-ups.

## Task Board
- [x] Analyze queue/eligibility flow when nav pages exist in DB.
- [x] Implement hub freshness overrides tied to `maxAgeHubMs`.
- [x] Extend Jest coverage for nav hub reseeding.
- [ ] Update docs/session notes with findings + follow-ups.
