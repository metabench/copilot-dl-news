# Plan – Docs Memory MCP

## Objective
Prototype MCP server that exposes AGI doc excerpts

## Done When
- [ ] Minimal MCP server exposes SELF_MODEL excerpt + recent session summary endpoints with JSON payloads.
- [ ] Local trial client query succeeds (e.g., curl/node fetch) and results logged in WORKING_NOTES.
- [ ] Session docs updated (PLAN/WORKING_NOTES/SUMMARY/FOLLOW_UPS) with status + next steps.

## Change Set (initial sketch)
- `tools/mcp/docs-memory/server.js` (new minimal MCP implementation)
- `package.json` (if new scripts/deps required)
- `docs/sessions/2025-12-03-mcp-docs-memory/*` (notes, summary, follow-ups)
- Optional helper config (e.g., `mcp/docs-memory.config.json`)

## Risks & Mitigations
- **Protocol drift**: MCP spec evolves quickly. _Mitigation_: reference latest repo docs / existing MCP servers for baseline structure.
- **File path churn**: Hard-coded doc paths may move. _Mitigation_: centralize path list + validate existence on start.
- **Process lifecycle**: Server may keep handles open. _Mitigation_: run with simple Node HTTP server and ensure graceful shutdown.

## Tests / Validation
- Manual: start server, run sample MCP client call returning SELF_MODEL excerpt (capture output).
- Add quick node script to hit endpoints and assert JSON fields.
