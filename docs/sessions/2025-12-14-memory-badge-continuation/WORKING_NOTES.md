# Working Notes – Agent memory badge continuation phrasing

- 2025-12-14 — Session created via CLI. Add incremental notes here.

- 2025-12-14 — Updated memory badge/continuation wording:
	- Added/standardized the required two-line output format (including `Back to the task: ...`) across additional agent files.
	- Normalized agent file formatting so YAML frontmatter is at the top level (removed outer ```chatagent fences in several agent files).

## Evidence

- MCP preflight: `node tools/dev/mcp-check.js --quick --json` (docs-memory healthy)
- Agent validation: `node tools/dev/agent-files.js --validate --check-handoffs` (Errors=0, Warnings=0)
