# Working Notes – Investigate unexpected terminal windows

- 2025-12-12 — Session created via CLI. Add incremental notes here.

## Recon findings (2025-12-12)

- Repo MCP config at `.kilocode/mcp.json` defines only `docs-memory` (stdio → `node tools/mcp/docs-memory/mcp-server.js`).
- Running console processes show many MCP servers being spawned via `cmd.exe /c npx -y @modelcontextprotocol/server-*`.
- Sample process chain observed:
	- `Code - Insiders.exe` (utility: `node.mojom.NodeService`) → `cmd.exe /c npx -y @modelcontextprotocol/server-<name>`
	- which then spawns `node.exe ... npx-cli.js -y @modelcontextprotocol/server-<name>`
	- which then spawns `cmd.exe /d /s /c mcp-server-<name>`
- This points to VS Code (or an extension running inside VS Code) as the direct spawner of the MCP `cmd.exe` processes.
- Open question: why these are surfacing as visible external terminal windows on the main monitor (spawn flags / extension behavior / terminal host choice).

## VS Code Insiders user config (2025-12-12)

- `%APPDATA%\Code - Insiders\User\settings.json` includes:
	- `"chat.mcp.autostart": "never"` (built-in chat MCP autostart disabled)
	- `"chat.mcp.serverSampling": { ... }` present
	- `kilo-code.*` settings present (allowed/denied commands)
- `%APPDATA%\Code - Insiders\User\mcp.json` exists and currently configures only `microsoft/playwright-mcp` via `npx @playwright/mcp@latest`.
- Installed extensions matching MCP tooling:
	- `kilocode.kilo-code-4.136.0`
	- `anthropic.claude-code-2.0.62-win32-x64`

Interpretation: since built-in chat MCP autostart is set to `never`, the observed auto-spawning of `@modelcontextprotocol/server-*` processes is more consistent with a third-party extension (most likely Kilo Code and/or Claude Code) managing its own MCP server lifecycle.
