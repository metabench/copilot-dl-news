# Working Notes – MCP Logging + Crawl Monitoring

- 2026-01-02 — Session created via CLI. Add incremental notes here.

- 2026-01-02 23:11 — 

## Crawl Monitoring Comparison (2026-01-02)

### Monitoring Methods Available

| Method | Source | Scope | Access | Best For |
|--------|--------|-------|--------|----------|
| **MCP Logs** (`docs_memory_getLogs`) | `docs/agi/logs/*.ndjson` | App-level (crawl-server startup, API calls) | MCP tools or HTTP | High-level API server events |
| **task_events** (`task-events.js`) | SQLite DB | Crawler-level (progress, URL batches, lifecycle) | CLI tool | Detailed crawl telemetry |
| **crawl-status.js** | Live processes + evidence files | Running crawls + completion evidence | CLI tool | Quick status check |
| **node-procs.js** | System processes | Active node processes by category | CLI tool | Process monitoring |
| **REST API** (`/api/stats`, `/api/active-job`) | Crawl server | Real-time stats | HTTP | Live monitoring during crawl |

### What's Logged Where

**MCP Logger (docs-memory):**
- ✅ Crawl server startup/shutdown
- ✅ API endpoint availability
- ✅ Crawl operation start events
- ❌ Detailed crawl progress (not yet integrated into crawler core)
- ❌ Per-URL download events

**task_events (SQLite):**
- ✅ Crawl lifecycle (start/started)
- ✅ Progress snapshots (visited, downloaded, saved, errors)
- ✅ URL batch events (with timing)
- ✅ Scope breakdown (per-domain)
- ✅ Error/warning counts

### Efficient Monitoring Pattern

1. **Quick check**: `node tools/dev/crawl-status.js --json` (active + recent evidence)
2. **Task list**: `node tools/dev/task-events.js --list --limit 5` (recent tasks)
3. **Detailed summary**: `node tools/dev/task-events.js --summary <task-id>` (event breakdown)
4. **Problems**: `node tools/dev/task-events.js --problems <task-id>` (errors + warnings)
5. **MCP server logs**: `docs_memory_getLogs({ session: 'crawl-YYYY-MM-DD', limit: 20 })`

### Gap Identified

The core crawler module logs to task_events (SQLite) but NOT to MCP logs. For full AGI observability:
- Consider adding MCP logger calls to the crawler core for key lifecycle events
- Or create an adapter that reads task_events and exposes via MCP tools

### Evidence From Testing

- **mini-crawl** with 10 pages → 115 task_events (81 URL batches, 32 progress, 2 lifecycle)
- **MCP logs** → 10 entries (server startups + crawl operation start)
- The REST API `/api/stats` provides real-time PROGRESS data during crawl

