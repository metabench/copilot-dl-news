# dev-bridge — file-RPC between the Cowork sandbox and this machine

The single bridge for letting an AI agent (with repo file access but no shell
on this machine) start, stop, drive, and test things here — including the
Electron crawler app. Zero dependencies, no network listener: JSON files in
`inbox/` are the entire protocol.

> `tools/dev/agent-bridge/` was a second, independently-built bridge
> (2026-07-11); it has been merged into this one (v4) and its entry points
> now forward here. Use this bridge.

## Start it (once, on this machine)

```
tools\dev-bridge\start-dev-bridge.cmd     (supervisor loop: auto-restarts on
                                           exit/crash/code update; Ctrl+C stops)
```

## Protocol

Agent writes `tools/dev-bridge/inbox/<name>.json`:

```json
{ "action": "start-electron", "params": { "port": 3170 } }
```

Result appears as `tools/dev-bridge/outbox/<name>.result.json`. App output
streams to `logs/`, managed-process registry and screenshots live in `state/`.
Liveness: fresh `state/hb-*.json` heartbeat every 30s (new files, because the
shared mount is unreliable about appends).

## Actions (v4)

| action | params | effect |
|---|---|---|
| `ping` | – | liveness, version, pid |
| `restart-bridge` | – | reload with current code (supervisor respawns) |
| `status` | – | managed-process registry (live pids) |
| `start-ui` / `stop-ui` / `restart-ui` | `port=3000, dbPath, workerMode` | unified web UI server |
| `start-electron` / `stop-electron` | `port=3170, app='crawl-status', dbPath, allowMultiJobs=true, readyTimeoutMs=45000` | desktop app; waits for HTTP, reports `httpOk` |
| `ui-screenshot` | `port=3000, app, delayMs` | PNG of the real UI via a second Electron instance (isolated `--user-data-dir`; capture retries until painted) → `state/ui-shots/` |
| `start-campaign` / `stop-campaign` / `campaign-status` | `durationMs, urls, maxDownloads, legBudgetMs` | long crawl campaigns (managed) |
| `run-tests` | `testPath` | bounded jest run (repo-confined) |
| `run-node` | `scriptPath, args, timeoutMs` | any repo-checked-in node script (repo-confined) |
| `http` | `method, url, body` | localhost-only HTTP relay (drive local UIs/APIs) |
| `kill-pid` | `pid` | kill ONLY processes whose command line is under the repos workspace |
| `tail-log` | `name, lines` | tail a managed log |

## Diagnostic scripts (run via `run-node`)

- `tools/dev-bridge/checks/db-probe.js` — SQLite health of data/news.db with
  exact error codes; clears a stale `-shm`/empty `-wal` when unheld.
- `tools/dev-bridge/checks/list-node-procs.js` — node/electron processes with
  command lines + start times (zombie hunting).
- `tools/dev-bridge/checks/kill-zombie-server.js <pid>` — kill explicit pid,
  clean stale WAL sidecars, verify DB opens.
- `tools/dev-bridge/checks/start-app-debug.js [port]` — launch the Electron
  app NON-detached for ~40s capturing all output (silent-failure debugging).

These earned their place in a real incident (2026-07-11): a unifiedApp server
from an earlier session held a stale `news.db-shm` mapping and every new
connection failed with `SQLITE_IOERR_SHORT_READ` until the zombie was found
and killed — diagnosed and fixed entirely through the bridge.

## Electron testing without this machine

The app is also testable headlessly on Linux (agent sandbox / CI) via
`src/ui/electron/unifiedApp/checks/crawlDisplay.electron.check.js` — real
BrowserWindow on the real crawl-status page against a self-contained stub
server, DOM assertions plus screenshot, auto-wrapped in `xvfb-run`.

Verified sandbox recipe (Linux, no root): `npm i electron@40`; extract
`libgtk-3-0` + `libxdamage1` from .debs (apt-get download + dpkg -x) and set
`LD_LIBRARY_PATH`; vendor the jsgui3-html chain (jsgui3-html, jsgui3-gfx-core,
lang-tools, lang-mini, fnl, oext; npm: obext, url-parse) into a real
`node_modules` (Electron ignores NODE_PATH); run the check with
`ELECTRON_BIN` set. Two traps: Electron's main process ignores NODE_PATH, and
mount reads of freshly written files can be stale — agents should use direct
host-file tools for the inbox/outbox protocol.

## Security

- Whitelisted actions only; scripts/tests must live inside the repo;
  `kill-pid` refuses anything outside the repos workspace; `http` is
  localhost-only. No arbitrary shell action exists.
- Anyone with write access to the repo folder can drive the runner — that is
  the trust boundary.
- `inbox/`, `outbox/`, `logs/`, `state/` are runtime data (gitignored).
