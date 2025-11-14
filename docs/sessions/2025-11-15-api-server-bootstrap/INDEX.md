# Session: API Server Bootstrap (2025-11-15)

## Objective
Wire the standalone API server so it initializes the crawl job registry and background task infrastructure automatically.

## Primary Tasks
- Inventory existing bootstrap logic from the deprecated UI server.
- Design the default wiring pattern for `src/api/server.js`.
- Implement automatic initialization with sensible defaults and escape hatches for overrides.
- Capture follow-ups or validation requirements.

## Quick Links
- [Working Notes](./WORKING_NOTES.md)
- [Roadmap](./ROADMAP.md)
- [Follow Ups](./FOLLOW_UPS.md)
