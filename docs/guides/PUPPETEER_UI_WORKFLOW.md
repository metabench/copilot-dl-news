# Puppeteer UI Workflow Guide

This guide describes how to use Puppeteer and the `ui-console-capture` tool to develop and debug UI applications in this repository.

If you want to run *multiple* interactions without re-launching Puppeteer, use the scenario suite runner instead:

- `tools/dev/ui-scenario-suite.js` (guide: `docs/guides/PUPPETEER_SCENARIO_SUITES.md`)

## The Problem

When developing UI servers (like `gazetteerInfoServer.js` or `dataExplorerServer.js`), errors often happen in the browser (client-side JavaScript). These errors are not visible in the Node.js terminal output.

## The Solution: `ui-console-capture`

We have a tool `tools/dev/ui-console-capture.js` that:
1. Optionally starts your server.
2. Launches a headless Chrome browser (Puppeteer).
3. Navigates to your URL.
4. Captures all `console.log`, `console.error`, and network failures.
5. Outputs them as JSON.
6. Cleans up (kills server and browser).

## Usage

### 1. Check a Running Server

If you already have the server running on port 3000:

```bash
node tools/dev/ui-console-capture.js --url="http://localhost:3000/search?q=test"
```

### 2. Start and Check (One-Shot)

To start the server, check it, and stop it (great for CI or quick checks):

```bash
node tools/dev/ui-console-capture.js --server="src/ui/server/gazetteerInfoServer.js" --url="http://localhost:3000"
```

### 3. Debugging "It works on my machine"

If a UI feature fails silently:
1. Run the capture tool.
2. Look for `type: "error"` or `type: "network-error"` in the JSON output.
3. Fix the issue (e.g., missing file, 404, syntax error in client JS).

## Integration with AI Agents

AI agents should use this tool to "see" the result of their UI changes.

**Pattern:**
1. Modify client-side code (`views/*.js`, `controls/*.js`).
2. Run `ui-console-capture` to verify no console errors occur.
3. If errors occur, read the JSON output to diagnose.

If you need multiple steps (click → wait → assert → repeat), prefer a scenario suite so the browser stays warm and failures produce screenshots/HTML snapshots.

## Example Output

```json
[
  {
    "type": "log",
    "text": "[Z-Server] App activated"
  },
  {
    "type": "network-error",
    "text": "Status 404 http://localhost:3000/favicon.ico"
  }
]
```
