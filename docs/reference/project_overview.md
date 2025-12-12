---
status: canonical
source: AGENTS.md
last_migrated: 2025-11-04
owner: architecture
---

# Project Overview

## Legacy UI

- Styles: `src/deprecated-ui/express/public/styles/*.scss`
- Components: `src/deprecated-ui/public/**/*.js`
- Server: `src/deprecated-ui/express/server.js`

## Database

- SQLite with WAL mode via `src/db/sqlite/ensureDb.js`.
- Tests must share the app’s database connection to avoid WAL isolation issues.

## Crawls vs Background Tasks

Refer to `docs/ARCHITECTURE_CRAWLS_VS_BACKGROUND_TASKS.md` for a full explanation. Key points:

- Crawls fetch new data via isolated child processes.
- Background tasks process existing data within the main process.
- Terminology: users resume crawls; queues remain internal implementation details.

## Crawler Runbook

Operational entry points and debugging shortcuts:

- `docs/RUNBOOK.md` — operational runbook (UI server, fake runner, tests)
- `docs/DEBUGGING_CHILD_PROCESSES.md` — child-process + SSE debugging guide
