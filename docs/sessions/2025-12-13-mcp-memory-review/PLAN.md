# Plan – Review docs-memory MCP adoption

## Objective
Assess why docs-memory MCP is underused and propose improvements

## Done When
- [ ] Key deliverables are complete and documented in `SESSION_SUMMARY.md`.
- [ ] Tests and validations (if any) are captured in `WORKING_NOTES.md`.
- [ ] Follow-ups are recorded in `FOLLOW_UPS.md`.

## Change Set (initial sketch)
- This session (docs only):
	- docs/sessions/2025-12-13-mcp-memory-review/WORKING_NOTES.md
	- docs/sessions/2025-12-13-mcp-memory-review/SESSION_SUMMARY.md
	- docs/sessions/2025-12-13-mcp-memory-review/FOLLOW_UPS.md
- Optional clarity fixes (follow-up work):
	- docs/agi/AGENT_MCP_ACCESS_GUIDE.md
	- AGENTS.md and/or docs/agi/SELF_MODEL.md

## Risks & Mitigations
- Risk: tool availability varies by environment (Copilot harness vs full VS Code MCP).
	- Mitigation: document activation step + CLI fallbacks.
- Risk: “memory-first” adds friction and slows simple tasks.
	- Mitigation: recommend a 10-second “stats-only” probe first; skip for one-liners.

## Tests / Validation
- Evidence: `node tools/dev/mcp-check.js --quick --json` shows MCP servers healthy.
- Evidence: `node tools/dev/mcp-check.js --json` lists docs-memory tools.
