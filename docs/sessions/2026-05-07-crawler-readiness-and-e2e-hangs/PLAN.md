# Plan: Crawler Readiness & E2E Hang Audit

**Codex: Endurance Brain mode active.**

## Objective
Confirm the crawler is ready to run via documented agent commands, then improve e2e crawling tests with static analysis to eliminate hangs.

## Done when
- [ ] `npm run crawl -- list` resolves and every documented profile exists.
- [ ] Each documented agent command in `tools/crawl/AGENT.md` is verified (dry-run or static dispatch trace).
- [ ] Inventory of e2e crawl tests captured in `WORKING_NOTES.md` with hang-risk score per file.
- [ ] Static hang analysis script committed under `tools/dev/` (or reused) producing a JSON report.
- [ ] At least one concrete test improvement landed (timeout, cleanup, or check-mode) with a passing run.
- [ ] Session summary + follow-ups written.

## Scope
- `tools/crawl/**`, `deploy/remote-crawler-v2/**`, `tests/**` (e2e + crawl), `package.json` scripts.
- No behavioral changes to the crawler itself.
- No deletion of legacy scripts.

## Hang-risk patterns to flag
1. `setInterval` / `setTimeout` without `unref()` or cleared in `afterAll`.
2. `child_process.spawn` / `fork` without explicit `kill()` in teardown.
3. `app.listen` / `server.listen` without `server.close()` in `afterAll`.
4. SSE/WebSocket / `EventSource` without `close()`.
5. `await` on indefinite `Promise` (no race vs timeout) in test bodies.
6. Polling loops (`while (true)` / `for(;;)`) without max-iter or timeout deadline.
7. Missing `jest.setTimeout` for tests doing real I/O.
8. Server starts in tests without `--check` shortcut where the contract exists.
9. `db.close()` missing (better-sqlite3 leaks file handles → process won't exit).
10. Jest config missing `--detectOpenHandles` / `--forceExit` for the e2e suite.

## Validation Matrix (preview)
| Check | Command | Expected |
|---|---|---|
| Launcher list | `node tools/crawl/index.js list --json` | JSON with 7 tools + 4 profiles |
| Profile dispatch | `npm run crawl -- simple-distributed-smoke --dry-run` | Prints resolved command |
| Remote status (offline OK) | `node tools/crawl/crawl-remote.js status --host 127.0.0.1:1` | Fails fast, no hang |
| E2E crawl tests | `npm run test:e2e-quick -- --listTests` | Lists tests, exits 0 |
| Hang analyzer | `node tools/dev/test-hang-analyzer.js --dir tests --json` | Report file emitted |
