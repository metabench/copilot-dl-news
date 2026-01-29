---
description: Conventions and patterns for this repository
---
## File Organization
- `src/core/crawler/` - Core crawling logic (NewsCrawler, state management, milestones)
- `src/services/` - Business logic services (gap analyzers, pattern learning)
- `src/data/` - Database access and data models
- `src/ui/` - Server-side UI with jsgui3 controls
- `tools/` - CLI tools and utilities
- `docs/` - Documentation and architecture diagrams (NOT tmp/)

## Code Style
- JavaScript (not TypeScript)
- ES modules with `.js` extension
- Relative imports within modules, avoid deep `../../../` paths
- Services are classes instantiated with dependencies

## Testing
- Jest for unit tests
- E2E tests in `tests/e2e/`
- Run with `npm test`

## Key Patterns
- Dependency injection for major components
- Event-driven communication between crawler subsystems
- SQLite for local development, Postgres option for production
