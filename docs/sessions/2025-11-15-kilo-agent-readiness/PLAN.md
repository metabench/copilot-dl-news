# Plan: kilo-agent-readiness
Objective: Prepare this repo to adopt Kilo Code by establishing instruction folders and a reusable agent-writer mode tailored to the codebase.
Done when:
- Dedicated workspace directories exist for Kilo-specific rules and documentation, with clear entry points for future instructions.
- A custom Kilo mode ("Kilo Agent Fabricator") is defined and documented so it can draft task-specific agents for this codebase.
- AGENTS.md and the docs index reference the new Kilo workflow plus this session folder.
- Work is captured in the session folder (plan, notes, summary) and added to the sessions hub.
Change set: `.kilocodemodes`, `.kilo/**`, `docs/workflows/kilo-agent-handbook.md` (new), `docs/sessions/2025-11-15-kilo-agent-readiness/**`, `docs/sessions/SESSIONS_HUB.md`, `docs/INDEX.md`, `AGENTS.md`.
Risks/assumptions: Kilo instructions must stay in sync with existing Copilot-style agents; unclear expectations for future Kilo tooling could change directory layout; need to keep instructions concise so Kilo context windows stay manageable.
Tests: N/A (documentation + config only). Validate by linting markdown structure informally.
Benchmark: Not applicable (no DB or perf-impacting code paths).
Docs to update: `AGENTS.md` (loop improvement), `docs/INDEX.md`, `docs/workflows/kilo-agent-handbook.md` (new), `docs/sessions/SESSIONS_HUB.md`.
