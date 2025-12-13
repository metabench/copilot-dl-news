# Plan – Shared sessions: self-install + agent management

## Objective
Add self-install and cross-repo agent upsert to session-link

## Done When
- [x] Tool can install itself into another repo (dry-run default).
- [x] Tool can create/enhance emoji-named agents and update `.github/agents/index.json`.
- [x] Focused Jest tests cover install + agent upsert.
- [x] Key deliverables are summarized in `SESSION_SUMMARY.md`.

## Change Set (initial sketch)
- tools/dev/session-link.js
- docs/workflows/shared-sessions-across-repos.md
- tests/tools/__tests__/session-link.install-and-agents.test.js

## Risks & Mitigations
- Windows link types: junctions vs symlinks can be misdetected → treat any path with successful `readlink()` as “link-like”.
- Cross-repo installs: target repo may not have dependencies → keep the CLI self-contained (no `commander`).
- Accidental overwrites → default dry-run; require `--fix`; require `--force` to overwrite existing tooling/agent file.

## Tests / Validation
- `npm run test:by-path tests/tools/__tests__/session-link.test.js`
- `npm run test:by-path tests/tools/__tests__/session-link.install-and-agents.test.js`
