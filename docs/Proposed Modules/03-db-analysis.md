# DB Analysis Module (`news-db-analysis`)

**Status**: Approved  
**Role**: Time-series statistics and coverage analysis on top of the DB layer.

## GitHub Copilot Bootstrap Prompt

```
Create a TypeScript package "news-db-analysis" with Vitest for testing. 
Structure: src/ with index.ts and types.ts. Include vitest.config.ts, 
tsconfig.json, package.json with "type": "module". Add tests/ folder 
with a sample test file. Add docs/ folder for documentation and labs/ 
folder for experiments. Include a README describing the package purpose 
and how to run tests.
```

## Project Structure

```
news-db-analysis/
├── src/
│   ├── index.ts              # Main export: DbAnalyzer class
│   ├── types.ts              # Zod schemas + TypeScript types
│   ├── analyzers/
│   │   ├── TimeSeriesAnalyzer.ts
│   │   ├── CoverageAnalyzer.ts
│   │   └── TrendAnalyzer.ts
│   └── queries/sql.ts
├── tests/
│   ├── time-series.test.ts
│   ├── coverage.test.ts
│   └── fixtures/test-db-setup.ts
├── vitest.config.ts
├── tsconfig.json
└── package.json
```

## Key Methods

| Method | Description |
|--------|-------------|
| `getDocumentCountsByDay(n)` | Documents stored per day for last N days |
| `getCrawlVolumeByDomain(range)` | Crawl counts by domain in date range |
| `getHubCoverageStats(domain)` | Hub visit coverage percentage |
| `saveAnalysisResult(key, data)` | Persist analysis for later retrieval |

## Integration

Accepts any DB adapter implementing:
```typescript
interface DbAdapter {
  prepare(sql: string): Statement;
  query?<T>(sql: string, params?: unknown[]): Promise<T[]>;
}
```

Compatible with: `better-sqlite3`, `createSQLiteDatabase()`, `createPostgresDatabase()`, `news-crawler-db`.

## Next Steps

1. Create new repo with the GitHub prompt above
2. Implement `TimeSeriesAnalyzer` first
3. Add fixtures and Vitest tests
4. `npm link` into `copilot-dl-news` for integration testing
