# Plan: agi-agent-alignment

Objective: Align orchestrator, scout, refactor, and tooling agents with the repo's Singularity + AGI workflows.

Done when:
- Updated agent specs reflect session/todo requirements and clear handoffs.
- Orchestrator references AGI docs + provides actionable plan template.
- AGI-Scout scope covers docs/research expectations with correct write boundaries.
- Careful js-edit Refactor and Upgrade js-md-scan-edit reference new coordination/testing rules.

Change set:
- `.github/agents/AGI-Orchestrator.agent.md`
- `.github/agents/AGI-Scout.agent.md`
- `.github/agents/Careful js-edit Refactor.agent.md`
- `.github/agents/Upgrade js-md-scan-edit.agent.md`
- `docs/sessions/SESSIONS_HUB.md` (session link)
- Session docs under `docs/sessions/2025-11-17-agi-agents/`

Risks/assumptions:
- No conflicting edits from other sessions; orchestrator instructions must remain concise.
- Need to avoid contradicting existing directives; ensure additions cite required docs instead of redefining them.

Tests:
- Not applicable (documentation-only changes), but ensure linting-friendly markdown and valid handoff references.

Docs to update:
- Session folder notes + SESSIONS_HUB entry; AGI doc references already present in agent specs.
