# Working Notes – Seamless git workflows for agents

- 2025-12-30 — Session created via CLI. Add incremental notes here.

## 2025-12-30

Goal: make git usage seamless for agents (PR creation link, upstream checks, JSON output).

Commands / evidence:
- `node tools/dev/git-pr-link.js` prints a GitHub compare URL using:
	- base branch derived from `origin/HEAD`
	- head branch derived from current `HEAD`
	- warnings for common blockers (dirty tree, missing upstream)
- `node tools/dev/git-pr-link.js --json` emits machine-readable output.
- `npm run pr:link` wraps the tool.

Focused test:
- `npm run test:by-path tests/tools/__tests__/git-pr-link.test.js`

Update (divergence):
- `git-pr-link` now computes ahead/behind vs base using `git rev-list --left-right --count <base>...<head>`.
	- Prefers `refs/remotes/origin/<base>` when available so results match the PR base.
