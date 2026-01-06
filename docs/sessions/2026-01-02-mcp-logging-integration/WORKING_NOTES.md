# Working Notes – MCP Logging Integration

- 2026-01-02 — Session created via CLI. Add incremental notes here.

- 2026-01-02 23:22 — 

## MCP Logging Integration Progress

### Logger Enhancements (mcpLogger.js)

1. **vitalOnly mode** - Only warn/error to console, full to file/MCP
2. **Auto session IDs** - Format: `{app}-{YYYY-MM-DD}`
3. **Preset factories**:
   - `createMcpLogger.service(name)` - background services (vitalOnly)
   - `createMcpLogger.uiServer(name, broadcastFn)` - UI servers
   - `createMcpLogger.cliTool(name)` - CLI tools (vitalOnly)
   - `createMcpLogger.electron(name)` - Electron apps

### Completed Integrations

| App | File | Session Pattern | Notes |
|-----|------|-----------------|-------|
| Unified App | `src/ui/server/unifiedApp/server.js` | `ui-unified-app-YYYY-MM-DD` | startup/ready/shutdown/errors |
| Crawl Observer | `src/ui/server/crawlObserver/server.js` | `ui-crawl-observer-YYYY-MM-DD` | startup/ready/shutdown |
| Data Explorer | `src/ui/server/dataExplorerServer.js` | `ui-data-explorer-YYYY-MM-DD` | alongside TelemetryIntegration |
| Crawl Server | `crawler-app/crawl-server.js` | `crawl-YYYY-MM-DD` | vitalOnly mode added |

### Verified Working

```
📋 Log check — Session=ui-unified-app-2026-01-02 | Entries=2 | Errors=0
```

Unified app logged startup and ready events to NDJSON file, queryable via:
- `docs_memory_getLogs({ session: 'ui-unified-app-2026-01-02' })`
- `docs_memory_searchLogs({ query: 'ready' })`

### Apps NOT Needing MCP Logging

- **mini-crawl.js** - Uses task_events (SQLite) via TelemetryIntegration
- CLI tools with TelemetryIntegration already have structured event storage

### Design Decisions

1. **Dual logging** - MCP logging supplements, doesn't replace original outputs
2. **File-based storage** - NDJSON in `docs/agi/logs/` (fast, no MCP server overhead)
3. **Session auto-naming** - Ensures consistent, date-based session organization
4. **vitalOnly for background** - Clean console for agent-supervised execution
