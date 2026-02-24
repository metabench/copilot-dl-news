# AGI Self-Model (Draft)

## Purpose
Describe how this repository can host an AGI-style, tool-enabled workflow where agents iteratively sense the state of the system, plan work, act through tooling, and document outcomes.

## Scope of Automation
- **Domain**: Large-scale news ingestion, enrichment, and delivery via modular Node.js services under `/src` plus supporting scripts in `/tools` and `/scripts`.
- **Agents**: GitHub Copilot (GPT-5 Codex) variants, Kilo modes, and future specialized personas defined here.
- **Tooling Surface**: Custom CLI utilities (`js-scan`, `js-edit`, `md-scan`), npm scripts, and documentation scaffolds.

## Current Capabilities
- Rich documentation culture (`docs/` tree) capturing architecture, workflows, and tool specs.
- Tier-1 JavaScript tooling:
  - `node tools/dev/js-scan.js` for semantic code discovery.
  - `node tools/dev/js-edit.js` for guarded batch modifications.
- Minimal MCP surface: `node tools/mcp/docs-memory/server.js` streams SELF_MODEL, LESSONS, and session excerpts for agent memory priming.
- “Skill packs” (capability bundles) captured as docs-first artifacts under `docs/agi/skills/` and indexed in `docs/agi/SKILLS.md`.
- Established directives in `AGENTS.md` enforcing Plan → Implement → Verify loops.
- Data-oriented adapters and service layering (per AGENTS.md) enabling clean abstraction points for future automation.
- Canonical agent governance captured in `docs/agents/agent_policy.md` and companions (e.g., `docs_indexer_and_agents_refactorer.md`), which define research-first behavior and documentation upkeep.
- **Instruction Self-Modification Pipeline**: Agents can propose versioned changes to instruction files via MCP tools (`proposeInstructionChange`, `listInstructionProposals`, `reviewInstructionProposal`). Proposals are stored as JSON in `docs/agi/instruction-proposals/` and require explicit human review before application.
- **Session Retrospective Automation**: Automated extraction of candidate lessons from completed sessions via MCP tool (`runRetrospective`) and CLI (`tools/agi/session-retrospective.js`). Uses TF-IDF cosine similarity to deduplicate against existing `LESSONS.md` content.
- **Architect Loop Orchestrator**: Autonomous improvement pipeline (`tools/agi/architect-loop.js`) that chains harvest → scan → report → propose. Supports dual-engine scanning: text-based (fast) and AST-aware via `js-scan` with guard pattern detection.
- **Process Guardian**: Tracks spawned processes (`tools/agi/process-guardian.js`), detects orphans, kills them on cleanup, and logs kills as lessons. Prevents rogue processes from persisting after agent sessions.
- **OCI Operations Skill Pack**: Codified Oracle Cloud Infrastructure knowledge (`docs/agi/skills/oci-operations/SKILL.md`) covering compartment layout, instance shapes, deployment patterns, and fleet management tools.

## Limitations
- No unified AGI-focused documentation prior to this effort; knowledge scattered across numerous files.
- Static-analysis outputs are textual; no persisted knowledge graph or visualization pipeline yet.
- Agents cannot execute Python; analysis must rely on Node.js or PowerShell-safe commands.
- Tool chaining and long-lived plans still manual (Gap 4/Plans initiative pending completion).

## Interfaces & Dependencies
- **Source Tree**: `/src` modules constitute the operational surface; AGI agents must interact indirectly via tooling/documentation.
- **Data Stores**: Not directly manipulated here; all persistence flows through `/src/db` adapters.
- **CI/Test Harness**: `npm run test:by-path` and `npm run test:file` per repository rules; referenced for completeness though AGI Documentation Scout does not run tests.

## Desired Evolution
- Maintain a living knowledge graph of modules, services, and contracts derived from `js-scan` outputs.
- Formalize stateful workflows where plans persist between sessions (leveraging planned `--from-plan` capabilities in `js-edit`).
- Establish specialized agents (e.g., Static Analysis Scout, Knowledge Archivist) to own slices of the AGI roadmap.
- Add MCP-facing “skills registry” discovery so agents can list/search/get skill packs without relying on human recall.

## Usage Notes
- Treat this document as the “identity card” for AGI initiatives. Update it whenever capabilities, limitations, or core workflows shift.
- Cross-link any new tooling or agent spec additions so the self-model reflects the current operating picture.
- Before proposing new agents, review the canonical files under `docs/agents/` to ensure consistency with existing roles and owners.
