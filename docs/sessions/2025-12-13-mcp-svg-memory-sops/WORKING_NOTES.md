# Working Notes – MCP memory server surgery + SVG theming SOPs

## Instruction Snapshot (2025-12-13)

Objective: Store durable Skills/workflows so agents can safely modify MCP memory servers and build themeable SVGs.

Must do:
- Add a Skill SOP for docs-memory MCP server changes with a validation ladder.
- Add a Skill SOP for SVG theming (token schema + theme selection).
- Update the Skills registry so `recommendSkills` can find these by triggers.
- Add at least one small “front door” pointer so agents consult Skills before touching MCP/SVG.

Must not:
- Don’t bury process knowledge only in this session; promote it into `docs/agi/skills/*`.
- Don’t prescribe SVG runtime theming that won’t work with `<img src="...">` embedding without calling it out.
- Don’t expand scope into implementing new MCP endpoints/tools unless required.

Evidence:
- SKILLS registry updated + new Skill SOPs exist.
- (If MCP code changes are needed later) `node tools/mcp/docs-memory/check-stdio.js` passes and a focused Jest test passes.

## Findings / Prior Art

- Existing SVG pipeline + validation: `docs/guides/SVG_CREATION_METHODOLOGY.md`.
- SVG MCP tools quick ref: `docs/guides/SVG_TOOLING_V2_QUICK_REFERENCE.md`.
- Existing Skills registry: `docs/agi/SKILLS.md`.

## Changes Made

- Added Skills:
	- `docs/agi/skills/mcp-memory-server-surgery/SKILL.md`
	- `docs/agi/skills/svg-theme-system/SKILL.md`
- Registered in `docs/agi/SKILLS.md` so Skills discovery and `recommendSkills` can find them by triggers.
- Added “front door” pointers:
	- `docs/agi/AGENT_MCP_ACCESS_GUIDE.md` (consult MCP surgery Skill before editing memory MCP servers)
	- `AGENTS.md` (small pointer)
	- `docs/guides/SVG_CREATION_METHODOLOGY.md` (theme selection note, links to Skill)

- 2025-12-13 — Session created via CLI. Add incremental notes here.
