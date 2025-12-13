# Skills (Capability Packs)

This folder contains repo-native “Skill packs”: discoverable, reusable capabilities inspired by Claude Code Agent Skills.

A Skill is:
- a `SKILL.md` with clear triggers + SOP
- links to existing scripts/checks/tests (so validation is fast)
- minimal content by default (expand only when needed)

## Conventions

- Folder name matches the skill name (lowercase, hyphenated)
- `SKILL.md` frontmatter must include:
  - `name`
  - `description` (include trigger phrases and “Use when …”)

## How to expand a Skill

If a Skill is missing critical steps or references:

1. Add the missing pointers (docs/scripts/tests) first.
2. Only then add new “how-to” prose.
3. If new research is required, create a session and record a follow-up requesting research.

See `docs/agi/SKILLS.md` for the registry.
