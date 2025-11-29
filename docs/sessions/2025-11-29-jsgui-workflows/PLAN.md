# Plan – Improve jsgui3 Workflow Access

## Objective
Enhance guidelines + tooling discoverability for jsgui3 control workflows

## Done When
- [ ] Updated instructions tell agents to consult jsgui3 workflows before UI work.
- [ ] Workflow discoverability improved (e.g., md-scan usage guidance or script change).
- [ ] Session docs capture changes + any follow-ups.

## Change Set (initial sketch)
- `.github/instructions/GitHub Copilot.instructions.md`
- `.github/agents/💡 Dashboard Singularity 💡.agent.md` (or related agent file)
- `docs/guides/JSGUI3_UI_ARCHITECTURE_GUIDE.md`
- `tools/dev/md-scan.js` (or docs describing its usage)
- Session docs under `docs/sessions/2025-11-29-jsgui-workflows/`

## Risks & Mitigations
- **Risk:** Overly prescriptive guidance reduces flexibility. → Focus language on “consult workflow + capture learnings” rather than dictating specific code patterns.
- **Risk:** Tooling changes may break md-scan consumers. → Prefer documenting enhanced usage first; if code changes needed, add tests/notes.
- **Risk:** Time sink in huge docs. → Use targeted md-scan queries and capture references in notes.

## Tests / Validation
- Manual verification that md-scan (or documented workflow search) returns relevant sections.
- Self-review of updated instructions to ensure clarity.
