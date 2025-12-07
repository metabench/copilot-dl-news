# Plan – Investigate memory MCP server responsiveness

## Objective
Find why memory MCP server not responding and ensure error handling

## Done When
- [ ] Key deliverables are complete and documented in `SESSION_SUMMARY.md`.
- [ ] Tests and validations (if any) are captured in `WORKING_NOTES.md`.
- [ ] Follow-ups are recorded in `FOLLOW_UPS.md`.

## Change Set (initial sketch)
- tools/mcp/docs-memory/mcp-server.js (stdio framing fixes)
- tools/mcp/docs-memory/check-stdio.js (new stdio regression check)

## Risks & Mitigations
- Headerless parsing changes could regress framed clients; keep framing logic untouched and cover with stdio check.
- Multi-message handling might mis-parse malformed payloads; guard with defensive brace scanning and parse errors.

## Tests / Validation
- node tools/mcp/docs-memory/check-stdio.js
- node tools/mcp/docs-memory/check.js --http
