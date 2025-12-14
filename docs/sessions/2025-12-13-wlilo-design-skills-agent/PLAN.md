# Plan – WLILO Design Skills Agent

## Objective
Create an emoji Design Skills agent + WLILO Skill SOP and add user-visible memory load feedback.

## Done When
- [ ] A WLILO design Skill exists and is registered in `docs/agi/SKILLS.md`.
- [ ] A jsgui3-focused WLILO UI design Skill exists and is registered in `docs/agi/SKILLS.md`.
- [ ] A dedicated emoji Design Skills agent exists under `.github/agents/`.
- [ ] The agent is registered in `.github/agents/index.json`.
- [ ] Memory-load feedback convention exists in AGENTS “front door” docs.
- [ ] Evidence commands are captured in `WORKING_NOTES.md`.
- [ ] Follow-ups are recorded in `FOLLOW_UPS.md`.

## Change Set (initial sketch)
- `docs/agi/SKILLS.md`
- `docs/agi/skills/wlilo-design-system/SKILL.md` (new)
- `docs/agi/skills/jsgui3-wlilo-ui/SKILL.md` (new)
- `.github/agents/🎨🧠 Design Skills Curator 🧠🎨.agent.md` (new)
- `.github/agents/index.json`
- Session evidence: `docs/sessions/2025-12-13-wlilo-design-skills-agent/*`

## Risks & Mitigations
- Risk: style guidance becomes “taste” and not reusable.
	- Mitigation: keep a small token schema + validation ladder; write back patterns.
- Risk: jsgui3 styling causes activation issues.
	- Mitigation: keep styling class-based; use `jsgui3-activation-debug` when interactivity breaks.

## Tests / Validation
- Smoke checks:
	- `node tools/dev/md-scan.js --dir docs/agi/skills --search "wlilo" "jsgui3" --json`
	- `git status -sb`
