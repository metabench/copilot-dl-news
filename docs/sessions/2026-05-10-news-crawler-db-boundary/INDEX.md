# Session Index: News Crawler DB Boundary

Objective: Review news-crawler-db readiness, inventory copilot-dl-news direct DB usage, and migrate applicable runtime code to consume news-crawler-db instead of local DB/adapter modules.

Files:
- [PLAN.md](PLAN.md)
- [STATUS.md](STATUS.md)
- [WORKING_NOTES.md](WORKING_NOTES.md)

Current status: DB modularisation is complete for active runtime/check/tool ownership. Major DB-boundary slices have moved into `news-crawler-db`; the latest pass also migrated the Postgres Docker bootstrap SQL, final UI scenario fixture SQL, and final country-mapping coverage utility SQL. The latest broad active-path static scan finds `125` SQL/driver-pattern matches in `copilot-dl-news` after excluding docs, tests, WIP, public assets, `node_modules`, and data files. Every remaining path is classified in `config/db-boundary-residual-classifications.json` as generated/static bundles, docs/examples, source-analysis/dev-tool strings, SPARQL query builders, UI lab/check fixtures, a deprecated source mutator, or regex parser false positives. Read [STATUS.md](STATUS.md) first for the final state and Postgres parity notes.
