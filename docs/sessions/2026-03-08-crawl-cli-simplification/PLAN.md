# Plan – Crawl CLI Simplification (Launcher Hardening)

## Objective
Harden the unified crawl launcher around edge cases and add one small introspection improvement so operators can inspect the front door more safely without changing delegated crawl behavior.

## Done When
- [x] `tools/crawl/index.js` exposes one new low-risk introspection improvement for operators.
- [x] Unknown-name and custom-profile-dir handling are clearer and better covered by tests.
- [x] Explicit JSON path handling and tool-vs-profile precedence are covered by focused tests.
- [x] `tools/crawl/AGENT.md` and the active session notes reflect the new launcher behavior.
- [x] Focused validation passes, including the bounded remote reliability helper suite.

## Change Set
- `tools/crawl/index.js`
- `tests/tools/crawl-index.test.js`
- `tools/crawl/AGENT.md`
- `docs/sessions/2026-03-08-crawl-cli-simplification/*`

## Risks & Mitigations
- Risk: the launcher accretes too many bespoke commands. Mitigation: keep the improvement limited to introspection/hardening and preserve the thin delegation model.
- Risk: reserved launcher words or tool/profile name collisions confuse operators. Mitigation: keep command precedence stable, surface it in help/list output, and lock it down with tests.
- Risk: focused CLI changes regress the bounded remote path indirectly. Mitigation: validate both launcher tests and `tests/tools/crawl-remote-bounded.test.js`.

## Tests / Validation
- `npm run test:by-path -- tests/tools/crawl-index.test.js`
- `npm run test:by-path -- tests/tools/crawl-remote-bounded.test.js`
- `node tools/crawl/index.js list`
- `node tools/crawl/index.js list --json`
- `node tools/crawl/index.js remote-bounded-smoke --dry-run`
- `node tools/crawl/index.js profile remote-bounded-smoke --dry-run`
