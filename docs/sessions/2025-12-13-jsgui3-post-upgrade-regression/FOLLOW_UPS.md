# Follow Ups – jsgui3 Post-upgrade Regression Sweep

- Upstream: align `jsgui3-server` dependency versions so `jsgui3-client` and `jsgui3-html` dedupe cleanly (avoid nested older copies).
- Cross-repo coordination (docs + sessions):
	- Option A: a dedicated `metabench/docs` repo with `docs/sessions/` and a lightweight CLI that can “attach” a session to a repo.
	- Option B: a git submodule (or subtree) mounted at `docs/shared/` in each repo.
	- Option C: a mono-worktree convention: keep `docs/sessions/` in one canonical repo and reference via symlink/junction (Windows-friendly junction) from other repos.
- If the stack repos need to be editable locally again, consider `npm link`/`pnpm link` workflows + a small “link-status” script (similar to `scripts/stack-snapshot.js`) in each repo.
