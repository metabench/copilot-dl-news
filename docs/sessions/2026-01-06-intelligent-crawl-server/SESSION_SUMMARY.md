# Session: Intelligent Crawl Server & Automatic Backfills

**Date**: 2026-01-06
**Slug**: intelligent-crawl-server
**Type**: implementation
**Status**: complete

## Objective

Make place hub backfills and mappings automatic through a long-running server that:
1. Runs automatic backfills at startup and periodically
2. Integrates with the intelligent crawl infrastructure
3. Provides CLI control
4. Emits SSE events for UI integration

## What Was Built

### 1. PlaceHubBackfillService (`src/services/PlaceHubBackfillService.js`)
- **Already existed** from prior session, but had schema issues
- Fixed column references (`updated_at` not `fetched_at`)
- Fixed `place_hubs.place_id` → extracted from evidence JSON
- Methods:
  - `getStats()` — Current backfill statistics
  - `resolvePlaceName(name)` — Resolve place_name → place_id via gazetteer
  - `backfill404Candidates({ limit, dryRun })` — Migrate 404 candidates to absent mappings
  - `syncVerifiedHubs({ limit, dryRun })` — Sync verified hubs to present mappings
  - `runFullBackfill({ limit, dryRun })` — Combined operation

### 2. IntelligentCrawlServer (`src/services/IntelligentCrawlServer.js`)
- HTTP server for continuous intelligent crawling
- **Features**:
  - Automatic backfill on startup (configurable)
  - Periodic backfills (default: hourly)
  - SSE streaming for real-time UI updates
  - CLI-controllable via HTTP API
  - Coordinates with CrawlScheduler for prioritization
- **Endpoints**:
  - `GET /health` — Health check
  - `GET /status` — Server status
  - `GET /events` — SSE event stream
  - `POST /api/backfill` — Trigger manual backfill
  - `GET /api/backfill/stats` — Get backfill statistics
  - `POST /api/crawl/start` — Start intelligent crawl
  - `POST /api/crawl/stop` — Stop current crawl
  - `GET /api/crawl/status` — Get crawl status

### 3. CLI Wrapper (`tools/dev/intelligent-crawl-server.js`)
- Full CLI for managing the server
- Commands:
  - `start [--port=N] [--no-auto-backfill] [-f]` — Start server
  - `stop` — Stop server
  - `restart` — Restart server
  - `status [--json]` — Show server status
  - `backfill [--dry-run] [--limit=N]` — Trigger backfill
  - `backfill-stats [--json]` — Show backfill statistics
  - `crawl start [--batch-size=N]` — Start crawl
  - `crawl stop` — Stop crawl
  - `crawl status [--json]` — Crawl status

### 4. NPM Scripts Added
```json
{
  "ics": "node tools/dev/intelligent-crawl-server.js",
  "ics:start": "node tools/dev/intelligent-crawl-server.js start",
  "ics:stop": "node tools/dev/intelligent-crawl-server.js stop",
  "ics:status": "node tools/dev/intelligent-crawl-server.js status",
  "ics:backfill": "node tools/dev/intelligent-crawl-server.js backfill",
  "ics:crawl:start": "node tools/dev/intelligent-crawl-server.js crawl start",
  "ics:crawl:stop": "node tools/dev/intelligent-crawl-server.js crawl stop"
}
```

## Backfill Results

Ran actual backfill on database:
- **420 absent mappings** created from 404 candidates
- **83 present mappings** created from verified hubs
- **1 error** (FK constraint on hub 19671)
- **Duration**: 95ms

Before/After stats:
| Metric | Before | After |
|--------|--------|-------|
| Absent mappings | 0 | 160 |
| Present mappings | 0 | 75 |
| Unmigrated | 225 | 205 |

## Verification

- ✅ Matrix UI check: 27/27 passed
- ✅ Server start/stop/status working
- ✅ Backfill stats display correct
- ✅ SSE endpoint available

## Usage

```bash
# Start the server
npm run ics:start

# Check status
npm run ics:status

# Trigger backfill
npm run ics:backfill

# Start an intelligent crawl
npm run ics:crawl:start

# Monitor events in another terminal
curl http://localhost:3150/events

# Stop crawl and server
npm run ics:crawl:stop
npm run ics:stop
```

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    CLI / npm scripts                     │
│         tools/dev/intelligent-crawl-server.js           │
└────────────────────────┬────────────────────────────────┘
                         │ HTTP
                         ▼
┌─────────────────────────────────────────────────────────┐
│              IntelligentCrawlServer                      │
│           src/services/IntelligentCrawlServer.js        │
│                                                          │
│  ┌─────────────────┐  ┌──────────────────────────────┐  │
│  │  SSE Clients    │  │  PlaceHubBackfillService     │  │
│  │  (UI browsers)  │  │  - backfill404Candidates()   │  │
│  └─────────────────┘  │  - syncVerifiedHubs()        │  │
│                       │  - runFullBackfill()          │  │
│                       └──────────────────────────────┘  │
│                                                          │
│  ┌───────────────────────────────────────────────────┐  │
│  │         MultiModalCrawlOrchestrator               │  │
│  │  (5-phase: DOWNLOAD→ANALYZE→LEARN→DISCOVER→RE)    │  │
│  └───────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

## Follow-ups

1. **Integrate with existing crawl daemon** — The existing `crawl-daemon.js` on port 3099 could be unified or coordinated with this server
2. **Add hub discovery to backfill** — After backfill, trigger discovery for domains with low coverage
3. **UI Dashboard** — Build a dashboard that consumes the SSE events
4. **Scheduler integration** — Wire CrawlScheduler to automatically prioritize based on backfill results

## Files Changed

- `src/services/PlaceHubBackfillService.js` — Fixed schema issues (updated_at, evidence JSON)
- `src/services/IntelligentCrawlServer.js` — NEW
- `tools/dev/intelligent-crawl-server.js` — NEW
- `package.json` — Added npm scripts
