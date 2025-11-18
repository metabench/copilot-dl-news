# Working Notes: Kilo Agent Readiness

## Research log
- 2025-11-15 @00:40 GMT — Reviewed https://kilocode.ai landing page (via r.jina.ai) for overview: highlights open-source CLI/IDE extensions, multiple agent modes (code, ask, architect, debug, orchestrator), and marketplace integrations (Context7, memory bank, MCP tools).
- 2025-11-15 @00:41 GMT — Captured CLI reference (https://kilocode.ai/docs/cli): install with `npm install -g @kilocode/cli`, slash commands (`/mode`, `/model list`, `/teams select`, `/config`), auto + parallel modes, provider config and env overrides.
- 2025-11-15 @00:43 GMT — Noted mode behaviors from https://kilocode.ai/docs/basic-usage/using-modes: Code/Ask/Architect/Debug/Orchestrator plus ability to define custom modes with tailored tool access.
- 2025-11-15 @00:45 GMT — Read https://kilocode.ai/docs/features/custom-modes to confirm YAML-based `.kilocodemodes`, sticky models per mode, `.kilo/rules-{slug}/` directories for instructions, and import/export behavior.
- 2025-11-15 @00:47 GMT — Reviewed Memory Bank workflow (https://kilocode.ai/docs/advanced-usage/memory-bank) for `.kilocode/rules/memory-bank` structure, key commands (`initialize memory bank`, `update memory bank`, `add task`), and `[Memory Bank: Active]` indicator expectations.

## Immediate goals
1. Create `.kilo/rules-*` directories for Kilo instructions (mirroring doc guidance) and seed them with repo-aware guidance.
2. Author a custom mode ("Kilo Agent Fabricator") inside `.kilocodemodes` that focuses on writing new Kilo agents/modes per task.
3. Provide a workflow doc + AGENTS pointers so future contributors know how to engage Kilo alongside existing Copilot agents.

## Questions / To watch
- Confirm whether `.kilo/instructions` is still used by existing automation; plan to keep files but point Kilo instructions at the new directories to avoid duplication.
- Consider migrating `.kilocodemodes` to YAML later for readability; defer until after this session to minimize risk.

## Implementation notes
- Created `.kilo/rules-kilo-agent-fabricator/` with overview, blueprint, and repo context docs plus a shared `00-plan-loop.md` snippet.
- Added `.kilo/rules-shared/README.md` to explain how to drop common snippets.
- Extended `.kilocodemodes` with the `kilo-agent-fabricator` custom mode restricted to docs + instruction paths, plus command/browser access for repo scanning.
