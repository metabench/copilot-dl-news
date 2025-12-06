# Working Notes – Repair MCP servers to spec

- 2025-12-06 — Session created via CLI. Add incremental notes here.
- 2025-12-06 — Bumped MCP protocolVersion to 2025-11-25 for docs-memory and svg-editor servers. Docs-memory now defaults to framed (Content-Length) responses; headerless replies only when the request was headerless.
- 2025-12-06 — Smoke: framed initialize -> docs-memory returned framed response; svg-editor returned framed response (observed within ~3s on Windows when run via child_process spawn).
