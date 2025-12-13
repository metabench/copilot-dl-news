# Working Notes – Memory access improvements

- 2025-12-13 — Session created via CLI. Add incremental notes here.
- 2025-12-13 — Reviewed `docs/agi/AGENT_MCP_ACCESS_GUIDE.md`, `docs/agi/SKILLS.md`, and prior session `docs/sessions/2025-12-13-anthropic-skill-systems/`.
- 2025-12-13 — Found: many deployed agents already mention docs-memory, but several high-level agents were missing a consistent “skills-first + session search” retrieval ritual.

## Instruction-following improvements (ideas + implementation)

- Added Skill pack: `docs/agi/skills/instruction-adherence/SKILL.md`.
- Updated `docs/agi/AGENT_MCP_ACCESS_GUIDE.md` with an **Instruction Adherence Loop** (Snapshot → Task Ledger → Re-anchor).
- Patched all deployed agent specs in `.github/agents/` so every agent has a visible **Memory & Skills** marker pointing to Skills → Sessions → Lessons and calling out “re-anchor after detours”.

### Practical pattern: Instruction Snapshot

When starting any multi-step task, write a short snapshot into the active session’s `WORKING_NOTES.md`:
- Objective (1 sentence)
- Must do / Must not (3–7 bullets each)
- Evidence (what checks/tests/docs prove completion)

Then re-check it after any detour (e.g., CLI tooling improvement) so the agent resumes the parent objective instead of drifting.

## MCP-first Skills + resume primitives (implementation)

- Implemented Skills APIs in the `docs-memory` MCP server:
	- `docs_memory_listSkills`, `docs_memory_searchSkills`, `docs_memory_getSkill`
	- `docs_memory_recommendSkills` (Skills registry + session similarity)
	- `docs_memory_listTopics` (topics derived from Skills + trigger keywords)
- Implemented objective “resume parent objective” primitives:
	- `docs_memory_getObjectiveState`
	- `docs_memory_updateObjectiveState`
	- Storage: `docs/sessions/<slug>/OBJECTIVE_STATE.json`

### Evidence

- `node tools/mcp/docs-memory/check-stdio.js` (now validates the new tool surface)
- Jest: `npm run test:by-path tests/tools/__tests__/docs-memory-mcp.test.js`
