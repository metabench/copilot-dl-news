# External Modules Reference for Agents

> [!IMPORTANT]
> The `copilot-dl-news` repository is transitioning to a modular architecture. Two key capabilities have been extracted into separate repositories residing in the same parent directory.
> Agents working on the core platform should be aware of these modules and how to consume them.

## Module Map

> Updated 2026-07-22 per the module-ecosystem owner directive — see
> [../plans/2026-07-22-module-ecosystem.md](../plans/2026-07-22-module-ecosystem.md)
> for roles, rules, and migration status. copilot-dl-news is the COORDINATOR; new
> functionality is implemented + tested in the owning module and called from here.

| Module | Directory | Purpose | Tech Stack |
|--------|-----------|---------|------------|
| **Coordinator** | `copilot-dl-news` | Electron/unified-app shell, live `data/news.db` custodian, UI, operational tooling — calls the modules. | Node.js, SQLite |
| **News Crawler Itself** | `../news-crawler-itself` | **THE crawler engine (most important module)**: worker fetch loop, politeness, worker-thread parallel compression, remote-worker runtime. Bootstrapped 2026-07-22; receiving `deploy/remote-crawler-v2/`. | Node.js |
| **News Crawler DB** | `../news-crawler-db` | **The DB Layer** (wired `file:`). Unified Drizzle ORM schema + Fastify API. | Drizzle, SQLite/Postgres, Fastify |
| **News DB Pure Analysis** | `../news-db-pure-analysis` | Pure functional business logic, zero IO (wired `file:`). | TypeScript |
| **News DB Analysis** | `../news-db-analysis` | **Pure Analysis Library**. Time-series, coverage, trends. | TypeScript, Vitest |
| **Document Intelligence** | `../news-crawler-document-intelligence` | Pure HTML/DOM document intelligence. | TypeScript |
| **URL Intelligence** | `../news-crawler-url-intelligence` | URL classification/shape intelligence. | TypeScript |
| **Places Intelligence** | `../news-crawler-places-intelligence` | Multilingual place detection/matching. | TypeScript |
| **General Intelligence** | `../news-crawler-general-intelligence` | Fusion layer: places+document+URL signals → page verdicts. | TypeScript |
| **News Dev Tools** | `../news-dev-tools` | Cross-repo developer tooling (AST scan/edit, sessions, MCP). | Node.js |

Excluded for the moment (owner): `../news-crawler-backend-core`. Not part of this
ecosystem: `http-cache-store`.

---

## 1. News Crawler DB (`news-crawler-db`)

**Role:** The single source of truth for data schemas and database access. It serves as both a library (for direct access) and a standalone API server.

### Key Capabilities
- **Unified Schema:** Defines the Drizzle ORM schema for Articles, URLs, Crawl Jobs, Places, etc.
- **Dual Support:** Supports both SQLite (dev/embedded) and Postgres (production) with the same query builder.
- **API Server:** Fastify server providing REST/SSE endpoints for UI and remote crawlers.

### How to Use (Code)
When working in a context that creates/reads data, look for `src/db` in this repo:

```typescript
// Imports from news-crawler-db (if linked or available)
import { schema } from 'news-crawler-db/src/db/schema';
import { db } from 'news-crawler-db/src/db';

// Drizzle Query Example
const articles = await db.query.articles.findMany({
  where: eq(schema.articles.host, 'theguardian.com'),
  limit: 10
});
```

### Key Files
- `src/db/schema.ts`: **READ THIS FIRST**. The complete database definition.
- `src/db/relations.ts`: Drizzle relationships (one-to-many, etc.).
- `src/server/index.ts`: API entry point.

---

## 2. News DB Analysis (`news-db-analysis`)

**Role:** A specialized calculation engine. It does NOT store data itself; it computes insights *from* the database.

### Key Capabilities
- **Time-Series Stats:** "How many articles per day?"
- **Coverage Analysis:** "What % of known hubs have we visited?"
- **Trend Detection:** "Is 'Election' trending?"

### How to Use (Code)
This module acts as a plugin-style library. You provide it a database adapter, and it runs queries.

```typescript
import { DbAnalyzer } from 'news-db-analysis';

// Initialize with a DB adapter (better-sqlite3 or similar)
const analyzer = new DbAnalyzer(dbAdapter);

// Run analysis
const dailyCounts = await analyzer.getDocumentCountsByDay(30);
const coverage = await analyzer.getHubCoverageStats('nytimes.com');
```

### Key Files
- `src/index.ts`: Main entry point class `DbAnalyzer`.
- `docs/analysis-requirements.md`: The "Bible" of all analysis queries this module supports.

---

## Best Practices for Agents

1.  **Read the Schema First**: When writing queries, always check `news-crawler-db/src/db/schema.ts` to ensure you are using correct column names and types.
2.  **Separate Calculation from Fetching**: If you are writing complex logic to count/aggregate things, put it in `news-db-analysis` rather than embedding massive SQL queries inside the crawler loop.
3.  **Check for Existing Tools**: Before writing a new script to check "how many docs we have", check if `news-db-analysis` already implements `getDocCounts()`.
