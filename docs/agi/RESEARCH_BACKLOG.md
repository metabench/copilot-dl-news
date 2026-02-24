# AGI Research Backlog

| id | question | priority | status | owner | last_update | links |
| --- | --- | --- | --- | --- | --- | --- |
| RB-001 | How can `js-scan` output be converted into a persistent knowledge graph (nodes: modules, edges: imports/calls)? | High | Open | Agents | 2025-11-16 | TOOLS.md#proposed-tooling-extensions |
| RB-002 | What minimal schema enables `js-edit --from-plan` to store/resume multi-day refactors safely? | High | Open | Humans | 2025-11-16 | WORKFLOWS.md#refactor--architecture-reshaping |
| RB-003 | Which documentation diffing strategy keeps `/docs/agi` aligned with legacy workflow docs? | Medium | Open | Agents | 2025-11-16 | TOOLS.md#proposed-tooling-extensions |
| RB-004 | How can agents quantify code hotspots (fan-in/out, churn) without external SaaS tools? | Medium | Open | Agents | 2025-11-16 | LIBRARY_OVERVIEW.md |
| RB-005 | What cadence should journal entries follow to avoid gaps when no AGI tasks run for weeks? | Low | Open | Agents | 2025-11-16 | journal/2025-11-16.md |
| RB-006 | How can `js-scan` relationship queries emit continuation tokens that `js-edit` can ingest without re-running locate steps? | High | In Progress | Agents | 2025-11-21 | tools/JS_SCAN_DEEP_DIVE.md#continuation-tokens-phase-2-plan |
| RB-007 | How can a "Proactive Architect Agent" autonomously monitor `LESSONS.md` and propose refactors to align code with new patterns? | High | Open | Agents | 2026-02-15 | WORKFLOWS.md#proactive-refactoring |
| RB-008 | Can we implement "Instruction Compliance Tests" (meta-tests) to verify agents actually follow directives (e.g., did they run session-init)? | Medium | Open | Verification | 2026-02-15 | AGENTS.md#compliance-testing |
| RB-009 | How can agents autonomously design UI dashboards from task output patterns — observe data shape → generate jsgui3 components → self-test in headless browser? | High | Open | Agents | 2026-02-15 | SELF_MODEL.md#desired-evolution |
| RB-010 | What is the minimal integration required for crawl tasks to auto-open a progress dashboard and send desktop notifications on completion? | High | Open | Agents | 2026-02-15 | labs/crawler-progress-integration |
