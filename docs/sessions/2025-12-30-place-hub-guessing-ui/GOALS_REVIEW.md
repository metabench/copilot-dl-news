# Goals Review — Place Hub Guessing (2025-12-30)

## Objective
Make place hub guessing reliable, inspectable, and improvable by humans and AI agents via: (1) explicit subsystems with contracts, (2) deterministic checks/tests per subsystem, and (3) a dedicated UI that visualizes coverage (place × domain) and freshness.

## Why this matters
Place hubs are a structural navigation layer: if we can reliably find and keep them fresh, we gain fast entrypoints for geo/topic crawling and can reason about “coverage gaps” per publisher.

## Current pain (as observed)
- The system is hard to reason about end-to-end (generation → validation → persistence → freshness).
- It’s not obvious which hubs are untested vs tested-missing vs tested-present.
- Output is mostly CLI/log-centric; humans lack a coverage view and queueing primitives.

## Target UX
A matrix UI where:
- Rows = places (country/region/city/topic; filterable)
- Columns = domains (filterable)
- Cell state =
  - **Unchecked** (no mapping row)
  - **Checked-missing** (mapping exists but not verified)
  - **Checked-present** (verified mapping)
- Hover/side panel shows:
  - candidate URL
  - last checked (`last_seen_at` / `verified_at`)
  - last crawled (`places.last_crawled_at` when available)
  - hub metrics (article/nav counts from `place_hubs` when linked)
  - freshness hints (eg “checked in last 10m”, “no missing pages”)

## Non-goals (for this slice)
- Perfect hub detection accuracy.
- Full interactive editing/queueing UI.
- Any weighted-signal logic inside fact/classification subsystems (not relevant here).

## Done when (for the overall program)
- A user can open a dedicated UI and answer: “What’s unchecked, missing, and verified for (place, domain)?”
- The system is decomposed into testable subsystems with focused checks.
- The guessing pipeline persists enough telemetry to debug and iterate.
