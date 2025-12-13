# Plan – Add advanced agent personas

## Objective
Add advanced agent files and register them in `.github/agents/index.json`.

## Done When
- [ ] Agent files exist under `.github/agents/` with detailed, no-handover instructions.
- [ ] `.github/agents/index.json` includes entries for each new agent and parses as valid JSON.
- [ ] Session notes reflect what was added and how it was validated.

## Change Set (initial sketch)
- `.github/agents/*.agent.md` (new agent definitions)
- `.github/agents/index.json` (catalog registration)
- `docs/sessions/2025-12-13-add-advanced-agents/*` (plan + evidence)

## Risks & Mitigations
- **Filename hazards** (slashes/Windows reserved chars/emoji weirdness): avoid `/` and validate via directory listing + git status.
- **Index drift**: validate `index.json` parses after edits.

## Tests / Validation
- Validate `.github/agents/index.json` parses as JSON.
- `git status -sb` to confirm only intended files changed.
