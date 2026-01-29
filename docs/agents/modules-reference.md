# External Modules Reference for Agents

> [!IMPORTANT]
> The `copilot-dl-news` repository is transitioning to a modular architecture. Two key capabilities have been extracted into separate repositories residing in the same parent directory.
> Agents working on the core platform should be aware of these modules and how to consume them.

## Module Map

| Module | Directory | Purpose | Tech Stack |
|--------|-----------|---------|------------|
| **Platform Core** | `copilot-dl-news` | The current monolithic orchestrator (crawlers, UI, legacy DB). | Node.js, SQLite (Legacy) |
| **News Crawler DB** | `../news-crawler-db` | **The Future DB Layer**. Unified Drizzle ORM schema + Fastify API. | Drizzle, SQLite/Postgres, Fastify |
| **News DB Analysis** | `../news-db-analysis` | **Pure Analysis Library**. Time-series, coverage, trends. | TypeScript, Vitest |

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
