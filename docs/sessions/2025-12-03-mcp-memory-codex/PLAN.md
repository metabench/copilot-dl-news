# Plan – Codex MCP memory wiring

## Objective
Enable Codex CLI to reach docs-memory MCP server

## Done When
- [ ] Codex CLI lists the docs-memory MCP tools.
- [ ] Config changes documented in `WORKING_NOTES.md`.
- [ ] Follow-ups captured in `FOLLOW_UPS.md` (if any).

## Change Set (initial sketch)
- `.codex/config.toml` or adjacent MCP config (if supported by Codex CLI)
- Potential workspace-level `mcp.json` (root) mirroring `.vscode/mcp.json`

## Risks & Mitigations
- Codex CLI may use a different MCP config location → inspect docs/host configs and adjust path.
- Duplicate or conflicting MCP configs between VS Code and Codex → keep single source and document.

## Tests / Validation
- `list_mcp_resources` returns docs-memory tools after config update.
