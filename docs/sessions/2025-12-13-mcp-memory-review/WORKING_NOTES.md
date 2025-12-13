# Working Notes – Review docs-memory MCP adoption

- 2025-12-13 — Session created via CLI.

## Known facts (repo evidence)

- The docs-memory MCP server is registered in VS Code via [.vscode/mcp.json](.vscode/mcp.json) and is healthy locally.
- The server exposes a fairly rich tool surface (sessions, workflows, patterns, knowledge map) implemented in [tools/mcp/docs-memory/mcp-server.js](tools/mcp/docs-memory/mcp-server.js).

## Evidence captured

- MCP pre-flight (quick): `node tools/dev/mcp-check.js --quick --json` returned `allHealthy: true`.
- MCP tool listing: `node tools/dev/mcp-check.js --json` reported these `docs-memory` tools:
	- sessions: `docs_memory_getSession`, `docs_memory_listSessions`, `docs_memory_searchSessions`, `docs_memory_findOrContinueSession`, `docs_memory_appendToSession`, `docs_memory_getTaskProgress`
	- workflows: `docs_memory_listWorkflows`, `docs_memory_getWorkflow`, `docs_memory_searchWorkflows`, `docs_memory_proposeWorkflowImprovement`
	- durable docs: `docs_memory_getSelfModel`, `docs_memory_getLessons`, `docs_memory_appendLessons`
	- catalogs: `docs_memory_addPattern`, `docs_memory_addAntiPattern`, `docs_memory_getPatterns`, `docs_memory_getAntiPatterns`
	- coverage: `docs_memory_updateKnowledgeMap`, `docs_memory_getKnowledgeMap`

## Observations

- The tool surface is “useful enough” on-paper: it supports the whole loop (discover prior work → continue → record learnings).
- The main adoption pain appears to be *operator friction + discoverability*, not missing capability:
	- In some agent environments, only a subset of docs-memory tools are exposed by default, so the “best” calls (e.g. session search / append-to-session) aren’t obviously available.
	- The primary guide, [docs/agi/AGENT_MCP_ACCESS_GUIDE.md](docs/agi/AGENT_MCP_ACCESS_GUIDE.md), assumes all tools are present whenever MCP is configured, but doesn’t explain tool-gating/activation or fallbacks.
	- There are strong competing affordances (`grep_search`, `read_file`, `md-scan`, `what-next`) that solve “I can’t find something” fast, so people/agents fall into those habits unless memory usage is made a default step.

## Adoption hypothesis (why it’s underused)

- **Mixture of both**:
	- **Utility gap**: missing a couple “high-leverage” memory queries (e.g., fast lookup for the skills registry / AGI index docs) and a one-call “start here” tool.
	- **Instruction/discoverability gap** (bigger): the repo tells agents “docs-memory exists”, but doesn’t operationalize a *mandatory* first step (“search/continue before starting”) in a way that survives context pressure.


- 2025-12-13 19:50 — 
- Updated key agent personas to operationalize docs-memory usage:
  - .github/agents/🧠🌩️ AGI Brainstorm 🌩️🧠.agent.md: added Memory System Contract + error-reporting loop
  - .github/agents/AGI-Orchestrator.agent.md: added Memory-First Requirement section
  - .github/agents/Careful Builder.agent.md: added docs-memory tools + lightweight memory-first guidance
- Intent: make memory usage default and require user-visible notification + systemic improvement suggestion on MCP failures.

- 2025-12-13 19:54 — 
## Rollout: memory-first contract added to more agents (2025-12-13)

Applied the standardized **Memory System Contract (docs-memory MCP)** + enabled `docs-memory/*` tool access across additional high-traffic personas:
- `.github/agents/🕷️ Crawler Singularity 🕷️.agent.md`
- `.github/agents/UI Singularity.agent.md`
- `.github/agents/💡UI Singularity💡.agent.md`
- `.github/agents/🔬 CLI Tool Analyst 🔬.agent.md`
- `.github/agents/🧠📚 Knowledge Consolidator Prime 🧠📚.agent.md`
- `.github/agents/🛰️ Telemetry & Drift Sentinel 🛰️.agent.md`
- `.github/agents/🧬 Deterministic Testwright 🧬.agent.md`
- `.github/agents/Jest Test Auditer.agent.md`

Contract contents (consistent across agents): MCP pre-flight (`node tools/dev/mcp-check.js --quick --json`), memory-first session discovery, post-work persistence (Lesson/Pattern/Anti-Pattern), and user-visible error reporting + systemic improvement suggestion + logging to the active session `FOLLOW_UPS.md`.

- 2025-12-13 19:56 — 
## Rollout: memory-first contract added to DB + CLI implementation agents (2025-12-13)

Extended the standardized **Memory System Contract (docs-memory MCP)** + enabled `docs-memory/*` tool access for:
- `.github/agents/DB Modular.agent.md`
- `.github/agents/🧩 DB Injection Wrangler 🧩.agent.md`
- `.github/agents/🌟📐 CLI Toolsmith 📐🌟.agent.md`
- `.github/agents/🔧 CLI Tool Singularity 🔧.agent.md`

- 2025-12-13 19:59 — 
## Rollout: memory-first contract added to more infra/meta agents (2025-12-13)

Extended the standardized **Memory System Contract (docs-memory MCP)** + enabled `docs-memory/*` tool access for:
- `.github/agents/🧠 AGI Singularity Brain 🧠.agent.md`
- `.github/agents/🧠 CLI Tooling Brain 🧠.agent.md`
- `.github/agents/🧭 Architecture Contract Keeper 🧭.agent.md`
- `.github/agents/🧰 Refactor Locksmith 🧰.agent.md`
- `.github/agents/🧱 Config Schema Gatekeeper 🧱.agent.md`
- `.github/agents/🧯 CI Flake Firefighter 🧯.agent.md`
- `.github/agents/🧪 Fixture Alchemist 🧪.agent.md`
- `.github/agents/🧬 GOFAI Plugin Implementer 🧬.agent.md`
- `.github/agents/🕵️ Dependency Noir Detective 🕵️.agent.md`
- `.github/agents/🦉 Prof. Edge-Case 🦉.agent.md`
- `.github/agents/🗺️ UX Cartographer 🗺️.agent.md`
- `.github/agents/🧠 Project Director 🧠.agent.md`
- `.github/agents/🔬 Interactive Crawl Observatory 🔬.agent.md` (added missing frontmatter so tool access can be declared)
