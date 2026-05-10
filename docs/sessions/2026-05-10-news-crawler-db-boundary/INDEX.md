# Session Index: News Crawler DB Boundary

Objective: Review news-crawler-db readiness, inventory copilot-dl-news direct DB usage, and migrate applicable runtime code to consume news-crawler-db instead of local DB/adapter modules.

Files:
- [PLAN.md](PLAN.md)
- [STATUS.md](STATUS.md)
- [WORKING_NOTES.md](WORKING_NOTES.md)

Current status: Active and not complete. Major DB-boundary slices have moved into `news-crawler-db`, `src/services` now scans clean for the active DB patterns, and the latest broad active-path static scan now finds 1,586 raw SQL/driver-pattern matches in `copilot-dl-news` after excluding docs, tests, WIP, public assets, `node_modules`, and data files. Read [STATUS.md](STATUS.md) first for the current remaining-work classification.
