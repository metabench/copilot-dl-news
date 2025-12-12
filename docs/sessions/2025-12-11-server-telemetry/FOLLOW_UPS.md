# Follow Ups – Standard server telemetry + z-server ingestion

- Implement shared helper module: `src/ui/server/utils/telemetry/` (create logger + Express middleware + status endpoint helper).
- Adopt telemetry helper in 2–3 servers first:
	- `src/ui/server/dataExplorerServer.js`
	- `src/ui/server/docsViewer/server.js`
	- `src/ui/server/diagramAtlasServer.js`
- Update z-server ingestion:
	- Parse JSONL events from stdout/stderr and render structured timeline.
	- Poll `GET /api/status` for detected-but-not-spawned servers.
- Decide whether to standardize file-based JSONL logs under `tmp/telemetry/` for external processes.
- Add a small check script that validates `/api/health` + `/api/status` for a server in `--check` mode.

- _Add actionable follow-ups here._
