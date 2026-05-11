# Session Index: News Crawler DB Boundary

Objective: Review news-crawler-db readiness, inventory copilot-dl-news direct DB usage, and migrate applicable runtime code to consume news-crawler-db instead of local DB/adapter modules.

Files:
- [PLAN.md](PLAN.md)
- [STATUS.md](STATUS.md)
- [WORKING_NOTES.md](WORKING_NOTES.md)

Current status: Active and near the DB-boundary finish line for runtime/check/tool code. Major DB-boundary slices have moved into `news-crawler-db`; the latest pass also migrated Postgres health checks, SQLite migration utility scripts, remaining debug/check read models, gazetteer export iterators, snapshot verification, URL-classification samples, site-pattern listing, crawl-site threshold checks, benchmark probes, locale seeding, analytics download-history reads, unified-app dashboard counts, topic-hub cell samples, and the remaining active DB smoke probes. The latest broad active-path static scan finds `189` SQL/driver-pattern matches in `copilot-dl-news` after excluding docs, tests, WIP, public assets, `node_modules`, and data files. The remaining matches are classified as migration/deploy SQL artifacts, docs/examples, generated/static bundles, source-analysis/dev-tool strings, SPARQL query builders, or regex parser false positives. Read [STATUS.md](STATUS.md) first for the remaining migration-artifact relocation and SQLite/Postgres parity notes.
