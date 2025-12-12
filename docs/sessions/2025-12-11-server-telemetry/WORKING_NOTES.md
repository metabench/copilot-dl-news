# Working Notes – Standard server telemetry + z-server ingestion

- 2025-12-11 — Session created via CLI.

## Repo Recon

### z-server observations

- z-server spawns servers as child `node <filePath>` processes and forwards raw stdout/stderr chunks over IPC as `{ filePath, type: 'stdout'|'stderr', data }`.
- It can only “see” live log output for servers it spawns.
- It can detect already-running servers via ports/process listing, but it cannot attach to their stdout/stderr.

Implication: to get reliable *runtime* telemetry from “any running server”, we need at least one of:
- a standard HTTP status endpoint z-server can poll, or
- a standard file-based log sink z-server can tail, or
- a push channel (SSE/WebSocket) exposed by the server.

### Existing discovery metadata

- `tools/dev/js-server-scan.js` already extracts `@server`, `@description`, `@ui true`, and `@port` from server source comments.

### Existing check-mode infrastructure

- There is a shared `--check` server startup utility at `src/ui/server/utils/serverStartupCheck.js` used by some servers.
