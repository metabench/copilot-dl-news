# Plan – Repair MCP servers to spec

## Objective
Align docs-memory and svg-editor MCP servers with latest MCP framing/version and restore functionality

## Done When
- [ ] Key deliverables are complete and documented in `SESSION_SUMMARY.md`.
- [ ] Tests and validations (if any) are captured in `WORKING_NOTES.md`.
- [ ] Follow-ups are recorded in `FOLLOW_UPS.md`.

## Change Set (initial sketch)
- tools/mcp/docs-memory/mcp-server.js
- tools/mcp/svg-editor/mcp-server.js
- Session notes (WORKING_NOTES.md, FOLLOW_UPS.md, SESSION_SUMMARY.md)

## Risks & Mitigations
- Framing drift vs MCP spec (2025-11-25). Mitigation: align protocolVersion and enforce Content-Length responses.
- Client incompatibility if we drop headerless fallback. Mitigation: auto-detect headerless requests but default to framed responses.
- Missed regression in tool outputs. Mitigation: run smoke initialize/tools/list for both servers.

## Tests / Validation
- Run initialize + tools/list via framed stdio for docs-memory and svg-editor.
- If feasible, run a sample tools/call (e.g., svg_list_elements with a tiny fixture) to confirm body parse.
