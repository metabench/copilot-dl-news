# Plan – Memory access improvements

## Objective
Audit and improve agent instructions + memory structure for reliable retrieval; align zero-cost with Claude Skills ideas.

## Done When
- [ ] Key deliverables are complete and documented in `SESSION_SUMMARY.md`.
- [ ] Tests and validations (if any) are captured in `WORKING_NOTES.md`.
- [ ] Follow-ups are recorded in `FOLLOW_UPS.md`.

## Change Set (initial sketch)

- `docs/agi/AGENT_MCP_ACCESS_GUIDE.md`
- `docs/agi/SKILLS.md`
- `docs/agi/TOOLS.md`
- Agent instruction updates in `.github/agents/*.agent.md` (memory/skills retrieval guidance)
- Session notes:
	- `docs/sessions/2025-12-13-memory-access-improvements/WORKING_NOTES.md`
	- `docs/sessions/2025-12-13-memory-access-improvements/SESSION_SUMMARY.md`
	- `docs/sessions/2025-12-13-memory-access-improvements/FOLLOW_UPS.md`

## Risks & Mitigations

- **Over-prescriptive agent prompts**: keep rituals short; link to the detailed guide.
- **MCP tool availability varies by environment**: include explicit CLI fallback commands.

## Tests / Validation

- Evidence: before/after diff review of edited agent + docs files.
- Optional sanity:
	- `node tools/dev/md-scan.js --dir docs/agi --search "Skills" --json`
	- `node tools/dev/md-scan.js --dir docs/sessions --search "Memory System Contract" --json`
