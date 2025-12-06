# Working Notes – Inspect AGI agent system context

- 2025-12-03 — Session created via `node tools/dev/session-init.js --slug wysiwyg-context ...` (auto-added to SESSIONS_HUB).
- Reviewed `AGENTS.md`: session-first workflow, plan-first, server `--check`/detached expectations, documentation loop, schema sync rules, and emphasis on jsgui3 check scripts + diagrams.
- Read `.github/agents/🧠 AGI Singularity Brain 🧠.agent.md`: meta-coordinator for domain brains/specialists/executors, prioritization framework, cross-domain handoff template, alignment rules for new agents.
- Read `.github/agents/AGI-Orchestrator.agent.md`: orchestrates plans/handoffs using /docs/agi, constrained to planning/docs; enforces session scaffolding and knowledge-first discovery before delegating.
- Read `.github/agents/UI Singularity.agent.md`: UI-specific workflow—js-scan/js-edit first, binding plugin treated as official jsgui3 extension, detached server pattern, check scripts next to controls, facts vs classifications display guidance.
- Checked `docs/sessions/SESSIONS_HUB.md`: latest active sessions are 2025-12-03-wysiwyg-context (this) and 2025-12-03-jsgui3-deep-research-singularity (aims to build ConnectorControl, ResizableControl, and WYSIWYG demo under `src/ui/server/wysiwyg-demo/`; notes currently empty).
- Opened `tests/ui/e2e/wysiwyg-demo.puppeteer.e2e.test.js` and `src/ui/server/wysiwyg-demo/server.js` to understand target surface: Express server renders `Page` via `jsgui` context on port 3020; Puppeteer test expects draggable control movement and jsgui activation globals (`window.jsgui`, `window.page`).
