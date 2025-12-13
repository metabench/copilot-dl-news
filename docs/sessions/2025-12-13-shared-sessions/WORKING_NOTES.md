# Working Notes – Shared sessions across repos

- 2025-12-13 — Session created via CLI. Add incremental notes here.

## Implemented
- `tools/dev/session-link.js` — links a session into another repo’s `docs/sessions/` (dry-run by default; apply with `--fix`).
- `docs/workflows/shared-sessions-across-repos.md` — workflow doc.
- Tests: `tests/tools/__tests__/session-link.test.js` (covers slug resolution + copy mode).

## Quick usage
```powershell
# Dry-run
node tools/dev/session-link.js --session shared-sessions --to "C:\path\to\other-repo"

# Apply (junction/symlink)
node tools/dev/session-link.js --session shared-sessions --to "C:\path\to\other-repo" --fix

# Snapshot copy
node tools/dev/session-link.js --session shared-sessions --to "C:\path\to\other-repo" --mode copy --fix
```
