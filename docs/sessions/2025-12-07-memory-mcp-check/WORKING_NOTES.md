# Working Notes – Investigate memory MCP server responsiveness

- 2025-12-07 — Session created via CLI. Add incremental notes here.
- 2025-12-07 — Observed mcp-debug.log showing repeated "Headerless parse pending" when multiple headerless JSON messages were concatenated (tools/list + tools/call). The buffer never advanced, so the client saw no response after the first message.
- 2025-12-07 — Added brace-aware headerless parsing to consume one JSON object at a time and keep processing remaining buffer.
- 2025-12-07 — Added stdio regression check: `node tools/mcp/docs-memory/check-stdio.js` to ensure batched headerless requests get responses.
