# AGI Documentation Hub

This directory describes how the copilot-dl-news project can evolve toward an AGI-aligned, tool-augmented workflow. Every document here is a proposal that requires human review before adoption in live agent configs.

## Core References
- [SELF_MODEL.md](SELF_MODEL.md) – Current understanding of the agent ecosystem, capabilities, and limits.
- [WORKFLOWS.md](WORKFLOWS.md) – Canonical Sense → Plan → Act loops for key activities.
- [TOOLS.md](TOOLS.md) – Catalog of existing and proposed static-analysis and orchestration tools.
- [SKILLS.md](SKILLS.md) – Registry of “capability pack” Skills (discoverable SOPs + scripts + validation).
- [LIBRARY_OVERVIEW.md](LIBRARY_OVERVIEW.md) – Project architecture from an AGI enablement lens.
- [RESEARCH_BACKLOG.md](RESEARCH_BACKLOG.md) – Open questions and investigations to unlock AGI-grade automation.
- [LESSONS.md](LESSONS.md) – Patterns and anti-patterns distilled from prior work.
- [journal/](journal/) – Session-by-session notes and plans.
- [agents/](agents/) – Draft agent specs (not yet active). Each requires manual promotion into the real agent directories.
- [agents/jsgui3-ui-isomorphic.agent.md](agents/jsgui3-ui-isomorphic.agent.md) – Draft agent charter for researching and shipping jsgui3 isomorphic UI fixes (client-first scope).
- [AGENT_LANDSCAPE.md](AGENT_LANDSCAPE.md) – Snapshot of existing canonical agents outside `/docs/agi` to consult before proposing new ones.
- [tools/JS_SCAN_DEEP_DIVE.md](tools/JS_SCAN_DEEP_DIVE.md) – Advanced js-scan usage notes, including meta-scans on the tooling itself.
- [tools/JS_EDIT_DEEP_DIVE.md](tools/JS_EDIT_DEEP_DIVE.md) – Guarded js-edit workflows and recipes, plus guidance for editing the tooling safely.

## How to Use This Space
1. **Start with SELF_MODEL.md** to understand the constraints and assets available to AGI-style agents.
2. **Follow WORKFLOWS.md** to run Sense → Plan → Act loops, plugging in tools from TOOLS.md.
3. **Update the JOURNAL** each session to capture context and maintain continuity.
4. **File research questions** in RESEARCH_BACKLOG.md and move resolved insights into LESSONS.md.
5. **Review canonical specs** in `docs/agents/` before designing or refining agents here to stay aligned with repository-wide policies.
6. **Design or refine agents** inside `agents/`, clearly marking them as drafts.

## Status (2025-11-16)
- Foundations established; documents are initial drafts.
- Static-analysis emphasis centers on `tools/dev/js-scan.js` and `tools/dev/js-edit.js`, with proposals for deeper graph tooling pending implementation.
- Next milestone: enrich LIBRARY_OVERVIEW.md with module-level deep dives and begin drafting specialized agent personas (e.g., Static Analysis Scout, Architecture Cartographer).
