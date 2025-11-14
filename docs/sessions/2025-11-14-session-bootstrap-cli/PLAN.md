# Plan – Session Bootstrap CLI & Micro Task Policy

## Objective
Automate session folder creation via CLI while defining when agents can skip full sessions (micro-task policy + shared log).

## Done When
- CLI design captured and implemented with tests and docs.
- Singularity Engineer & AGENTS instructions explain the new decision tree (full session vs. lightweight vs. micro-task) and micro-log expectations.
- Shared micro-task log markdown exists with guidance on how to append entries during small fixes.

## Change Set
- `tools/dev/session-init.js` (new CLI) + template files.
- `docs/sessions/...` template snippets and README updates (e.g., `docs/INDEX.md`, `docs/sessions/SESSIONS_HUB.md`).
- `.github/agents/Singularity Engineer.agent.md`, `AGENTS.md`, and new micro-log doc.
- Tests under `tests/tools` (or similar) for the CLI.

## Risks & Mitigations
- **File overwrites**: CLI must refuse to clobber existing files unless `--force` is set.
- **Doc drift**: Keep `SESSIONS_HUB.md` updates atomic and testable; consider snapshot tests for generated content.
- **Agent misuse**: Provide clear heuristics/thresholds to prevent overuse of micro-task mode.

## Tests
- Unit tests verifying CLI output structure + hub update.
- Linting/format checks via existing tooling (if available).

## Follow-ups
- Potential integration with VS Code tasks or templates after initial rollout.
