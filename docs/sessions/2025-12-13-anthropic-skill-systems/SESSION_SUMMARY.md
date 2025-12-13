# Session Summary – Anthropic skill systems vs Copilot

## Accomplishments
- Researched Anthropic/Claude “Agent Skills” and related concepts (Subagents, Slash commands, strict tool schema conformance).
- Mapped the “Skills” pattern to this repo’s existing agent + docs-memory architecture.
- Identified the main gap: we have lots of *knowledge artifacts*, but no single “skill pack” registry/discovery surface.
- Wrote concrete proposals for evolving docs-memory MCP into a “skills registry” (without requiring Claude Code).

## Metrics / Evidence
- Sources reviewed:
	- Skills: https://code.claude.com/docs/en/skills
	- Subagents: https://code.claude.com/docs/en/sub-agents
	- Slash commands (+ Skills vs commands comparison): https://code.claude.com/docs/en/slash-commands
	- Strict tool schema conformance / structured outputs: https://platform.claude.com/docs/en/build-with-claude/structured-outputs

## Decisions
- Decided: Treat “Skills” as a *design pattern* (packaged capabilities + discovery + progressive disclosure), not as a Claude Code dependency.

## Next Steps
- Define a skills directory layout inside this repo (proposal: `docs/agi/skills/<skill>/SKILL.md` plus supporting docs/scripts).
- Extend docs-memory MCP with a small “skills” surface:
	- `listSkills({onlyStats})`
	- `getSkill({name, maxLines, includeFiles})`
	- `searchSkills({query, limit})`
	- `proposeSkillImprovement({skillName, summary, changes, validation})`
- (Optional) UI: add a “Skill Atlas” view that lists skills, triggers, and run buttons for checks/tests.
