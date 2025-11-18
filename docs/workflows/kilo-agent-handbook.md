# Kilo Agent Handbook

_Last updated: 2025-11-15_

## Purpose
Use this handbook when preparing Kilo Code (CLI, VS Code, or JetBrains extensions) to work alongside the existing Copilot-style agents. It defines where Kilo-specific instructions live in this repo, how to spin up the CLI, and how to author new custom modes that understand our documentation-first workflow.

> References: [Kilo CLI](https://kilocode.ai/docs/cli), [Using Modes](https://kilocode.ai/docs/basic-usage/using-modes), [Custom Modes](https://kilocode.ai/docs/features/custom-modes), [Memory Bank](https://kilocode.ai/docs/advanced-usage/memory-bank).

## Directory Layout

```
.kilo/
  instructions/                # legacy agent prompts mirrored from Copilot chat
  rules-kilo-agent-fabricator/ # repo-specific guidance for the agent factory mode
  rules-shared/                # (optional) drop-in snippets for future modes
.kilocodemodes                 # custom mode definitions (JSON until we migrate to YAML)
.kilocode/rules/memory-bank/   # filled when Kilo initializes the memory bank in this repo
```

Key rules:
- Keep every Kilo mode's behavioral doc inside `.kilo/rules-<mode-slug>/` so the agent can pick it up automatically.
- Store cross-mode snippets under `.kilo/rules-shared/` (create subfiles) and reference them with inline links.
- Treat `.kilocode/rules/memory-bank/` as the source of truth for long-lived project context once Kilo initializes it.

## Bring Kilo CLI Online

1. Install globally: `npm install -g @kilocode/cli`.
2. From the repo root, run `kilocode --workspace $(pwd)` (Windows: use PowerShell `kilocode --workspace $PWD`).
3. Set model/provider config with `kilocode config` (or inside the session via `/config`). Use provider env vars when automating (e.g., `KILOCODE_MODEL`, `KILO_API_KEY`).
4. Switch models or organizations with `/model select` and `/teams select` as needed.
5. Prefer `--mode orchestrator` when launching large refactors so Kilo can break work into subtasks before delegating to Code/Debug custom modes.
6. For automated runs, pipe a prompt into `kilocode --auto --timeout 900`, and whitelist necessary commands through the CLI prompt.

## Memory Bank Expectations

- Ask Kilo to `initialize memory bank` once per repo clone so `.kilocode/rules/memory-bank` captures `brief.md`, `context.md`, `tasks.md`, etc.
- Treat `[Memory Bank: Active]` as a hard gate—if responses do not include it, pause and re-run initialization.
- After meaningful feature work, run `update memory bank` or request targeted updates (e.g., `update memory bank using information from @/docs/workflows/kilo-agent-handbook.md`).
- Encourage agents to `add task` when we codify repeatable flows (e.g., "Add a crawl config workspace panel").

## Writing New Kilo Modes

1. Duplicate `.kilo/rules-kilo-agent-fabricator/10-agent-blueprint.md` and adjust for the new mode.
2. Add a mode entry to `.kilocodemodes` (JSON today). Include:
   - `slug` — matches the rules directory suffix.
   - `roleDefinition` — mention the relevant `/docs/agents` page or workflow.
   - `groups` — narrow file access (regex) so Kilo edits only what is safe.
   - `customInstructions` — link to AGENTS.md and session docs so Kilo inherits our Plan → Improve → Document loop.
3. If the mode needs local instructions or fixtures, store them in `.kilo/rules-<slug>/NN-scope.md` (numeric prefixes keep load order deterministic).
4. Update `AGENTS.md` under "Quick start" or "Core directives" with a one-line pointer whenever a new mode becomes part of the standard loop.
5. Log the addition in `docs/sessions/<date>-<slug>/WORKING_NOTES.md` and summarize results in `SESSION_SUMMARY.md`.

## Daily Usage Checklist

- Start every Kilo session by reviewing AGENTS.md and the current `docs/sessions` folder.
- Create/refresh a one-screen plan before letting Kilo edit files (Architect mode is ideal for this step).
- Use Orchestrator mode to spin up subtasks, then drop into Code or Debug mode per subtask, or invoke the new Agent Fabricator mode if you need another custom persona.
- Keep Kilo CLI output in JSON/compact mode when possible to align with our CLI expectations for js-scan/js-edit.
- As soon as Kilo produces actionable steps, translate them into the session docs and add any AGENTS improvements you discovered.

## Escalation & Tooling Notes

- If Kilo suggests running repository scripts, prefer `npm run test:by-path <test>` for all Jest suites per `docs/TESTING_QUICK_REFERENCE.md`.
- For MCP tooling, reference the provider marketplace (e.g., Context7) but document any additions under `docs/workflows` and `.kilo/rules-shared`.
- When Kilo edits `.kilocodemodes`, self-review via `git diff` and bake regression notes into `docs/sessions/<date>-kilo-agent-readiness/WORKING_NOTES.md`.
