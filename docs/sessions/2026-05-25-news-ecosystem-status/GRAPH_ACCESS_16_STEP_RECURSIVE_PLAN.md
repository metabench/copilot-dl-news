# GraphAccess 16-Step Recursive Plan

Date: 2026-05-25

Status: Authoritative recursive execution plan for the GraphAccess and DB-backed graph analysis track.

Source documents:

- `GRAPH_ACCESS_AND_ANALYSIS_IMPLEMENTATION_PLAN.md`
- `DB_QUERY_AND_ANALYSIS_FOCUS.md`
- `WORKING_NOTES.md`

## Mission

Build a typed, read-only `GraphAccess` surface in `news-crawler-db`, then expose graph-derived analysis through `news-db-analysis` without new raw SQL in analysis services and without large derived DB storage.

## Recursive Rules

Every numbered step must:

1. read this plan and the previous prompt,
2. implement only the current step,
3. avoid starting the next numbered step,
4. run the focused verification listed for the step,
5. update this session's `WORKING_NOTES.md`,
6. update this plan's progress table,
7. return one concise copy/paste prompt for the next step.

Prompts should stay short and refer back to this saved plan. Implementation details belong in saved documents and code, not in long chat prompts.

## Global Guardrails

- Follow each target repo's conventions. `news-crawler-db` and `news-db-analysis` currently use camelCase methods and PascalCase interfaces/classes.
- Keep DB schema knowledge inside `news-crawler-db`.
- Treat `news-db-analysis` `query` and `execute` support as legacy compatibility. New graph services must use typed accessors only.
- Keep `news-db-pure-analysis` IO-free.
- Do not add large derived tables or duplicate link/content data.
- Use async iterators, limits, cursors, and bounded reads for large graph datasets.
- No initial schema migration is expected. If a later step proposes cache tables, pause for an ADR and schema-sync plan.
- Start with SQLite. Add Postgres parity only when scoped in the relevant step or leave a typed optional capability/guard.
- Do not corrupt `news-crawler-db/src/db/sqlite/access/index.ts`; inspect encoding before editing.

## Progress Table

| Step | Status | Output |
| ---: | --- | --- |
| 1 | Completed | `GRAPH_ACCESS_STEP_01_READINESS_AUDIT.md` |
| 2 | Completed | Graph DTO and option types added to `news-crawler-db/src/db/types.ts` |
| 3 | Completed | Optional `GraphAccess` contract and `DbAdapter.graph?: GraphAccess` added to `news-crawler-db/src/db/types.ts` |
| 4 | Completed | `news-crawler-db/src/db/__tests__/graphAccess.test.ts` fixture scaffold with active graph-shape tests and TODO method-contract tests |
| 5 | Completed | `SqliteGraphAccess.iteratePageEdges()` in `news-crawler-db/src/db/sqlite/access/graph.ts` with focused tests |
| 6 | Completed | `SqliteGraphAccess.getSiteGraphSummary()` with explicit page/edge/orphan/dead-end/hub semantics |
| 7 | Completed | `SqliteGraphAccess.getHostEdgeCounts()` with host grouping, filters, and null-target preservation |
| 8 | Completed | `SqliteGraphAccess.rankPagesByInboundLinks()` and `rankPagesByOutboundLinks()` with deterministic ranking/filter tests |
| 9 | Completed | `SqliteGraphAccess.findOrphanPages()` and `findDeadEndPages()` with root-inclusion semantics and filters |
| 10 | Completed | `SqliteGraphAccess.findHubCandidates()` and `iterateCrawlPriorityFeatures()` with transparent hub thresholds and low-storage feature streaming |
| 11 | Completed | SQLite `adapter.graph` wiring, public exports, docs, and SQLite-first/Postgres-optional decision |
| 12 | Completed | `news-db-analysis` local GraphAccess DTO/access types, optional adapter capability, public exports, and missing-capability guard tests |
| 13 | Completed | `WebsiteGraphAnalysisService` summary, adjacency, and cross-domain methods over typed `GraphAccess` |
| 14 | Completed | `WebsiteGraphAnalysisService` ranking, hub, orphan, dead-end, and crawl-priority dataset methods |
| 15 | Completed | Pure graph scoring helpers deferred; `news-db-pure-analysis` build verified without source/package changes |
| 16 | Completed | Cross-repo verification, docs, residual-gap notes, and crawler feedback-loop prompt |

## Step 1: Readiness Audit And Execution Map

Objective: Confirm exact repo conventions, package scripts, adapter wiring, test helpers, type/export surfaces, and documentation targets before implementation.

Target repos:

- `copilot-dl-news`
- `../news-crawler-db`
- `../news-db-analysis`
- `../news-db-pure-analysis` for later readiness only

Work:

- Check for `AGENT.md` files in each target repo/path.
- Inspect `package.json` scripts in `news-crawler-db`, `news-db-analysis`, and `news-db-pure-analysis`.
- Inspect `news-crawler-db` adapter wiring:
  - `src/db/types.ts`
  - `src/db/sqlite/index.ts`
  - `src/db/postgres/index.ts`
  - `src/db/__tests__/helper.ts`
  - `src/db/sqlite/access/links.ts`
  - `src/db/sqlite/access/index.ts` encoding
- Inspect `news-db-analysis` surfaces:
  - `src/interfaces/NewsDbAdapter.ts`
  - `src/index.ts`
  - existing service/test naming patterns
- Save findings in `docs/sessions/2026-05-25-news-ecosystem-status/GRAPH_ACCESS_STEP_01_READINESS_AUDIT.md`.
- Update this progress table and `WORKING_NOTES.md`.

Verification:

```bash
cd /mnt/c/Users/james/Documents/repos/news-crawler-db
npm run build

cd /mnt/c/Users/james/Documents/repos/news-db-analysis
npm run build

cd /mnt/c/Users/james/Documents/repos/news-db-pure-analysis
npm run build
```

If baseline builds fail, do not fix unrelated failures in Step 1. Document exact failures and adjust later-step verification commands accordingly.

Completion prompt requirement:

- Return a concise Step 2 prompt that says to add graph DTO and option types only.

## Step 2: Add Graph DTO And Option Types In `news-crawler-db`

Objective: Add public graph read-model types without wiring adapter behavior.

Target repo: `../news-crawler-db`

Likely files:

- `src/db/types.ts`, or a split type file if Step 1 confirms that is safe
- any relevant barrel/export file identified in Step 1

Work:

- Add typed DTOs for page edges, host edge counts, page graph ranking rows, site graph summary, crawl-priority feature rows, and options.
- Use camelCase names and fields matching local repo conventions.
- Keep destination URL/host fields nullable.
- Include JSDoc on exported interfaces.
- Do not add `GraphAccess` yet unless Step 1 proves the type file requires it to compile.

Verification:

```bash
cd /mnt/c/Users/james/Documents/repos/news-crawler-db
npm run build
```

Completion prompt requirement:

- Return Step 3 prompt for adding the optional `GraphAccess` adapter contract only.

## Step 3: Add Optional `GraphAccess` Contract

Objective: Add `GraphAccess` to the `news-crawler-db` adapter contract as an optional capability.

Target repo: `../news-crawler-db`

Likely files:

- `src/db/types.ts`
- any type barrel/export file identified in Step 1

Work:

- Add `GraphAccess` with methods listed in the implementation plan.
- Add `graph?: GraphAccess` to `DbAdapter`.
- Keep Postgres parity optional at this stage.
- Do not instantiate SQLite `graph` yet.
- Keep public JSDoc clear that this is read-only graph analysis access.

Verification:

```bash
cd /mnt/c/Users/james/Documents/repos/news-crawler-db
npm run build
```

Completion prompt requirement:

- Return Step 4 prompt for SQLite graph fixtures and tests only.

## Step 4: Build SQLite Graph Fixtures And Tests

Objective: Create the fixture graph and test shell that will drive SQLite implementation.

Target repo: `../news-crawler-db`

Likely files:

- `src/db/__tests__/graphAccess.test.ts`
- `src/db/__tests__/helper.ts` only if needed to add graph access later

Work:

- Create a small in-memory fixture graph with:
  - a home page,
  - section page,
  - multiple article pages,
  - orphan page,
  - dead-end page,
  - internal links,
  - external links,
  - one missing/null destination edge if schema/test helpers allow it.
- Add tests for all planned methods, using skipped/TODO tests only if the repo style supports it cleanly.
- Prefer failing tests for the next implementation steps if the local workflow accepts red tests; otherwise create focused tests alongside each later step.
- Do not implement `SqliteGraphAccess` behavior in this step.

Verification:

```bash
cd /mnt/c/Users/james/Documents/repos/news-crawler-db
npm run build
npx vitest run src/db/__tests__/graphAccess.test.ts
```

If tests intentionally fail because implementation is not present, document that clearly in `WORKING_NOTES.md` and in the next prompt.

Completion prompt requirement:

- Return Step 5 prompt for implementing `iteratePageEdges()` only.

## Step 5: Implement `iteratePageEdges()`

Objective: Add the first read-only SQLite graph query: paginated page edge iteration.

Target repo: `../news-crawler-db`

Likely files:

- `src/db/sqlite/access/graph.ts`
- `src/db/__tests__/graphAccess.test.ts`

Work:

- Implement `SqliteGraphAccess.iteratePageEdges(options?)`.
- Join `links` to source and target `urls`.
- Preserve null/missing target IDs.
- Support host filtering, limit, batch size, and keyset cursor where practical.
- Avoid `SELECT *`.
- Keep all writes out of this access module.

Verification:

```bash
cd /mnt/c/Users/james/Documents/repos/news-crawler-db
npm run build
npx vitest run src/db/__tests__/graphAccess.test.ts
```

Completion prompt requirement:

- Return Step 6 prompt for `getSiteGraphSummary()` only.

## Step 6: Implement `getSiteGraphSummary()`

Objective: Add bounded site-level graph summary counts.

Target repo: `../news-crawler-db`

Likely files:

- `src/db/sqlite/access/graph.ts`
- `src/db/__tests__/graphAccess.test.ts`

Work:

- Implement `getSiteGraphSummary(host, options?)`.
- Count pages, fetched pages, edges, internal/external edges, orphan pages, dead-end pages, and candidate hubs.
- Define and document exact semantics for orphan and dead-end counts.
- Use indexed host/URL/link paths.

Verification:

```bash
cd /mnt/c/Users/james/Documents/repos/news-crawler-db
npm run build
npx vitest run src/db/__tests__/graphAccess.test.ts
```

Completion prompt requirement:

- Return Step 7 prompt for `getHostEdgeCounts()` only.

## Step 7: Implement `getHostEdgeCounts()`

Objective: Add host-to-host graph aggregation over existing links.

Target repo: `../news-crawler-db`

Likely files:

- `src/db/sqlite/access/graph.ts`
- `src/db/__tests__/graphAccess.test.ts`

Work:

- Implement `getHostEdgeCounts(options?)`.
- Group source host to target host.
- Include unique source page count and unique target page count.
- Preserve external and null target cases.
- Support limit and source host filtering.

Verification:

```bash
cd /mnt/c/Users/james/Documents/repos/news-crawler-db
npm run build
npx vitest run src/db/__tests__/graphAccess.test.ts
```

Completion prompt requirement:

- Return Step 8 prompt for inbound/outbound page ranking only.

## Step 8: Implement Inbound And Outbound Page Ranking

Objective: Add page ranking read models based on inbound and outbound link counts.

Target repo: `../news-crawler-db`

Likely files:

- `src/db/sqlite/access/graph.ts`
- `src/db/__tests__/graphAccess.test.ts`

Work:

- Implement `rankPagesByInboundLinks(host, options?)`.
- Implement `rankPagesByOutboundLinks(host, options?)`.
- Return internal/external counts and URL metadata.
- Make sort order deterministic with a stable secondary key.
- Keep default limit conservative.

Verification:

```bash
cd /mnt/c/Users/james/Documents/repos/news-crawler-db
npm run build
npx vitest run src/db/__tests__/graphAccess.test.ts
```

Completion prompt requirement:

- Return Step 9 prompt for orphan and dead-end detection only.

## Step 9: Implement Orphan And Dead-End Detection

Objective: Add explicit graph gap readers for pages with weak graph connectivity.

Target repo: `../news-crawler-db`

Likely files:

- `src/db/sqlite/access/graph.ts`
- `src/db/__tests__/graphAccess.test.ts`

Work:

- Implement `findOrphanPages(host, options?)`.
- Implement `findDeadEndPages(host, options?)`.
- Document whether seed/home pages are excluded by default.
- Return ranking row shape or a dedicated page-discovery row if Step 2 created one.
- Support limit and deterministic ordering.

Verification:

```bash
cd /mnt/c/Users/james/Documents/repos/news-crawler-db
npm run build
npx vitest run src/db/__tests__/graphAccess.test.ts
```

Completion prompt requirement:

- Return Step 10 prompt for hub candidates and crawl-priority features only.

## Step 10: Implement Hub Candidates And Crawl-Priority Features

Objective: Add first graph-derived datasets that can later feed crawling decisions.

Target repo: `../news-crawler-db`

Likely files:

- `src/db/sqlite/access/graph.ts`
- `src/db/__tests__/graphAccess.test.ts`

Work:

- Implement `findHubCandidates(host, options?)`.
- Implement `iterateCrawlPriorityFeatures(host, options?)`.
- Keep hub scoring simple and transparent: e.g. outbound article/internal counts, inbound counts, classification hints, missing/stale content flags if available.
- Do not persist derived results.
- Add a small benchmark or `EXPLAIN QUERY PLAN` note if the query is likely to scan many rows.

Verification:

```bash
cd /mnt/c/Users/james/Documents/repos/news-crawler-db
npm run build
npx vitest run src/db/__tests__/graphAccess.test.ts
```

Completion prompt requirement:

- Return Step 11 prompt for wiring adapter exports/docs only.

## Step 11: Wire `adapter.graph`, Exports, Docs, And Postgres Decision

Objective: Make `GraphAccess` available through `news-crawler-db`'s real SQLite adapter and docs.

Target repo: `../news-crawler-db`

Likely files:

- `src/db/sqlite/index.ts`
- `src/db/__tests__/helper.ts`
- `src/db/index.ts`
- `docs/ACCESS_API.md`
- `docs/DATABASE_SCHEMA.md`
- possible ADR under `docs/decisions/`

Work:

- Instantiate `graph` in `createSqliteAdapter()`.
- Add `graph` to test helper adapters.
- Export the implementation safely.
- Decide and document Postgres behavior:
  - leave absent because `graph` is optional, or
  - add typed guard if the adapter style requires it.
- Update docs with the graph read model and storage policy.
- Do not run schema sync unless schema changed.

Verification:

```bash
cd /mnt/c/Users/james/Documents/repos/news-crawler-db
npm run build
npx vitest run src/db/__tests__/graphAccess.test.ts
npx vitest run src/db/__tests__
```

Completion prompt requirement:

- Return Step 12 prompt for `news-db-analysis` graph adapter types and guard only.

## Step 12: Add `news-db-analysis` Graph Adapter Types And Guard

Objective: Let analysis services depend on `db.graph` without raw SQL and without breaking existing mocks.

Target repo: `../news-db-analysis`

Likely files:

- `src/interfaces/NewsDbAdapter.ts`
- optional `src/interfaces/GraphAccess.ts` or similar if cleaner
- `tests/WebsiteGraphAnalysisService.test.ts` or a dedicated guard test
- `src/index.ts` only if new public types need exports

Work:

- Add local graph DTO/access types compatible with `news-crawler-db`.
- Add `graph?: GraphAccess` to `NewsDbAdapter`.
- Add a small guard helper, e.g. `requireGraphAccess(db)`.
- Test that missing graph support throws a clear error.
- Do not add service methods beyond the guard/type work.
- Do not call `db.query` or `db.execute`.

Verification:

```bash
cd /mnt/c/Users/james/Documents/repos/news-db-analysis
npm run build
npx vitest run tests/WebsiteGraphAnalysisService.test.ts
```

Completion prompt requirement:

- Return Step 13 prompt for the first `WebsiteGraphAnalysisService` methods only.

## Step 13: Add Website Graph Summary, Adjacency, And Cross-Domain Methods

Objective: Create the first user-facing graph analysis service methods over typed DB accessors.

Target repo: `../news-db-analysis`

Likely files:

- `src/services/WebsiteGraphAnalysisService.ts`
- `tests/WebsiteGraphAnalysisService.test.ts`
- `src/index.ts`

Work:

- Implement constructor and graph guard.
- Implement `summarizeSiteGraph(host, options?)`.
- Implement `getPageAdjacency(host, options?)`.
- Implement `getCrossDomainLinking(host, options?)`.
- Return analysis-shaped results where useful, not only raw DB rows.
- Add focused unit tests with mocked `graph` access.

Verification:

```bash
cd /mnt/c/Users/james/Documents/repos/news-db-analysis
npm run build
npx vitest run tests/WebsiteGraphAnalysisService.test.ts
```

Completion prompt requirement:

- Return Step 14 prompt for remaining service methods only.

## Step 14: Add Ranking, Hub, Orphan, Dead-End, And Priority Methods

Objective: Complete the first pass of `WebsiteGraphAnalysisService`.

Target repo: `../news-db-analysis`

Likely files:

- `src/services/WebsiteGraphAnalysisService.ts`
- `tests/WebsiteGraphAnalysisService.test.ts`
- docs if API details are now stable

Work:

- Implement `rankPagesByGraphImportance(host, options?)`.
- Implement `findHubCandidates(host, options?)`.
- Implement `findOrphanPages(host, options?)`.
- Implement `findDeadEndPages(host, options?)`.
- Implement `buildCrawlPriorityDataset(host, options?)`.
- Add dataset manifest metadata for streamable/large outputs where practical.
- Keep ranking transparent and deterministic.
- Do not add pure-analysis dependency unless clearly required.

Verification:

```bash
cd /mnt/c/Users/james/Documents/repos/news-db-analysis
npm run build
npx vitest run tests/WebsiteGraphAnalysisService.test.ts
npm run test:run
```

Completion prompt requirement:

- Return Step 15 prompt for pure graph helpers or explicit deferral only.

## Step 15: Add Or Defer Pure Graph Scoring Helpers

Objective: Move algorithmic graph scoring into `news-db-pure-analysis` only if Step 14 shows it is needed.

Target repo: `../news-db-pure-analysis`

Likely files if implemented:

- a graph/scoring source file following package conventions
- matching tests
- public exports

Work:

- Decide whether pure helpers are needed now.
- If needed, add deterministic IO-free helpers such as hub score, crawl-priority score, or small in-memory graph summary.
- If not needed, document deferral in the session notes and avoid unnecessary package churn.
- Keep DTO inputs plain and package-independent.

Verification if implemented:

```bash
cd /mnt/c/Users/james/Documents/repos/news-db-pure-analysis
npm run build
npx vitest run
```

Verification if deferred:

```bash
cd /mnt/c/Users/james/Documents/repos/news-db-pure-analysis
npm run build
```

Completion prompt requirement:

- Return Step 16 prompt for cross-repo verification and final docs only.

## Step 16: Cross-Repo Verification, Documentation, And Next Integration Prompt

Objective: Verify the graph access and analysis surface end to end, document it, and prepare the next track for crawler feedback integration.

Target repos:

- `../news-crawler-db`
- `../news-db-analysis`
- `../news-db-pure-analysis` if touched
- `copilot-dl-news`

Work:

- Run focused and broader verification.
- Update docs:
  - `news-crawler-db/docs/ACCESS_API.md`
  - `news-crawler-db/docs/DATABASE_SCHEMA.md`
  - `news-db-analysis/docs/04-types-and-interfaces.md`
  - `news-db-analysis/docs/06-services.md`
  - this session's `WORKING_NOTES.md`
  - this plan's progress table
  - active long-term session notes if appropriate
- Add ADR-lite notes if any major tradeoffs were made.
- Confirm no large derived DB storage was added.
- Confirm no new raw SQL graph service was added in `news-db-analysis`.
- Prepare a concise next prompt for crawler feedback-loop integration.

Verification:

```bash
cd /mnt/c/Users/james/Documents/repos/news-crawler-db
npm run build
npx vitest run src/db/__tests__/graphAccess.test.ts
npx vitest run src/db/__tests__

cd /mnt/c/Users/james/Documents/repos/news-db-analysis
npm run build
npm run test:run

cd /mnt/c/Users/james/Documents/repos/copilot-dl-news
npm run db:downloads:hosts
npm run db:downloads:recent
```

Avoid broad aggregate scans unless they are bounded or known to complete.

Completion prompt requirement:

- Do not return a Step 17 prompt.
- Return a concise final summary plus a next-track prompt for crawler feedback-loop integration.
