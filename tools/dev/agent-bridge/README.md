# agent-bridge — MERGED into tools/dev-bridge

This bridge was consolidated into **`tools/dev-bridge/`** (v4) on 2026-07-11.
Use that one; see `tools/dev-bridge/README.md` for the protocol and actions.

What moved where:

| here (old)                      | dev-bridge (canonical)              |
|---------------------------------|-------------------------------------|
| `{ "action", "args" }` → `outbox/<id>.json` | `{ "action", "params" }` → `outbox/<name>.result.json` |
| `start-app` / `stop-app`        | `start-electron` / `stop-electron`  |
| `app-status`                    | `status` + `http` probe             |
| `screenshot-app`                | `ui-screenshot`                     |
| `check` (checks/*.check.js)     | `run-node` (any repo script)        |
| `jest`                          | `run-tests`                         |
| `exec` (gated)                  | (none — by design)                  |
| checks/*.check.js               | `tools/dev-bridge/checks/*.js`      |

`bridge-runner.js` and `start-agent-bridge.cmd` remain as forwarding shims so
old muscle memory still works. The headless-sandbox Electron testing recipe
also lives in `tools/dev-bridge/README.md` now.
