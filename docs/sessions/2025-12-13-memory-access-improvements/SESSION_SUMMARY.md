# Session Summary – Memory access improvements

## Accomplishments
- Added an explicit “Instruction Adherence” workflow layer (Skill + guide section) to reduce instruction drift during multi-step work.
- Standardized agent-facing retrieval guidance by ensuring every deployed agent spec includes a visible **Memory & Skills** marker.
- Reinforced the repo’s default retrieval ritual (Skills → Sessions → Lessons) with a concrete “re-anchor after detours” loop.
- Implemented MCP-first Skills access (list/search/get/recommend/topics) so agents can retrieve Skills via the `docs-memory` MCP server.
- Implemented objective resume primitives (parent objective, active detours, return step) persisted per session.

## Metrics / Evidence
- New Skill pack: `docs/agi/skills/instruction-adherence/SKILL.md`.
- Updated memory guide: `docs/agi/AGENT_MCP_ACCESS_GUIDE.md` now includes “Instruction Adherence Loop (Snapshot → Task Ledger → Re-anchor)”.
- Registry updated: `docs/agi/SKILLS.md` includes `instruction-adherence`.
- Repo validation: all `.github/agents/*.agent.md` now include either “Memory System Contract” or “Memory & Skills” marker (verified via a simple Node script).
- MCP: `tools/mcp/docs-memory/mcp-server.js` exposes Skills tools: list/search/get/recommend/topics.
- MCP: objective state tools persist to `docs/sessions/<slug>/OBJECTIVE_STATE.json`.
- Check: `node tools/mcp/docs-memory/check-stdio.js` passes (validates new tool surface).
- Tests: `npm run test:by-path tests/tools/__tests__/docs-memory-mcp.test.js` passes.

## Decisions
- Skills and objective-resume primitives are implemented directly in the existing `docs-memory` MCP server for a single “memory plane”.
- Objective state is persisted per-session (durable, reviewable) rather than in `tmp/`.

## Next Steps
- Consider adding a small automation check (CI or local script) that fails if new agent specs lack a Memory/Skills marker.
- Consider a lightweight “instruction snapshot” template addition to `session-init` scaffolding (optional).
- If desired, add HTTP routes for Skills/objective state in `tools/mcp/docs-memory/mcp-server.js --http` to make manual debugging easier.
