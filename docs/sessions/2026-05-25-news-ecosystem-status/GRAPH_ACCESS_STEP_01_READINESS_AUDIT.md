# GraphAccess Step 1 Readiness Audit

Date: 2026-05-25

Step: 1 of 16, Readiness Audit And Execution Map.

Status: Complete. No GraphAccess implementation was performed.

## Scope

This audit confirms repo conventions, package scripts, adapter wiring, test helper shape, type/export surfaces, and baseline build status before Step 2 adds graph DTO and option types.

Target repos inspected:

- `/mnt/c/Users/james/Documents/repos/copilot-dl-news`
- `/mnt/c/Users/james/Documents/repos/news-crawler-db`
- `/mnt/c/Users/james/Documents/repos/news-db-analysis`
- `/mnt/c/Users/james/Documents/repos/news-db-pure-analysis`

## AGENT.md Files

No path-local `AGENT.md` files were found under the three sibling repos with the Step 1 search scope:

- `news-crawler-db`
- `news-db-analysis`
- `news-db-pure-analysis`

Use the current `copilot-dl-news/AGENTS.md` and the saved session plan as the governing instructions for this track.

## Package Scripts

### news-crawler-db

Relevant scripts:

```json
{
  "build": "tsc",
  "test": "vitest",
  "lint": "eslint src --ext .ts",
  "db:generate": "drizzle-kit generate",
  "db:push": "drizzle-kit push",
  "db:check": "tsx src/scripts/check-db.ts",
  "docs:audit": "node tools/doc-review/schema-audit.js --fix-hints",
  "docs:audit:ci": "node tools/doc-review/schema-audit.js --json"
}
```

Step 2 verification should use:

```bash
cd /mnt/c/Users/james/Documents/repos/news-crawler-db
npm run build
```

Later focused tests should use `npx vitest run <path>`.

### news-db-analysis

Relevant scripts:

```json
{
  "build": "tsc",
  "test": "vitest",
  "test:run": "vitest run"
}
```

Use `npm run build` plus focused `npx vitest run tests/WebsiteGraphAnalysisService.test.ts` in later steps.

### news-db-pure-analysis

Relevant scripts:

```json
{
  "build": "tsup src/index.ts --format cjs,esm --dts",
  "test": "vitest",
  "lint": "tsc --noEmit"
}
```

Baseline build currently fails because Rollup's optional native package is missing from `node_modules`. Do not route Step 2 through this repo.

## Git State Notes

- `news-crawler-db` appeared clean after the baseline build.
- `news-db-pure-analysis` appeared clean, but its build cannot start until dependency state is repaired.
- `news-db-analysis` has many pre-existing modified files unrelated to this Step 1 audit. Future steps touching `news-db-analysis` must avoid reverting unrelated user/workspace changes and should inspect touched files carefully before editing.

## news-crawler-db Readiness

### Type Surface

Primary type file:

- `src/db/types.ts`

Current observations:

- `DbAdapter` is declared in `src/db/types.ts`.
- Existing access interfaces live in the same file, including `LinksAccess`, `DocumentsAccess`, and many specialized access surfaces.
- `links?: LinksAccess` is already optional on `DbAdapter`.
- The public type file already contains placeholder `any` types, including `ArticleAnalysis = any`, `LinksAccess.insertLink(link: any)`, and `LinksAccess.getLinksForUrl(... options?: any): Promise<any[]>`.
- Step 2 should add graph DTO and option types to `src/db/types.ts` first. A split `src/db/types/graph.ts` file was not found as an established pattern, so splitting types would add more export work than necessary at this stage.

### SQLite Adapter Wiring

Primary file:

- `src/db/sqlite/index.ts`

Current observations:

- `createSqliteAdapter(config)` builds a `DbAdapter` object directly.
- It imports access classes near the top and instantiates them in the adapter object.
- Existing graph-adjacent access:
  - `links: new SqliteLinksAccess(db)`
  - `documents: new SqliteDocumentsAccess(db)`
  - `hubGapAnalysis: createSqliteHubGapAnalysisAccess(sqlite)`
  - `databaseIntrospection: createSqliteDatabaseIntrospectionAccess(sqlite)`
- Some access modules use Drizzle `db`; others use the raw `better-sqlite3` handle `sqlite`.
- For complex graph aggregation, later steps may choose either style. The least risky choice should be made in the implementation step based on query complexity and testability.

### Postgres Adapter Wiring

Primary file:

- `src/db/postgres/index.ts`

Current observations:

- `createPostgresAdapter(config)` returns a `DbAdapter`.
- It already instantiates `links: new PostgresLinksAccess(db)`.
- There is no graph access surface.
- Step 3 should add `graph?: GraphAccess` as optional. Step 11 can either leave Postgres without `graph` or add a typed guard, depending on what adapter expectations look like after SQLite implementation.

### Test Helper

Primary file:

- `src/db/__tests__/helper.ts`

Current observations:

- `createTestDb()` creates an in-memory SQLite adapter, runs migrations, and manually constructs access modules.
- It currently instantiates `links: new SqliteLinksAccess(conn.db)`.
- Step 11 should add `graph` to the test helper after `SqliteGraphAccess` exists.
- Step 4 can create graph fixture helpers in a new `src/db/__tests__/graphAccess.test.ts` without changing the helper unless needed.

### Existing Links Access

Primary file:

- `src/db/sqlite/access/links.ts`

Current observations:

- `SqliteLinksAccess` uses Drizzle over the `links` table.
- It exposes `insertLink`, `getLinkCount`, `getLinksForUrl`, and `findAll`.
- `findAll` is implemented but not currently in the `LinksAccess` interface.
- It maps `onDomain` from integer storage to boolean.
- Graph read models should not extend `LinksAccess`; use a separate `GraphAccess` surface as planned.

### SQLite Access Barrel Encoding

Primary file:

- `src/db/sqlite/access/index.ts`

Current observations:

- The file is UTF-16LE with BOM.
- `file -bi` reports: `application/javascript; charset=utf-16le`.
- Shell output shows NUL characters.
- Future steps should avoid editing this file unless they use an encoding-safe method. Prefer exporting through existing TypeScript entry points if possible.

## news-db-analysis Readiness

### Adapter Contract

Primary file:

- `src/interfaces/NewsDbAdapter.ts`

Current observations:

- The package defines a local minimal DB adapter interface instead of importing directly from `news-crawler-db`.
- Required accessors include `websites`, `domains`, `articles`, `analysis`, and `queue`.
- Optional accessors include `fetches` and `documents`.
- Raw `query(sql)` and `execute(sql)` are required today and heavily used by existing services.
- Step 12 should add local graph DTO/access types and `graph?: GraphAccess` as an optional accessor to avoid breaking many existing mocks.
- New graph services must not call `query` or `execute`.

### Export Surface

Primary file:

- `src/index.ts`

Current observations:

- Service classes are exported from the central index.
- Interfaces from `NewsDbAdapter.ts` are exported from the central index.
- Step 12 or Step 13 should update `src/index.ts` when graph types/services become public.

### Service/Test Style

Current observations:

- Service files use PascalCase class names and camelCase methods, e.g. `NewsAnalysisService`.
- Tests live under `tests/` and use Vitest.
- Test files import services with `.js` ESM specifiers.
- Existing tests create mock `NewsDbAdapter` objects with `vi.fn()`.
- Existing services still use raw SQL strings through `db.query` and `db.execute`. This is a legacy pattern, not a pattern to copy for GraphAccess.

## news-db-pure-analysis Readiness

Current observations:

- The package is IO-free by design and has modules for classification, clustering, content, geo, planning, quality, recommender, sentiment, summarization, tagging, text, and trends.
- Build script uses `tsup`.
- Step 15 should touch this repo only if graph scoring helpers are actually needed.

Baseline issue:

- `npm run build` fails before compilation because Rollup cannot find `@rollup/rollup-linux-x64-gnu`.
- The error matches npm optional dependency installation state, not a TypeScript graph-readiness issue.
- Before Step 15, run `npm install` or otherwise repair dependency state in this repo if pure helpers are required.

## Baseline Build Results

### news-crawler-db

Command:

```bash
cd /mnt/c/Users/james/Documents/repos/news-crawler-db
npm run build
```

Result: Passed.

### news-db-analysis

Command:

```bash
cd /mnt/c/Users/james/Documents/repos/news-db-analysis
npm run build
```

Result: Passed.

Note: The repo has many pre-existing modified files. The build result only confirms the current working tree compiles.

### news-db-pure-analysis

Command:

```bash
cd /mnt/c/Users/james/Documents/repos/news-db-pure-analysis
npm run build
```

Result: Failed before compile.

Error summary:

```text
Cannot find module @rollup/rollup-linux-x64-gnu.
npm has a bug related to optional dependencies.
```

No dependency repair was performed in Step 1.

## Step 2 Execution Map

Step 2 should only add graph DTO and option types in `news-crawler-db`.

Recommended Step 2 target:

- `news-crawler-db/src/db/types.ts`

Recommended placement:

- Near existing graph-adjacent access types, after `LinksAccess` or near `DownloadedDocument`, before `DbAdapter`.

Recommended Step 2 contents:

- `GraphPageEdge`
- `GraphPageEdgeOptions`
- `GraphHostEdgeCount`
- `HostEdgeCountOptions`
- `GraphPageRankRow`
- `PageRankOptions`
- `SiteGraphSummary`
- `SiteGraphOptions`
- `PageDiscoveryOptions`
- `HubCandidateOptions`
- `CrawlPriorityFeatureRow`
- `CrawlPriorityFeatureOptions`

Step 2 must not:

- add `GraphAccess`,
- instantiate `adapter.graph`,
- add `SqliteGraphAccess`,
- change schema,
- touch `src/db/sqlite/access/index.ts`.

Step 2 verification:

```bash
cd /mnt/c/Users/james/Documents/repos/news-crawler-db
npm run build
```

