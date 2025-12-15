# Plan – Memory Feedback Badge Format

## Objective
Standardize user-visible memory-load badge format across AGENTS/docs/agents

## Done When
- [x] All key instruction surfaces use the same two-line memory output format (`🧠 Memory pull (for this task) — ...` + `Back to the task: ...`).
- [x] Anti-spam guidance exists in AGENTS + the general guide + at least one agent persona file.
- [x] Evidence commands are captured in `WORKING_NOTES.md`.
- [x] `SESSION_SUMMARY.md` and `FOLLOW_UPS.md` are filled.

## Change Set (initial sketch)
- AGENTS.md
- docs/agi/AGENT_MCP_ACCESS_GUIDE.md
- .github/agents/🎨🧠 Design Skills Curator 🧠🎨.agent.md
- docs/agi/skills/wlilo-design-system/SKILL.md
- docs/agi/skills/jsgui3-wlilo-ui/SKILL.md

## Risks & Mitigations
- _Note potential risks and how to mitigate them._

## Tests / Validation
- Confirm no legacy badge remains:
	- Search for the legacy badge prefix (`Memory:`) across docs.
- Confirm new badge appears where expected:
	- Search for `🧠 Memory pull (for this task) —` across docs.
