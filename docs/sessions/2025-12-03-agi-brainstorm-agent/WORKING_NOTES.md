# Working Notes – Create AGI Brainstorm agent

- 2025-12-03 11:20 — Ran `node tools/dev/session-init.js --slug "agi-brainstorm-agent" ...` to scaffold PLAN/WORKING_NOTES/SESSION_SUMMARY and auto-link SESSIONS_HUB.
- 2025-12-03 11:28 — Filled in PLAN (deliverables, change set, risks, validation).
- 2025-12-03 11:40 — Reviewed `.github/agents/AGI-Orchestrator.agent.md` for structural cues.
- 2025-12-03 11:55 — Authored `.github/agents/🧠🌩️ AGI Brainstorm.agent.md` with mission, workflow, constraints, self-improvement loop, and documentation expectations.
- 2025-12-03 15:05 — Brainstormed potential upgrades for the agent spec (see ranked options in response):
	1. Add a structured rubric/template section so every brainstorm outputs the same table (options, impact, effort, risks) plus a checklist verifying coverage of UI/data/tooling/ops.
	2. Bake in discovery hooks (mandatory `md-scan` queries + reference to `/docs/agi/SELF_MODEL.md`) before ideation to reduce context loss.
	3. Define escalation/handoff pathways (e.g., when to ping AGI-Orchestrator vs. UI Singularity) and capture them in FOLLOW_UPS automatically.
	4. Require automation spike recommendations (scripts, instrumentation) when manual workflows look fragile.
- 2025-12-03 15:20 — Implemented options 1–3 inside `.github/agents/🧠🌩️ AGI Brainstorm 🌩️🧠.agent.md` (discovery hooks, rubric + checklist, escalation matrix + FOLLOW_UPS guidance).
