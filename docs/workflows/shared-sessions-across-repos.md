# Shared Sessions Across Repos (Windows-friendly)

Goal: keep a single session folder (PLAN/NOTES/SUMMARY) usable from multiple repos without copy/paste drift.

## Recommended approach

- Keep the *canonical* session directory in one “source” repo.
- Link it into other repos using a **directory junction** (Windows) or **symlink** (non-Windows).
- Use `--mode copy` only when you explicitly want a snapshot (not a shared working folder).

## Tooling

This repo ships a small helper:

- `node tools/dev/session-link.js`

It resolves a session by slug (latest date wins) or full session id, and links/copies it into another repo’s `docs/sessions/`.

It also supports:

- Installing this helper (and its workflow doc) into another repo.
- Creating or enhancing emoji-named agent files in another repo, updating that repo’s `.github/agents/index.json`.

### Dry-run (no changes)

```powershell
node tools/dev/session-link.js --session shared-sessions --to "C:\path\to\other-repo"
```

### Apply (create a junction/symlink)

```powershell
node tools/dev/session-link.js --session shared-sessions --to "C:\path\to\other-repo" --fix
```

### Apply as snapshot copy

```powershell
node tools/dev/session-link.js --session shared-sessions --to "C:\path\to\other-repo" --mode copy --fix
```

### Overwrite an existing link

If the destination already exists (e.g., you previously linked the session), you can overwrite it:

```powershell
node tools/dev/session-link.js --session shared-sessions --to "C:\path\to\other-repo" --fix --force
```

Safety note: `--force` is intentionally conservative; it refuses to delete a non-link directory unless you used `--mode copy`.

## Install this tooling into another repo

This makes the target repo self-sufficient (no reliance on the source repo having the tool).

### Dry-run

```powershell
node tools/dev/session-link.js --install-tooling --to "C:\path\to\other-repo"
```

### Apply

```powershell
node tools/dev/session-link.js --install-tooling --to "C:\path\to\other-repo" --fix
```

### Include tests (optional)

```powershell
node tools/dev/session-link.js --install-tooling --to "C:\path\to\other-repo" --include-tests --fix
```

If the target already has those files, add `--force` to overwrite.

## Create or enhance agents in another repo

The target repo is expected to use `.github/agents/index.json` as its catalog. The tool will create/update the index entry and write the agent markdown.

### Create a new “enhanced” jsgui3 + Singularity agent (emoji name)

```powershell
node tools/dev/session-link.js \
	--agent-create \
	--agent-title "🧠 jsgui3 Singularity 🧠" \
	--agent-purpose "Ship reliable jsgui3 UI changes" \
	--agent-tags "ui,jsgui3,singularity" \
	--to "C:\path\to\other-repo" \
	--fix
```

### Enhance an existing agent file (idempotent)

```powershell
node tools/dev/session-link.js --agent-enhance --agent-title "🧠 jsgui3 Singularity 🧠" --to "C:\path\to\other-repo" --fix
```

## Invariants (what this workflow guarantees)

- Linking never mutates the source session.
- Default behavior is dry-run; changes require `--fix`.
- On Windows, the default link style uses junction semantics so admin rights are not required.

## Common failure modes

- Target repo doesn’t have `docs/sessions/` yet: the tool creates it.
- Destination folder already exists: re-run with `--force` (only safe cases) or pick a different session id.
