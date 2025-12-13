# Follow Ups – Review docs-memory MCP adoption

- [Docs][Owner: You] Update [docs/agi/AGENT_MCP_ACCESS_GUIDE.md](docs/agi/AGENT_MCP_ACCESS_GUIDE.md) to:
	- call out that tool availability may be gated by environment
	- describe the “activation” step when only a subset is available
	- include CLI fallbacks (`md-scan`, `what-next`) for non-MCP contexts

- [Docs][Owner: You] Add a short “Memory-first” snippet to the main agent entrypoints (likely [AGENTS.md](AGENTS.md) or [docs/agi/SELF_MODEL.md](docs/agi/SELF_MODEL.md)):
	- “Before starting new work: search/continue session, then proceed.”

- [Tooling][Owner: 🌟📐 CLI Toolsmith 📐🌟] Consider adding a small docs-memory MCP tool to expose the skills registry and AGI index docs:
	- `docs_memory_getSkills()` → returns docs/agi/SKILLS.md (or a parsed registry)
	- OR `docs_memory_readAgiDoc({ path })` restricted to docs/agi/*

- [Tooling][Owner: 🌟📐 CLI Toolsmith 📐🌟] Consider a one-call “primer” tool:
	- `docs_memory_getStarterContext({ topic })` → returns best-match session(s) + lessons stats + suggested workflow names.

- [Process][Owner: AGI-Orchestrator] Decide on enforcement level:
	- soft nudge (docs + examples)
	- hard gate (agents refuse to proceed without a session lookup / session-init)

