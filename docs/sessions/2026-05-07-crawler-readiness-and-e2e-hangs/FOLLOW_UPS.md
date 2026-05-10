# Follow-ups — 2026-05-07 Crawler Readiness & E2E Hangs

## Open warnings from `npm run test:hang-check`
1. **`tests/ui/e2e/art-playground-resize.puppeteer.e2e.test.js`** — add an explicit per-test timeout (e.g. `30000`) for the puppeteer-driven test. Currently relies on suite-level default but heuristic flagged it because the timeout literal is missing in the local file.
2. **`tests/deprecated-ui/e2e-features/geography-crawl/startup-and-telemetry.test.js`** — wrap spawned process in `afterAll`/`finally`. Low priority: file is excluded from all live suites.

## Optional analyzer enhancements
- Add a rule for `setTimeout(...)` calls without `unref()` in test setup blocks where ms > 5000.
- Add a rule for `EventEmitter.on(...)` listeners in long-running fixtures without matching `removeListener`/`removeAllListeners` in teardown.
- Wire `npm run test:hang-check` into a CI gate (currently only locally invoked).
- Per-file allowlist support (`// hang-analyzer: ignore <rule>`) for unavoidable patterns.

## Crawler agent ergonomics
- Add `--list --json` to the npm-script alias `crawl:list` so agents can call `npm run crawl:list -- --json` directly.
- Consider a `dry-run` profile category that also calls `crawl-remote.js status --host 127.0.0.1:1` to fail fast — useful for offline validation.
