# Plan – Seamless git workflows for agents

## Objective
Make agent git usage a frictionless enabler (branch checks, PR link creation, predictable defaults).

## Done When
- [ ] A single command prints a correct GitHub PR compare link (base auto-detected via `origin/HEAD`).
- [ ] The command warns on common blockers (dirty tree, no upstream, no origin remote) with actionable next commands.
- [ ] JSON output is available for automation.
- [ ] Minimal Jest coverage exists for URL parsing/compare link generation.
- [ ] Docs are updated so agents prefer the helper (git remains an enabler).
- [ ] Evidence (commands + output) is captured in `WORKING_NOTES.md`.

## Change Set (initial sketch)
- `tools/dev/git-pr-link.js` (new)
- `package.json` (add `pr:link` script)
- `tests/tools/__tests__/git-pr-link.test.js` (new)
- `tools/dev/README.md` (document the CLI)
- `docs/standards/commit_pr_standards.md` (add PR creation guidance via compare link)

## Risks & Mitigations
- **Different origin URL formats** (HTTPS vs SSH): parse both.
- **Non-GitHub remotes**: detect and still print a best-effort message.
- **Windows shells**: avoid bashisms; rely on `git` + Node.

## Tests / Validation
- Unit: `npm run test:by-path tests/tools/__tests__/git-pr-link.test.js`
- Manual sanity:
	- `node tools/dev/git-pr-link.js`
	- `node tools/dev/git-pr-link.js --json`
	- `npm run pr:link`
