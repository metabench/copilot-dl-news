# docs-memory MCP Server

A Model Context Protocol (MCP) server that provides AI agents with persistent memory across sessions. This is the **AGI memory layer** for the project.

## Quick Start

```bash
# Run as MCP server (stdio transport - for VS Code/Copilot)
node tools/mcp/docs-memory/mcp-server.js

# Run as HTTP server (for direct access)
node tools/mcp/docs-memory/mcp-server.js --http

# List available tools
node tools/mcp/docs-memory/mcp-server.js --help
```

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    docs-memory MCP Server                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │
│  │   Memory    │  │   Skills    │  │  Sessions   │             │
│  │  (Lessons,  │  │   (SOPs,    │  │  (Progress, │             │
│  │  Patterns)  │  │  Workflows) │  │   Notes)    │             │
│  └─────────────┘  └─────────────┘  └─────────────┘             │
│                                                                 │
│  ┌─────────────┐  ┌─────────────┐                              │
│  │   Logging   │  │  Knowledge  │                              │
│  │   (App      │  │    Map      │                              │
│  │  Telemetry) │  │ (Coverage)  │                              │
│  └─────────────┘  └─────────────┘                              │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Tool Categories

### Memory (Read)
| Tool | Purpose |
|------|---------|
| `docs_memory_getSelfModel` | Read SELF_MODEL.md (AGI identity) |
| `docs_memory_getLessons` | Read accumulated learnings |
| `docs_memory_getPatterns` | Read refactoring patterns catalog |
| `docs_memory_getAntiPatterns` | Read anti-patterns catalog |
| `docs_memory_getKnowledgeMap` | Read codebase refactoring coverage |

### Memory (Write)
| Tool | Purpose |
|------|---------|
| `docs_memory_appendLessons` | Add new lesson to LESSONS.md |
| `docs_memory_addPattern` | Add refactoring pattern to catalog |
| `docs_memory_addAntiPattern` | Add anti-pattern to catalog |
| `docs_memory_updateKnowledgeMap` | Track refactoring coverage |

### Skills & Workflows
| Tool | Purpose |
|------|---------|
| `docs_memory_listSkills` | List Skills from SKILLS.md |
| `docs_memory_searchSkills` | Search Skills + SKILL.md docs |
| `docs_memory_getSkill` | Read a specific Skill SOP |
| `docs_memory_recommendSkills` | Recommend Skills for a topic |
| `docs_memory_listWorkflows` | List available workflows |
| `docs_memory_getWorkflow` | Read workflow with metadata |
| `docs_memory_searchWorkflows` | Search across workflows |

### Sessions (Progress Tracking)
| Tool | Purpose |
|------|---------|
| `docs_memory_getSession` | Read session files |
| `docs_memory_listSessions` | List available sessions |
| `docs_memory_searchSessions` | Search across sessions |
| `docs_memory_findOrContinueSession` | Find existing sessions on topic (**USE FIRST!**) |
| `docs_memory_getTaskProgress` | Get task progress from PLAN.md |
| `docs_memory_appendToSession` | Append to WORKING_NOTES or FOLLOW_UPS |
| `docs_memory_getObjectiveState` | Read objective state |
| `docs_memory_updateObjectiveState` | Update objective state |

### Logging (App Telemetry) 🆕
| Tool | Purpose |
|------|---------|
| `docs_memory_appendLog` | Append log entry (auto-timestamped) |
| `docs_memory_getLogs` | Read logs from a session |
| `docs_memory_listLogSessions` | List all log sessions |
| `docs_memory_clearLogs` | Clear logs (by session or all) |
| `docs_memory_searchLogs` | Search across log sessions |

## Logging System

### For Apps

Use the logger client to write logs from any application:

```javascript
const { createMcpLogger } = require('./src/utils/mcpLogger');

const logger = createMcpLogger({
  app: 'CRWL',                    // App abbreviation
  session: 'crawl-2025-01-14',    // Session ID for grouping
  console: true,                   // Also log to console
  file: true,                      // Write to log file
  mcp: false                       // Optional: send to MCP server
});

logger.info('Starting crawl', { url: 'https://example.com' });
logger.warn('Rate limited', { retryAfter: 30 });
logger.error('Failed to fetch', { url, error: err.message });
```

### For AI Agents

Read logs via MCP tools:

```javascript
// List all log sessions
docs_memory_listLogSessions()

// Get recent logs from a crawl
docs_memory_getLogs({ session: 'crawl-2025-01-14', limit: 50 })

// Get only errors and warnings
docs_memory_getLogs({ session: 'crawl-2025-01-14', level: 'warn' })

// Search for specific errors
docs_memory_searchLogs({ query: 'timeout', level: 'error' })
```

### HTTP Access

When running in HTTP mode (`--http`), logs are accessible via REST:

```
GET /memory/logs/list              # List sessions
GET /memory/logs/{session}         # Get logs for session
GET /memory/logs/search?q={query}  # Search logs
```

### App Abbreviations

| Abbr | Application |
|------|-------------|
| `CRWL` | Crawler |
| `ELEC` | Electron app |
| `API` | API server |
| `SRV` | Generic server |
| `DB` | Database operations |
| `UI` | UI/frontend |
| `TEST` | Test runner |

### Log Storage

Logs are stored as NDJSON (newline-delimited JSON) in `docs/agi/logs/`:

```
docs/agi/logs/
├── README.md
├── crawl-2025-01-14.ndjson
├── electron-2025-01-14.ndjson
└── default.ndjson
```

Each line is a JSON object:
```json
{"ts":"2025-01-14T10:30:00.000Z","level":"info","app":"CRWL","session":"crawl-2025-01-14","msg":"Starting crawl","data":{"url":"https://example.com"}}
```

## AGI Strategy

This MCP server is designed to evolve as part of the AGI strategy:

### Current Capabilities
- ✅ Persistent memory (lessons, patterns, sessions)
- ✅ Skill SOPs with recommendations
- ✅ Session continuity (find and resume work)
- ✅ App telemetry via logging

### Future Improvements
- 🔮 Log-to-lesson automation (detect recurring errors → suggest fix)
- 🔮 Cross-session pattern mining (what approaches work best?)
- 🔮 Log retention policies (auto-archive old sessions)
- 🔮 Structured event types beyond free-form messages
- 🔮 Real-time log streaming for live monitoring
- 🔮 Log dashboards (aggregate metrics across sessions)

### Contributing

When improving this server:
1. Read `docs/agi/skills/mcp-memory-server-surgery/SKILL.md` first
2. Follow the existing tool pattern (inputSchema + handler)
3. Add HTTP routes for new tools when applicable
4. Update help text in the CLI entry point
5. Document in this README

## File Structure

```
tools/mcp/docs-memory/
├── mcp-server.js       # Main server (stdio + HTTP)
├── README.md           # This file
└── server.js           # Simplified HTTP-only variant

docs/agi/
├── SELF_MODEL.md       # AGI identity document
├── LESSONS.md          # Accumulated learnings
├── PATTERNS.md         # Refactoring patterns
├── ANTI_PATTERNS.md    # Anti-patterns catalog
├── KNOWLEDGE_MAP.md    # Codebase coverage
├── SKILLS.md           # Skills index
├── skills/             # Skill SOPs
├── logs/               # App telemetry (NDJSON)
└── workflow-improvements/  # Proposed workflow changes
```
