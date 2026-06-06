# GraphAccess And Analysis Implementation Plan

Date: 2026-05-25

Status: Planning artifact. Do not treat this as implementation-complete.

## Executive Summary

Build a typed, read-only graph query surface in `news-crawler-db`, then expose it through `news-db-analysis` as human-meaningful analysis services and low-storage datasets.

The goal is not to add a graph database or duplicate link data. The goal is to make the already-collected crawl graph easy to query, understand, stream, and use for crawl prioritisation and knowledge representation.

## Current Evidence

- `news-crawler-db` owns active DB access for the news ecosystem.
- `links` already stores page edges with `src_url_id`, `dst_url_id`, `anchor`, `rel`, `type`, `depth`, `on_domain`, and `discovered_at`.
- `urls` already stores URL, host, path, status, depth, response metadata, title, word count, links found, classification, and timestamps.
- `news-db-analysis` has service scaffolding and a large requirements document, but its current adapter still exposes raw `query` and `execute`.
- For this graph work, raw SQL in `news-db-analysis` should be treated as legacy. New graph services should consume typed `news-crawler-db` access methods only.
- `news-db-pure-analysis` should remain IO-free and receive DTO arrays or iterables.
- After `npm rebuild better-sqlite3` in `../news-crawler-db`, local recent-download and host breakdown commands work again.

Recent DB evidence after rebuild:

- Highest-volume host: `www.theguardian.com`, 92,215 downloads, 88,464 OK.
- `www.bbc.com`, 48,856 downloads, 48,370 OK.
- Additional high-volume hosts include DW, Al Jazeera, AP, CNN, NYTimes, France24, ABC Australia, NPR, and others.
- The broad `npm run db:downloads:stats` command was stopped after a long scan; that reinforces the need for bounded analysis APIs.

## Non-Goals

- Do not create a new graph database.
- Do not add large materialized edge tables.
- Do not duplicate article bodies, documents, or links in analysis tables.
- Do not make `news-db-analysis` issue new raw SQL for graph questions.
- Do not solve every analysis category at once.
- Do not mix jsgui3 platform work into this track.

## Target Architecture

```text
copilot-dl-news / backend / tools
        |
        v
news-db-analysis
  WebsiteGraphAnalysisService
  CorpusGraphAnalysisService
  CrawlPriorityDatasetService
        |
        v
news-crawler-db
  GraphAccess
  UrlsAccess
  LinksAccess
  DocumentsAccess
  ClassificationAccess
        |
        v
data/news.db
  urls
  links
  http_responses
  content_storage
  content_analysis
  url_classifications
  places
```

Pure algorithms that do not need IO belong in `news-db-pure-analysis`:

```text
news-db-analysis gathers DTO streams
        |
        v
news-db-pure-analysis computes ranks, clusters, graph metrics, summaries
        |
        v
news-db-analysis returns compact datasets or streams
```

## Design Principles

1. The DB module owns schema knowledge.
2. Analysis services own question wording and result composition.
3. Pure analysis owns algorithms.
4. Large datasets use async iterators or NDJSON streams.
5. Persist only compact summaries when caching is clearly justified.
6. Public APIs use typed DTOs, not `any`.
7. Every query path must be testable against a small fixture DB.
8. Heavy corpus scans must have limits, host filters, cursors, or explicit streaming semantics.
9. Follow each target repo's existing TypeScript style. The sibling packages currently use camelCase methods and PascalCase interfaces/classes, not the snake_case backend-core convention.
10. Treat `news-db-analysis` raw `query` and `execute` support as legacy compatibility. New graph services must not use it.

## Review Improvements: 2026-05-25

This review tightened the plan in four ways:

1. The first implementation step must inspect exact adapter wiring, test helpers, and package scripts before writing code.
2. `GraphAccess` should be optional on shared adapter interfaces until both SQLite and Postgres parity decisions are made; services that require it should fail with a clear runtime guard.
3. The first usable delivery should focus on SQLite read models and `WebsiteGraphAnalysisService`; pure graph algorithms should be added only when the analysis service needs behavior that DB aggregation cannot provide cleanly.
4. No schema migration is expected for the initial work because it reads existing `urls` and `links` tables. If a later cache table is proposed, that becomes a separate decision with schema-sync requirements.

## Work Package 1: DB Access Contract

Target repo: `../news-crawler-db`

Create a first-class `GraphAccess` interface and related DTOs. Prefer adding a dedicated type file if the current `src/db/types.ts` is too large.

Candidate files:

- `src/db/types.ts`
- `src/db/types/graph.ts` if the repo already accepts split type files
- `src/db/sqlite/access/graph.ts`
- `src/db/sqlite/access/index.ts`
- adapter construction files that instantiate access modules
- `src/db/__tests__/graphAccess.test.ts`
- `docs/ACCESS_API.md`

Implementation note: inspect `src/db/sqlite/access/index.ts` encoding before editing it. In the current checkout it prints with NUL characters in this shell, so future steps must avoid corrupting it with unsafe text edits. If exports can be made through `src/db/sqlite/index.ts` and top-level `src/db/index.ts` instead, prefer that route.

Initial DTOs:

```ts
export interface GraphPageEdge {
  linkId: number;
  sourceUrlId: number;
  targetUrlId: number | null;
  sourceUrl: string;
  targetUrl: string | null;
  sourceHost: string | null;
  targetHost: string | null;
  sourcePath: string | null;
  targetPath: string | null;
  anchor: string | null;
  rel: string | null;
  type: string | null;
  depth: number | null;
  onDomain: boolean | null;
  discoveredAt: string;
}

export interface GraphHostEdgeCount {
  sourceHost: string;
  targetHost: string | null;
  edgeCount: number;
  uniqueSourcePageCount: number;
  uniqueTargetPageCount: number;
  internal: boolean;
}

export interface GraphPageRankRow {
  urlId: number;
  url: string;
  host: string | null;
  path: string | null;
  title: string | null;
  classification: string | null;
  inboundInternalCount: number;
  inboundExternalCount: number;
  outboundInternalCount: number;
  outboundExternalCount: number;
}

export interface SiteGraphSummary {
  host: string;
  pageCount: number;
  fetchedPageCount: number;
  edgeCount: number;
  internalEdgeCount: number;
  externalEdgeCount: number;
  orphanPageCount: number;
  deadEndPageCount: number;
  candidateHubCount: number;
}
```

Initial `GraphAccess` methods:

```ts
export interface GraphAccess {
  iteratePageEdges(options?: GraphPageEdgeOptions): AsyncIterable<GraphPageEdge>;
  getSiteGraphSummary(host: string, options?: SiteGraphOptions): Promise<SiteGraphSummary>;
  getHostEdgeCounts(options?: HostEdgeCountOptions): Promise<GraphHostEdgeCount[]>;
  rankPagesByInboundLinks(host: string, options?: PageRankOptions): Promise<GraphPageRankRow[]>;
  rankPagesByOutboundLinks(host: string, options?: PageRankOptions): Promise<GraphPageRankRow[]>;
  findOrphanPages(host: string, options?: PageDiscoveryOptions): Promise<GraphPageRankRow[]>;
  findDeadEndPages(host: string, options?: PageDiscoveryOptions): Promise<GraphPageRankRow[]>;
  findHubCandidates(host: string, options?: HubCandidateOptions): Promise<GraphPageRankRow[]>;
  iterateCrawlPriorityFeatures(host: string, options?: CrawlPriorityFeatureOptions): AsyncIterable<CrawlPriorityFeatureRow>;
}
```

Naming can follow the local repo style if it differs from this sketch. Preserve existing public style in `news-crawler-db`.

Contract decision for the first implementation pass:

- Add `graph?: GraphAccess` to `DbAdapter` first.
- Instantiate it for SQLite.
- Either leave Postgres without `graph` or add a clear not-implemented guard, depending on the existing adapter expectations discovered in Step 1.
- Do not make graph required until both adapters can satisfy it or callers have a documented capability check.

## Work Package 2: SQLite Implementation

Target repo: `../news-crawler-db`

Implement read-only SQLite queries over existing tables.

Core joins:

- `links.src_url_id -> urls.id` as source URL
- `links.dst_url_id -> urls.id` as target URL
- source and target URL rows provide host/path/status/classification/title fields
- optional response/content joins should be added only when needed for a specific DTO

Query requirements:

- Every method accepts `limit` where result size can grow.
- Iterator methods use keyset pagination by `links.id` or another stable indexed key where practical.
- Host-filtered methods use `urls.host`.
- Edge methods preserve rows with missing target URL IDs.
- Avoid `SELECT *`.
- Keep large operations indexed by `links.src_url_id`, `links.dst_url_id`, `urls.host`, `urls.status`, and `urls.id`.
- Add `EXPLAIN QUERY PLAN` checks or a small benchmark for at least the highest-risk summary/ranking queries if they touch many rows.

Implementation tests should seed a small graph:

- one host with a home page, section page, article pages, orphan page, and dead-end page,
- internal links,
- external links,
- one link with missing target,
- classifications on a subset of URLs.

Test assertions:

- summary counts are correct,
- orphan detection excludes seed/home if policy says so,
- dead-end detection is deterministic,
- inbound/outbound ranks sort correctly,
- host edge counts group internal and external edges,
- iterator pagination returns all rows without duplication,
- no method writes to the database.
- result DTOs preserve null target URLs instead of crashing,
- limits and offsets/cursors are deterministic.

## Work Package 3: Adapter Wiring And Docs

Target repo: `../news-crawler-db`

Wire `graph` into the exported adapter surface. The adapter should expose:

```ts
adapter.graph
```

Documentation updates:

- `docs/ACCESS_API.md`: add `graph -> GraphAccess`.
- `docs/DATABASE_SCHEMA.md`: add a short "Graph Read Models" note near `links`.
- Any generated docs should be updated only through the repo's established doc workflow.

Compatibility:

- SQLite should be implemented first.
- Postgres can either implement parity immediately or expose a typed not-yet-implemented guard if the repo already uses that pattern.
- Do not let optional Postgres work block the SQLite graph API if SQLite is the active local/default backend.
- Because this is read-only over existing tables, do not run schema sync unless a later step adds or changes schema.

## Work Package 4: Analysis Adapter Alignment

Target repo: `../news-db-analysis`

Update `src/interfaces/NewsDbAdapter.ts` to include an optional or required `graph` accessor, depending on how the existing services treat optional DB capabilities.

Recommended direction:

- Add `graph?: GraphAccess` first to avoid breaking existing mocks.
- Add a runtime guard helper for services that require graph support.
- Keep `query` and `execute` in the interface for legacy services, but explicitly avoid using them in new graph services.
- Prefer locally defined graph DTO contracts in `news-db-analysis` unless the package already imports public types from `news-crawler-db` cleanly. Avoid creating a hard circular or fragile workspace dependency just for types.

Candidate files:

- `src/interfaces/NewsDbAdapter.ts`
- `src/services/WebsiteGraphAnalysisService.ts`
- `src/services/CorpusGraphAnalysisService.ts` later
- `src/services/CrawlPriorityDatasetService.ts` later
- `tests/WebsiteGraphAnalysisService.test.ts`
- `docs/06-services.md`
- `docs/04-types-and-interfaces.md`
- `src/index.ts`

## Work Package 5: Website Graph Analysis Service

Target repo: `../news-db-analysis`

Create `WebsiteGraphAnalysisService`.

Initial methods:

```ts
summarizeSiteGraph(host: string, options?: SiteGraphAnalysisOptions): Promise<SiteGraphAnalysisSummary>
getPageAdjacency(host: string, options?: PageAdjacencyOptions): AsyncIterable<GraphPageEdge>
rankPagesByGraphImportance(host: string, options?: GraphImportanceOptions): Promise<GraphPageImportanceRow[]>
findHubCandidates(host: string, options?: HubCandidateAnalysisOptions): Promise<HubCandidatePage[]>
findOrphanPages(host: string, options?: OrphanPageOptions): Promise<GraphPageImportanceRow[]>
findDeadEndPages(host: string, options?: DeadEndPageOptions): Promise<GraphPageImportanceRow[]>
getCrossDomainLinking(host: string, options?: CrossDomainOptions): Promise<GraphHostEdgeCount[]>
buildCrawlPriorityDataset(host: string, options?: CrawlPriorityDatasetOptions): AsyncIterable<CrawlPriorityFeatureRow>
```

Service rules:

- Constructor accepts `NewsDbAdapter`.
- Throw a clear error if `db.graph` is unavailable.
- Do not call `db.query` or `db.execute`.
- Compose DB access results into analysis result objects.
- Use pure analysis helpers for algorithmic ranking once those helpers exist.
- Keep default limits conservative.
- Expose small, named result shapes that are useful to humans and agents, not just DB row mirrors.
- Include dataset manifest metadata for large/streamable outputs where practical.

## Work Package 6: Pure Graph Algorithms

Target repo: `../news-db-pure-analysis`

Only add this package when the analysis service needs algorithmic behavior beyond simple DB aggregation.

Candidate pure functions:

```ts
scoreHubCandidate(row)
scoreCrawlPriorityFeature(row)
computeInMemoryPageRank(edges, options)
findConnectedComponents(edges, options)
summarizeHostGraph(edges, options)
```

Rules:

- No DB imports.
- No filesystem/network IO.
- Deterministic functions over DTOs.
- Tests use small arrays.

## Work Package 7: Low-Storage Dataset Surface

Target repos:

- `../news-db-analysis`
- later `../news-crawler-backend-core` or this repo if exposing over HTTP/CLI

Define dataset manifests so agents and tools can ask for named derived datasets without knowing SQL.

Initial dataset names:

- `site_graph_summary`
- `page_adjacency`
- `host_edge_counts`
- `hub_candidates`
- `orphan_pages`
- `dead_end_pages`
- `inbound_page_ranking`
- `crawl_priority_features`
- `knowledge_seed_pages`

Each dataset should declare:

- source DB accessor methods,
- parameters,
- output format,
- storage policy,
- expected size,
- freshness policy,
- whether it is streamable.

## Work Package 8: Crawl Feedback Integration

Target repo: `copilot-dl-news`

After graph datasets exist, wire them into crawler planning without creating new DB-boundary leaks.

Candidate uses:

- prioritize hub candidates,
- revisit pages with high inbound links and missing/stale content,
- identify domains discovered through cross-domain links,
- detect hosts with many dead ends,
- detect sites where crawler coverage is structurally thin,
- feed graph facts into URL/document/general intelligence modules.

This should happen after the DB and analysis APIs are stable.

## Verification Plan

Run repo-local tests after each implementation step.

`news-crawler-db`:

```bash
npm install
npm run build
npx vitest run src/db/__tests__/graphAccess.test.ts
npx vitest run src/db/__tests__
```

The package currently uses Vitest. Adjust exact test paths only after Step 1 confirms the final test location.

`news-db-analysis`:

```bash
npm install
npm run build
npx vitest run tests/WebsiteGraphAnalysisService.test.ts
npm run test:run
```

Cross-repo checks:

```bash
cd /mnt/c/Users/james/Documents/repos/copilot-dl-news
npm run db:downloads:hosts
npm run db:downloads:recent
```

Avoid broad aggregate scans unless they are bounded or known to complete quickly.

## Documentation Plan

Update:

- this session folder,
- `news-crawler-db/docs/ACCESS_API.md`,
- `news-db-analysis/docs/04-types-and-interfaces.md`,
- `news-db-analysis/docs/06-services.md`,
- a short ADR in the implementation repo if a meaningful tradeoff is made,
- the active long-term session notes when a real implementation milestone lands.

## Risks

1. Current `news-db-analysis` services still normalize raw SQL as a pattern. New graph work must establish a cleaner pattern.
2. Host/path/url normalization may differ across old rows; graph queries must not assume every row is clean.
3. Some links may have null or missing destination IDs.
4. Full-corpus graph operations can be expensive on a large DB.
5. Postgres parity may lag SQLite unless explicitly scoped.
6. Older docs may be stale relative to current code.
7. Existing access code mixes Drizzle and raw SQLite handles; Step 1 must choose the least risky implementation style per query.
8. Optional graph capability must not break existing test mocks across `news-db-analysis`.

## Success Criteria

The first implementation phase is successful when:

1. `news-crawler-db` exposes `adapter.graph`.
2. `GraphAccess` answers site summary, page edges, host edge counts, page ranking, hub candidates, orphan pages, and dead-end pages.
3. `news-db-analysis` exposes `WebsiteGraphAnalysisService`.
4. The service calls only `db.graph` and other typed accessors, never raw SQL.
5. Large results can be streamed or paginated.
6. No large derived storage is added.
7. Tests cover fixture graphs and missing optional graph support.
8. Docs explain how other parts of the ecosystem should consume graph analysis.
9. Verification commands are recorded in the session notes and no long-running DB stats scans are left running.

## Recommended Recursive Execution Model

Do not attempt all of this in one implementation session.

Use a 16-step recursive plan. Each step should:

1. read this plan and the previous step's prompt,
2. implement only the current step,
3. run focused verification,
4. update session docs,
5. write the next concise copy/paste prompt for the following step.

The details should stay in saved markdown files. Prompts should stay concise and point to the saved plan.

## Candidate 16-Step Split For The Next Planning Pass

This is a candidate split, not the authoritative recursive plan. The next planning pass should review and improve it before saving the final 16-step process.

1. Confirm repo conventions, exact package scripts, current adapter construction paths, and session-doc locations.
2. Add graph DTOs and option types to `news-crawler-db`, following local camelCase style.
3. Add optional `GraphAccess` to the `news-crawler-db` adapter contract without forcing Postgres parity yet.
4. Build SQLite graph fixture helpers and fixture tests.
5. Implement `iteratePageEdges()` with pagination and host filtering.
6. Implement `getSiteGraphSummary()`.
7. Implement `getHostEdgeCounts()`.
8. Implement inbound/outbound page ranking.
9. Implement orphan page and dead-end page detection.
10. Implement hub candidate detection and initial crawl-priority feature iteration.
11. Wire `adapter.graph`, update `news-crawler-db` exports/docs, and decide Postgres guard/parity behavior.
12. Update `news-db-analysis` adapter types with optional `graph` plus a clear guard helper.
13. Add `WebsiteGraphAnalysisService` summary, adjacency, and cross-domain methods.
14. Add `WebsiteGraphAnalysisService` rank, hub, orphan, dead-end, and crawl-priority methods.
15. Add or defer pure graph scoring helpers in `news-db-pure-analysis`, depending on what Step 14 actually needs.
16. Run cross-repo verification, update docs, and produce the next integration prompt for crawler feedback-loop work.
