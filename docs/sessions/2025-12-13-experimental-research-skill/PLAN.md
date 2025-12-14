# Plan – Experimental Research Skill (Metacognition + Tooling)

## Objective
Create a reusable Skill that teaches agents how to do experiment-driven research and continuously improve research methods + tooling.

## Done When
- [x] Key deliverables are complete and documented in `SESSION_SUMMARY.md`.
- [x] Tests and validations (if any) are captured in `WORKING_NOTES.md`.
- [x] Follow-ups are recorded in `FOLLOW_UPS.md`.

## Change Set (initial sketch)
- `docs/agi/skills/experimental-research-metacognition/SKILL.md` (new)
- `docs/agi/SKILLS.md` (register new Skill)
- `docs/agi/skills/jsgui3-lab-experimentation/SKILL.md` (cross-link reference)

## Risks & Mitigations
- Risk: Skill duplicates other Skills (session-discipline, targeted-testing).
	- Mitigation: link out to those Skills; keep this Skill as the “research operating system”.
- Risk: Skill becomes prose-heavy and not runnable.
	- Mitigation: keep commands/checklists; require evidence capture in sessions.

## Tests / Validation
- `node tools/dev/md-scan.js --dir docs/agi --search "experimental-research-metacognition" --json`
- `node tools/dev/md-scan.js --dir docs/agi --search "jsgui3-lab-experimentation" --json`
