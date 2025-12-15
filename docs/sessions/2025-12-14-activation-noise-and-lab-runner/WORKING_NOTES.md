# Working Notes – Eliminate activation noise + add lab runner

- 2025-12-14 — Session created via CLI. Add incremental notes here.

## Findings

- Activation noise strings were coming from jsgui3-html activation code paths:
	- `console.log('Missing context.map_Controls for type ...')` in `html-core/html-core.js` (nested dependency copies in linked setups).
	- `console.log('&&& no corresponding control')` and `console.log('adding Text_Node control', ...)` in `html-core/control-enh.js`.

## Changes

- Silenced the above `console.log` calls (commented out) in the active activation paths, including nested dependency copies that are commonly used when packages are npm-linked.
- Added a multi-check runner: `src/ui/lab/run-lab-checks.js`.
- Added npm scripts in `package.json`: `lab:list`, `lab:check`, `lab:check:all`.
