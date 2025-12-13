# Plan – jsgui3 Post-upgrade Regression Sweep

## Objective
Re-run UI baseline after npm install and triage any regressions vs jsgui3 ecosystem.

## Done When
- [ ] Installed dependency snapshot is captured (versions + tree) and stored in this session folder.
- [ ] Post-upgrade UI baseline gate is re-run and passes (SSR checks + Jest + Puppeteer).
- [ ] Any version skew risks are documented with “fix here vs upstream” guidance.

## Change Set (initial sketch)
- Session scripts (kept in-repo):
	- `docs/sessions/2025-12-13-jsgui3-post-upgrade-regression/scripts/stack-snapshot.js`
	- `docs/sessions/2025-12-13-jsgui3-post-upgrade-regression/scripts/npm-tree.js`
	- `docs/sessions/2025-12-13-jsgui3-post-upgrade-regression/scripts/run-post-upgrade-gate.js`
- Session notes + summary in this directory.

## Risks & Mitigations
- **Mixed versions in dependency tree**: e.g. `jsgui3-server` pulling an older nested `jsgui3-client`.
	- Mitigation: rely on top-level imports in this repo; consider upstream bump in `jsgui3-server` deps to allow dedupe.
- **Puppeteer/SSR flakiness**:
	- Mitigation: run the same deterministic gate as pre-upgrade; capture logs per-step.

## Tests / Validation
- Run the automated post-upgrade gate script:
	- `node docs/sessions/2025-12-13-jsgui3-post-upgrade-regression/scripts/run-post-upgrade-gate.js`
	- Logs: `docs/sessions/2025-12-13-jsgui3-post-upgrade-regression/scripts/logs/`
	- Summary: `docs/sessions/2025-12-13-jsgui3-post-upgrade-regression/scripts/post-upgrade-gate-summary.json`
