# Puppeteer Scenario Suites (Single Browser, Many Scenarios)

This repo includes a lightweight runner that executes multiple UI scenarios inside a *single* Puppeteer browser session.

It is designed for **fast, low-flake UI verification** without paying Puppeteer startup cost per test, and without pulling everything into Jest E2E immediately.

## Choose the right tool

Use this ladder (fast → slow):

1. **Node check scripts** (`src/**/checks/*.check.js`)
   - Best when you can validate via SSR output or server-only behavior.
   - Exits cleanly; ideal for tight iteration.

2. **One-shot browser capture** (`tools/dev/ui-console-capture.js`)
   - Best when you need to check *one* URL and want console/network visibility.
   - Great for “works locally but broken in browser” debugging.
   - See [Puppeteer UI Workflow Guide](PUPPETEER_UI_WORKFLOW.md).

3. **Scenario suites** (`tools/dev/ui-scenario-suite.js`)
   - Best when you want **2–20 focused scenarios** against a deterministic fixture.
   - Runs many scenarios per browser session; auto-saves artifacts on failure.

4. **Jest E2E** (`npm run test:by-path ...`)
   - Best for CI-grade regression, cross-feature coverage, and standardized reporting.

## Running a suite

Basic run:

```bash
node tools/dev/ui-scenario-suite.js --suite=scripts/ui/scenarios/url-filter-toggle.suite.js
```

Minimal “pure jsgui3 control” suite (SSR + activation + clicks, no app-specific DB):

```bash
node tools/dev/ui-scenario-suite.js --suite=scripts/ui/scenarios/control-harness-counter.suite.js
```

Run a single scenario (by id or name, case-insensitive):

```bash
node tools/dev/ui-scenario-suite.js --suite=scripts/ui/scenarios/url-filter-toggle.suite.js --scenario=001
```

Helpful flags:

- `--timeout=60000` — per-scenario timeout (default 15000ms)
- `--headful` — debug with a visible browser
- `--quiet` — reduce happy-path output
- `--print-logs-on-failure` — dump captured console/errors/network when a scenario fails
- `--artifacts-dir=tmp/ui-scenario-suite` — where screenshots/HTML/logs are written
- `--json` — emit machine-readable run summary

## Artifacts on failure

When a scenario fails, the runner attempts to write:

- `<scenarioKey>.png` — full-page screenshot
- `<scenarioKey>.html` — DOM snapshot (`page.content()`)
- `<scenarioKey>.logs.json` — captured `console`, `pageerror`, and failed/4xx+ network entries

Default output location: `tmp/ui-scenario-suite/`.

## Authoring a suite

A suite is a JS module that exports:

- `startServer({ artifactsDir })` *(optional)* — returns `{ baseUrl, shutdown() }`
- `baseUrl` *(optional if startServer exists)*
- `scenarios: [...]` *(required)*

Example skeleton:

```js
module.exports = {
  async startServer() {
    return {
      baseUrl: 'http://127.0.0.1:3000',
      async shutdown() {}
    };
  },
  scenarios: [
    {
      id: '001',
      name: 'Smoke: page renders',
      url: '/urls',
      waitUntil: 'load',
      waitForSelector: 'main',
      async run({ page, baseUrl, artifactsDir }) {},
      async assert({ page, logs, errors, network }) {}
    }
  ]
};
```

### Scenario fields

- `id` *(recommended)*: stable string id like `"001"`
- `name` *(recommended)*: human-friendly description
- `url` *(optional)*: relative path (joined onto `baseUrl`) or absolute URL
- `waitUntil` *(optional)*: passed to `page.goto()` (defaults to `"load"`)
- `waitForSelector` *(optional)*: basic readiness gate before running
- `before({ page, baseUrl, artifactsDir })` *(optional)*: setup step
- `run({ page, baseUrl, artifactsDir })` *(optional)*: actions
- `assert({ page, baseUrl, artifactsDir, logs, errors, network })` *(optional)*: assertions

## Preventing flake: readiness gates for jsgui3 activation

For jsgui3 pages, `DOMContentLoaded`/`load` can happen before controls are interactive.

Preferred pattern:

- In your UI client bundle, expose deterministic “activation completed” signals (e.g., `window.__COPILOT_REGISTERED_CONTROLS__`).
- In scenarios/tests, `waitForFunction()` those signals before interacting.

This repo’s canonical snippet lives in [Testing Quick Reference for AI Agents](../TESTING_QUICK_REFERENCE.md) under “Puppeteer E2E: Wait for Client Activation (jsgui3)”.

When you want to stay fast, use the **fast-path + hydration retry** pattern:

- Try the interaction immediately.
- If it fails (timeout/no response), wait for activation signals and retry once.

See an end-to-end example in `scripts/ui/scenarios/url-filter-toggle.suite.js`.

## Deterministic fixtures: server + DB (recommended)

For reliable UI runs:

- Start the server in `startServer()` on a random port (`listen(0, ...)`).
- Use a throwaway SQLite DB file seeded with minimal rows.
- Ensure `shutdown()` closes the server and deletes the temp DB file.

This avoids:

- depending on a developer’s local DB state
- live network
- hidden background jobs that make tests nondeterministic

Reference implementation: `scripts/ui/scenarios/url-filter-toggle.suite.js`.
