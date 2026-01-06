# Chapter 1: System Overview

> **Implementation Status**: ✅ Core architecture implemented. See [Chapter 16](16-implementation-guide.md) for component locations.

## Codebase Quick Reference

| Component | File Location | Status |
|-----------|---------------|--------|
| Crawl Daemon | `src/cli/crawl/daemon.js` | ✅ Complete |
| Crawl API | `tools/dev/crawl-api.js` | ✅ Complete |
| Crawl Live | `tools/dev/crawl-live.js` | ✅ Complete |
| Task Events | `tools/dev/task-events.js` | ✅ Complete |
| Analysis Observable | `labs/analysis-observable/` | ✅ Complete |
| Database Layer | `src/db/` | ✅ Complete |

## The Vision

The news crawl and analysis system is designed to:

1. **Crawl** news websites to discover and download articles
2. **Store** article content in a compressed, queryable database
3. **Analyze** content to extract facts, classifications, and geographic references
4. **Disambiguate** place names to specific geographic entities
5. **Export** enriched data for downstream applications

All operations should be controllable by AI agents through CLI tools with JSON output.

---

## Architecture Layers

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           AI Agent Layer                                 │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐    │
│  │ crawl-daemon│  │ crawl-api   │  │ crawl-live  │  │ task-events │    │
│  │    .js      │  │    .js      │  │    .js      │  │    .js      │    │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘    │
└─────────┼────────────────┼────────────────┼────────────────┼────────────┘
          │                │                │                │
          ▼                ▼                ▼                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         HTTP API Layer                                   │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │              Express Server (port 3099)                          │    │
│  │  /v1/jobs     /v1/operations     /healthz     /sse/*             │    │
│  └─────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────┘
          │                                      │
          ▼                                      ▼
┌─────────────────────────────────┐  ┌───────────────────────────────────┐
│      Crawl Engine               │  │      Analysis Engine               │
│  ┌───────────────────────────┐  │  │  ┌─────────────────────────────┐  │
│  │ NewsCrawler               │  │  │  │ AnalysisObservable          │  │
│  │  - Priority Planner       │  │  │  │  - Content Extraction       │  │
│  │  - Queue Manager          │  │  │  │  - Fact Extraction          │  │
│  │  - Telemetry Bridge       │  │  │  │  - Place Detection          │  │
│  │  - Enhanced Features      │  │  │  │  - Classification           │  │
│  └───────────────────────────┘  │  │  └─────────────────────────────┘  │
└─────────────────────────────────┘  └───────────────────────────────────┘
          │                                      │
          ▼                                      ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         Database Layer                                   │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                    SQLite (news.db)                              │    │
│  │  articles    content_analysis    content_cache    task_events    │    │
│  │  gazetteer   place_mentions      aliases          hubs           │    │
│  └─────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Core Components

### 1. Crawl Daemon (`src/cli/crawl/daemon.js`)

A detached background process that:
- Runs the HTTP API server on port 3099
- Manages crawl jobs via an in-process registry
- Logs to `tmp/crawl-daemon.log`
- Filters console output for quiet operation

**Key Files:**
- `src/cli/crawl/daemon.js` — Core daemon logic
- `src/server/crawl-api/` — Express API routes
- `tools/dev/crawl-daemon.js` — CLI wrapper

### 2. Crawl Operations (`src/modules/crawlOperations.js`)

Pre-configured crawl strategies:
- `basicArticleCrawl` — General article discovery
- `siteExplorer` — Map site structure
- `discoveryThenArticles` — Two-phase crawl
- `countryHubFocused` — Geographic hub crawling

### 3. Analysis Observable (`labs/analysis-observable/`)

Real-time analysis with progress streaming:
- Wraps `analysePages()` in an observable pattern
- Emits SSE events for progress tracking
- Supports Electron UI for visual monitoring

### 4. Place Disambiguation (`docs/sessions/2026-01-04-gazetteer-progress-ui/book/`)

Geographic entity resolution:
- Database-driven gazetteer
- Multi-language aliases
- Publisher priors and context scoring

---

## Current State (January 2026)

### ✅ Working Well
- Crawl daemon starts/stops cleanly
- HTTP API endpoints functional
- Console output properly filtered (quiet mode)
- Analysis observable with progress streaming
- Electron UI for long-running processes

### 🔄 In Progress
- Place disambiguation engine
- Unified crawl+analysis workflow
- Automated pipeline orchestration

### 📋 Planned
- Resume support for interrupted operations
- Cross-repo session sharing
- Export pipeline integration

---

## Design Principles

### 1. AI-Agent-First Design
Every operation should be controllable via CLI with `--json` output:
```bash
node tools/dev/crawl-api.js jobs list --json
```

### 2. Observable Long-Running Processes
Wrap all long-running operations in observables that emit progress:
```javascript
observable.subscribe({
  next: (progress) => console.log(progress),
  complete: () => console.log('Done'),
  error: (err) => console.error(err)
});
```

### 3. Quiet by Default
Background processes should not spam console output. Use:
- Early console filters for blocking noisy patterns
- Structured logging to files
- SSE for real-time progress (not console.log)

### 4. Database as Source of Truth
All configuration, state, and results live in SQLite:
- No JSON config files for runtime data
- Queries for status, not file parsing
- Transactions for atomic updates

---

## Next Chapter

[Chapter 2: Data Flow →](02-data-flow.md)
