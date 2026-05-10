# Current Status: News Crawler DB Boundary

Last checked: 2026-05-10.

## Short Answer

No, the DB-boundary migration is not complete yet.

Substantial active slices have been migrated into `news-crawler-db`, but `copilot-dl-news` still contains meaningful direct SQL and adapter ownership. The remaining work is no longer mostly about opening SQLite handles directly; it is now mostly about moving legacy query/schema contracts and runtime stores into explicit `news-crawler-db` APIs.

## What Is Already Migrated

`news-crawler-db` now owns explicit access surfaces or compatibility exports for:

- DB opening/compatibility through `openNewsCrawlerDb` and `createDbAdapter`.
- Maintenance/schema inspection helpers.
- URL listing/data-explorer reads.
- Task event persistence and telemetry readers.
- Remote crawler v2 runtime/export/sync access.
- Synchronous article search adapter.
- Guardian/place-hub diagnostics.
- User, topic, alert, and workspace legacy adapters.
- Schedule, API key, healing, template review, and push legacy adapters.
- Admin, billing, tag, trust, recommendation, sentiment, summary, similarity, coverage, and integration legacy adapters.
- Enhanced queue, planner, coverage, and crawl helper classes.
- SQLiteNewsDatabase compatibility facade and direct collaborators.
- Gazetteer v1/classic query modules, standalone GazetteerDatabase, schema helpers, and place-page mappings.
- Place-hub guessing UI queries and place-hub backfill DB writes.
- Core URL queue adapters (`IUrlQueue`, SQLite, and Postgres stub-compatible adapters).
- Active UI query modules for quality metrics, analytics, gazetteer country/place views, queues, UI themes, and crawl observer.
- SQLite/Postgres v1 generated schema definition contracts and SQLite v1 schema initializer wrappers.
- Active query modules for domain crawl behavior, analysis runs, REST article reads, rate limits, classification type UI reads, schema inspection, pattern sharing, page export, download evidence, multi-language places, topic keywords, crawl skip terms, non-geo topic slugs, layout signatures/templates/masks/adapter, place-hub UI reads, URL details, and domain summary counts.
- Place-hub candidate store.
- Gazetteer/database introspection used by the geo import UI.
- Place-hub URL pattern store.
- Active service/runtime persistence for URL pattern learning/classification consumers, hub-gap analyzers, site pattern analysis, GeoNames import, news website discovery, country-hub matching, hub task generation, intelligent crawl archive stats, crawler quick-win schema migrations, URL eligibility checks, domain registry reads, crawler URL status updates, place-hub seed persistence, country-hub planner status checks, resilience DB health checks, strategy templates, adaptive exploration, multi-goal optimization, and known hub seed reads.

The migrated copilot files are compatibility wrappers or callers; focused scans show no `.prepare(`, `.exec(`, `.pragma(`, `sqlite_master`, or common SQL statement patterns in those migrated slices.

## Current Evidence

Latest static inventory command:

```bash
rg -n "\.prepare\(|\.exec\(|\.pragma\(|sqlite_master|CREATE TABLE|INSERT INTO|SELECT\s|UPDATE\s|DELETE FROM" src/data/db src/core src/services src/ui scripts deploy checks tools --glob '!node_modules/**' --glob '!data/**' --glob '!docs/**' --glob '!**/__tests__/**' --glob '!**/*.test.js' --glob '!**/*.test.ts' --glob '!wip/**' --glob '!public/**' | wc -l
```

Result: `1586` matches.

This count is intentionally broad. It includes generated/schema artifacts and migration/tooling files, but it also still includes active runtime, check, and operational-tool modules.

Largest current match buckets:

- Active core runtime modules still owning SQL: `src/core/crawler/HierarchicalPlanner.js`, `src/core/crawler/remote/RemoteCrawlerAdapter.js`, `src/core/crawler/gazetteer/ingestors/*`, `src/core/crawler/gazetteer/GazetteerPriorityScheduler.js`, `src/core/crawler/cli/runLegacyCommand.js`, and `src/core/crawler/services/groups/StorageServices.js`.
- Postgres legacy runtime: `src/data/db/postgres/v1/PostgresNewsDatabase.js` and `queries/analysis.analysePagesCore.js`.
- Tools/scripts: gazetteer QA/dedupe/ingestion, hub discovery dev tools, remote crawl server/merge tools, URL-normalization migrations, cloud-crawl scripts, DSPL place metadata tools, schema-sync tools, and verification checks.
- Generated/migration/test-only files still need explicit classification where retained.
- False positives in active scans include XML/HTML regex loops, SPARQL query strings, and comments in sitemap, hub-validator, archive discovery, processing services, Wikidata service, and geography query builders.

## Remaining Work

Recommended priority order:

1. Move the remaining active core runtime clusters into named DB-owned APIs, starting with `HierarchicalPlanner`, the legacy `RemoteCrawlerAdapter`, and gazetteer ingestors/schedulers.
2. Decide whether to migrate or retire the legacy Postgres runtime files under `src/data/db/postgres/v1`.
3. Classify tools and scripts one by one as active, deprecated, generated, migration-only, or test-only. Active tools should call named `news-crawler-db` APIs; genuinely historical tools can remain documented exceptions until removed.

## Definition Of Done

The migration is done when:

- Active runtime, UI, checks, and operational tools in `copilot-dl-news` do not prepare SQL, execute schema migrations, inspect `sqlite_master`, or define local DB schema/query contracts.
- All meaningful DB operations are exposed by well-named `news-crawler-db` APIs.
- Copilot compatibility files are thin delegators only.
- Remaining SQL matches are either inside generated/test-only/deprecated/migration-only files with explicit documentation, or are removed.
- Validation evidence is recorded with in-memory DB tests, `news-crawler-db` builds, `node --check` on changed copilot files, and focused static scans.

## Safety Rule

Do not run validation against `copilot-dl-news/data/news.db` for this migration. Use static analysis, syntax checks, TypeScript builds, and focused in-memory tests in `news-crawler-db`.
