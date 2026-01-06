# MCP Agent Logs

This directory contains log files written by applications via the `docs-memory` MCP server.

## Format

Logs are stored as NDJSON files (newline-delimited JSON), one entry per line:

```json
{"ts":"2025-01-14T10:30:00.000Z","level":"info","app":"CRWL","session":"crawl-2025-01-14","msg":"Starting crawl","data":{"url":"https://example.com"}}
```

## Log Entry Fields

| Field | Type | Description |
|-------|------|-------------|
| `ts` | string | ISO 8601 timestamp |
| `level` | string | `debug`, `info`, `warn`, `error` |
| `app` | string | Application abbreviation (e.g., `CRWL`, `ELEC`, `API`) |
| `session` | string | Session ID for grouping logs |
| `msg` | string | Log message |
| `data` | object | Optional structured data |

## Reading Logs

### Via MCP (for AI agents)

```javascript
// Get recent logs
docs_memory_getLogs({ session: 'crawl-2025-01-14', limit: 50 })

// Get only errors
docs_memory_getLogs({ session: 'crawl-2025-01-14', level: 'error' })

// Search across all sessions
docs_memory_searchLogs({ query: 'timeout', level: 'error' })

// List all log sessions
docs_memory_listLogSessions()
```

### Via File (direct access)

```javascript
const { readLogFile, listLogSessions } = require('./src/utils/mcpLogger');

// Read logs from a session
const logs = readLogFile('crawl-2025-01-14', { limit: 50, level: 'warn' });

// List all sessions
const sessions = listLogSessions();
```

## Writing Logs

### Via Logger Client

```javascript
const { createMcpLogger } = require('./src/utils/mcpLogger');

const logger = createMcpLogger({
  app: 'CRWL',
  session: 'crawl-2025-01-14',
  console: true,  // Also log to console
  file: true,     // Write to file
  mcp: true       // Send to MCP server
});

logger.info('Starting crawl', { url: 'https://example.com' });
logger.warn('Rate limited', { retryAfter: 30 });
logger.error('Failed to fetch', { url, error: err.message });
```

### Via MCP (direct)

```javascript
docs_memory_appendLog({
  app: 'CRWL',
  session: 'crawl-2025-01-14',
  level: 'info',
  msg: 'Starting crawl',
  data: { url: 'https://example.com' }
})
```

## App Abbreviations

| Abbr | Application |
|------|-------------|
| `CRWL` | Crawler |
| `ELEC` | Electron app |
| `API` | API server |
| `SRV` | Generic server |
| `DB` | Database operations |
| `UI` | UI/frontend |
| `TEST` | Test runner |

## Housekeeping

```javascript
// Clear a session
docs_memory_clearLogs({ session: 'crawl-2025-01-14' })

// Clear old entries (keep last 7 days)
docs_memory_clearLogs({ session: 'crawl-2025-01-14', olderThan: '2025-01-07T00:00:00Z' })

// Clear all logs
docs_memory_clearLogs({ session: 'all' })
```
