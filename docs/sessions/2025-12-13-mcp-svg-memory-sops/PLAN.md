# Plan – MCP memory server surgery + SVG theming SOPs

## Objective
Capture durable Skills/workflows for safely modifying MCP memory servers and for building themeable SVGs with agent-assisted pipelines.

## Done When
 [ ] A new Skill exists for safely editing the docs-memory MCP server (with validation steps).
 [ ] A new Skill exists for SVG theming (theme tokens + selection + pipeline).
 [ ] `docs/agi/SKILLS.md` is updated so the recommender finds these Skills.
 [ ] At least one existing “front door” doc points agents at the Skills before MCP/SVG edits.
 [ ] Evidence commands are captured in `WORKING_NOTES.md`.
 [ ] Follow-ups are recorded in `FOLLOW_UPS.md`.

## Change Set (initial sketch)
 `docs/agi/SKILLS.md`
 `docs/agi/skills/mcp-memory-server-surgery/SKILL.md` (new)
 `docs/agi/skills/svg-theme-system/SKILL.md` (new)
 `docs/agi/AGENT_MCP_ACCESS_GUIDE.md` (small pointer: “read Skill before editing MCP servers”)
 `docs/guides/SVG_CREATION_METHODOLOGY.md` (small theme selection section)
 `AGENTS.md` (tiny pointer; keep concise)
 Session evidence: `docs/sessions/2025-12-13-mcp-svg-memory-sops/*`

## Risks & Mitigations
 Risk: agent edits MCP protocol surface and breaks headerless stdio parsing.
	- Mitigation: keep a validation ladder in the Skill (mcp-check, check-stdio, focused Jest).
 Risk: SVG “theme” guidance becomes incompatible with how SVGs are embedded (img/object/inline).
	- Mitigation: document both build-time theming (generate variants) and runtime theming (CSS vars for inline SVG).
 Risk: docs sprawl.
	- Mitigation: keep changes tight; store deeper procedure in Skill SOPs and link from registry.

## Tests / Validation
 MCP safety checks:
	- `node tools/dev/mcp-check.js --quick --json`
	- `node tools/mcp/docs-memory/check-stdio.js`
	- `npm run test:by-path tests/tools/__tests__/docs-memory-mcp.test.js` (or the most relevant focused test)
 SVG quality gate:
	- `node tools/dev/svg-collisions.js <file> --strict`
