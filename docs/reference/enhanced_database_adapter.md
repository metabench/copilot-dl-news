---
status: canonical
source: AGENTS.md
last_migrated: 2025-11-04
owner: data-platform
---

# Enhanced Database Adapter (Optional)

The enhanced adapter extends the crawler with optional analytics modules:

- **QueueDatabase** for advanced queue telemetry and priority scoring.
- **PlannerDatabase** for knowledge reuse and pattern tracking.
- **CoverageDatabase** for real-time coverage metrics and milestones.

## Usage Notes

- The crawler operates without this adapter; missing tables produce warnings but do not block crawls.
- Enable features via `config/priority-config.json` (e.g., `advancedPlanningSuite: true`).
- Tables required include `queue_events_enhanced`, `problem_clusters`, `coverage_snapshots`, `hub_discoveries`, among others.

## Recommended Actions

- If advanced features are not needed, disable them in configuration to suppress warnings.
- When implementing the adapter, ensure migrations create all required tables before enabling features.
- Refer to [COVERAGE_API_AND_JOB_DETAIL_IMPLEMENTATION.md](../COVERAGE_API_AND_JOB_DETAIL_IMPLEMENTATION.md) for full architecture details.
