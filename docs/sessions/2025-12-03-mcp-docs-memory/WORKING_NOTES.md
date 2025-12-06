# Working Notes – Docs Memory MCP

- 2025-12-03 — Session created via CLI. Add incremental notes here.
- 2025-12-03 15:35 — Defined scope: Node MCP server exposing `/memory/self-model`, `/memory/session/:slug/summary`, `/memory/lessons` endpoints, all reading from docs tree. Will use lightweight HTTP server + JSON, no external deps.
- 2025-12-03 15:50 — Implemented `tools/mcp/docs-memory/server.js` (pure Node HTTP). Added npm script `mcp:docs-memory` for quick launch.
- 2025-12-03 16:00 — Refactored server to export `startDocsMemoryServer` for programmatic tests / future MCP integration, while keeping CLI args functional.
- 2025-12-03 16:10 — Ran `node tools/mcp/docs-memory/check.js`; verified `/health`, `/memory/self-model`, `/memory/lessons`, `/memory/sessions/latest` all return JSON payloads. Latest session resolved to `2025-12-03-wysiwyg-fix`.
- 2025-12-03 16:15 — Updated `docs/agi/SELF_MODEL.md` current capabilities to reference the new docs-memory MCP surface.
- 2025-12-03 16:45 — Converted to proper MCP server with stdio transport. Created `mcp-server.js` with:
  - `docs_memory_getSelfModel` — read SELF_MODEL.md
  - `docs_memory_getLessons` — read LESSONS.md excerpts
  - `docs_memory_getSession` — read session files by slug or latest
  - `docs_memory_listSessions` — list available sessions
- 2025-12-03 16:50 — Added `.vscode/mcp.json` registration for VS Code MCP integration.
- 2025-12-03 16:55 — Verified both modes: HTTP (`--http`) and stdio (default). Tool calls return correct JSON-RPC responses.
- 2025-12-03 17:00 — VS Code MCP integration confirmed working! Agent successfully invoked `getSelfModel`, `getLessons`, and `getSession` tools directly.
- 2025-12-03 17:05 — **Observation (MCP vs CLI attention)**: MCP tools may command more agent attention than CLI equivalents because:
  1. Tools appear in declared affordance list (push vs pull discovery)
  2. Structured JSON params eliminate flag-parsing ambiguity
  3. No "should I use this?" friction — tools announce themselves
  - **Hypothesis to test**: Will agents over-rely on MCP tools when simpler approaches exist? (hammer/nail risk)
