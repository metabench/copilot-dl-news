# Place Hub & Disambiguation System

A guide to the place discovery, depth probing, and disambiguation pipeline.

## Table of Contents

1. [Hub Discovery & Verification](01-hub-discovery.md)
2. [Hub Depth Probing](02-hub-depth.md)
3. [Intelligent Crawling](03-intelligent-crawl.md)
4. [Schema & API](04-schema-api.md)
5. [Execution Plan](05-next-steps.md)
6. [UI Integration](06-ui-integration.md)
7. [Mapping & Quality](07-quality-mapping.md)
8. [Crawler Integration Architecture](08-crawler-integration.md) ← **NEW**

## Status

- **Tools**: `tools/dev/probe-hub-depth.js` is V1 stable (handles loopbacks via time-travel checks).
- **Schema**: `place_page_mappings` updated with depth columns.
- **Verification**: Validated against "United States" (~1900 pages) and small countries (~2 pages).
- **Crawler Integration**: HubTaskGenerator + IntelligentCrawlServer endpoints added.

## Key Components

| Component | Location | Purpose |
|-----------|----------|---------|
| HubTaskGenerator | `src/services/HubTaskGenerator.js` | Probe depth, generate crawl tasks |
| HubArchiveCrawlOperation | `src/crawler/operations/HubArchiveCrawlOperation.js` | Crawl operation definitions |
| Archive Queries | `src/db/sqlite/v1/queries/placePageMappings.js` | DB queries for archive workflow |
| Server Integration | `src/services/IntelligentCrawlServer.js` | HTTP API endpoints |

## API Endpoints

```
POST /api/hub-archive/probe   - Start depth probing
POST /api/hub-archive/tasks   - Generate crawl tasks
GET  /api/hub-archive/stats   - Archive statistics
GET  /api/hub-archive/hubs    - List verified hubs
```
