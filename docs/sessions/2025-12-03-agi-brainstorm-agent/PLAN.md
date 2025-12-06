# Plan – Create AGI Brainstorm agent

## Objective
Add new AGI brainstorming coordinator agent file with proper rules

## Done When
- [ ] `.github/agents/🧠🌩️ AGI Brainstorm.agent.md` exists with mission, alignment, workflow, and self-improvement rules.
- [ ] Session docs updated (plan/notes/summary) with commands and outcomes.
- [ ] Any follow-ups or open questions captured in `FOLLOW_UPS.md`.

## Change Set (initial sketch)
- `.github/agents/🧠🌩️ AGI Brainstorm.agent.md`
- `docs/sessions/2025-12-03-agi-brainstorm-agent/WORKING_NOTES.md`
- `docs/sessions/2025-12-03-agi-brainstorm-agent/SESSION_SUMMARY.md`
- `docs/sessions/2025-12-03-agi-brainstorm-agent/FOLLOW_UPS.md`

## Risks & Mitigations
- **Emoji conflicts**: Ensure filename uses valid Windows characters; verify storm emoji works in file path. _Mitigation_: double-check git status and linking rules.
- **Instruction drift**: New agent must align with AGI Singularity Brain directives. _Mitigation_: mirror structure from existing agents (e.g., AGI Orchestrator).

## Tests / Validation
- Markdown lint by inspection (no automated tests required).
- Confirm links render and emojis display in VS Code file tree.
