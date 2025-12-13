# Working Notes – jsgui3 Post-upgrade Regression Sweep

- 2025-12-13 — After `npm install` (unlinking local stack repos from `node_modules`), re-validated the UI stack.

## Session scripts
- `scripts/stack-snapshot.js` → writes `scripts/stack-snapshot.json`
- `scripts/npm-tree.js` → writes `scripts/npm-tree.json`
- `scripts/run-post-upgrade-gate.js` → writes `scripts/post-upgrade-gate-summary.json` + per-step logs
- `scripts/repeat-e2e.js` → repeats selected E2E tests in CI mode + writes `scripts/repeat-e2e-summary.json`

## Dependency snapshot (post-upgrade)
Command:
```powershell
node docs/sessions/2025-12-13-jsgui3-post-upgrade-regression/scripts/stack-snapshot.js
node docs/sessions/2025-12-13-jsgui3-post-upgrade-regression/scripts/npm-tree.js
```

Observed:
- Top-level resolvable packages:
	- `jsgui3-client@0.0.121`
	- `jsgui3-html@0.0.170`
- The older split subpackages (`jsgui3-html-core`, `jsgui3-html-enh`, etc.) are not resolvable directly in this install; they appear to be bundled/hidden behind `jsgui3-html`.
- Dependency tree shows a nested older version via `jsgui3-server@0.0.140`:
	- `jsgui3-server@0.0.140` depends on `jsgui3-client@0.0.120` and `jsgui3-html@0.0.166` (nested)
	- This repo resolves `jsgui3-client@0.0.121` at top-level.

Artifacts:
- `scripts/stack-snapshot.json`
- `scripts/npm-tree.json`

## Post-upgrade gate run
Command:
```powershell
node docs/sessions/2025-12-13-jsgui3-post-upgrade-regression/scripts/run-post-upgrade-gate.js
```

Result: all steps OK (UI client build, SSR checks, server E2Es, Puppeteer E2Es, Data Explorer server tests).

Artifacts:
- `scripts/post-upgrade-gate-summary.json`
- `scripts/logs/*.stdout.log` / `scripts/logs/*.stderr.log`

## Deeper post-upgrade flake check (E2E repeats)
Command:
```powershell
node docs/sessions/2025-12-13-jsgui3-post-upgrade-regression/scripts/repeat-e2e.js --runs 5 --test tests/ui/e2e/url-filter-toggle.puppeteer.e2e.test.js
node docs/sessions/2025-12-13-jsgui3-post-upgrade-regression/scripts/repeat-e2e.js --runs 3 --test tests/server/diagram-atlas.e2e.test.js --test tests/ui/e2e/art-playground-resize.puppeteer.e2e.test.js
```

Result: repeated runs passed (see `scripts/repeat-e2e-summary.json` and `scripts/logs/repeat-e2e/*.log`).

Note: the URL filter toggle E2E now uses a "try fast, then hydrate-wait retry" pattern so upstream hydration improvements can take the fast path while still guarding against edge-case hydration races.
