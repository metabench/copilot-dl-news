# Working Notes – Codex MCP memory wiring

- 2025-12-03 — Session initialized to wire docs-memory MCP into Codex CLI/extension.
- Created root `mcp.json` mirroring `.vscode/mcp.json` (stdio server pointing to `tools/mcp/docs-memory/mcp-server.js`).
- Added global MCP config at `~/.config/mcp/servers.json` with workingDirectory set to repo root.
- `list_mcp_resources` still returns empty after config additions; likely needs Codex extension to read the new config path or restart to pick it up.
- Added `.kilocode/mcp.json` entry for `docs-memory` (stdio, node, workingDirectory ".") in case Codex extension reads Kilo config.
- Added `~/.codex/mcp.json` with the same docs-memory stdio server and repo working directory to cover Codex-specific config location.
