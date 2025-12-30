# Working Notes – Single UI app cohesion roadmap

- 2025-12-30 — Session created via CLI. Add incremental notes here.
- 2025-12-30 — Repo scan: multiple UI entrypoints exist.
	- Mature SSR + hydration app: `src/ui/server/dataExplorerServer.js` (theme service, navigation, SSE, client bundle).
	- Two “root hub” experiments: `src/ui/server/opsHub/server.js` (launcher) and `src/ui/server/unifiedApp/server.js` (SPA-like shell). Both default to port 3000.
	- Many standalone dashboards exporting `app` (mountable): rateLimitDashboard/webhookDashboard/pluginDashboard/crawlObserver/crawlerMonitor/queryTelemetry/templateTeacher/etc.

- 2025-12-30 — Requirement clarified: keep existing servers and UI apps (no retirements) while building the unified UI.
	- Proposed strategy: “app-as-module, server-as-runner”.
	- Extract mountable routers + SSR views/controls so the unified app can mount them, and legacy servers can keep running by mounting the same router at `/`.
	- Use the unified DB injection pattern from `src/db/dbAccess.js` (middleware + `getDbRW`) to avoid dashboards opening their own sqlite connections.

- 2025-12-30 — Template Teacher modularisation pass:
	- Updated `src/ui/server/templateTeacher/server.js` to avoid auto-starting when imported (gated startup under `require.main === module`).
	- Added `createTemplateTeacherRouter({ dbPath, getDbHandle, getDbRW })` for unified mounting.
	- Switched DB open/injection logic to `resolveBetterSqliteHandle(...)` and added `--check` support via `wrapServerForCheck(...)`.
	- Added minimal `--port <n>` parsing to align with `handleStartupCheck` conventions.

- 2025-12-30 — Crawl Observer modularisation pass:
	- Updated `src/ui/server/crawlObserver/server.js` to support injected DB handles via `resolveBetterSqliteHandle(...)` and export `createCrawlObserverRouter({ dbPath, getDbHandle, getDbRW })`.
	- Added `--check` support via `wrapServerForCheck(...)` + `--port` override parsing.
	- Fixed root page rendering crash under current `jsgui3-html` by changing `TaskListControl` to use `tagName:` (instead of legacy `el:` string).
	- Validation: `node src/ui/server/crawlObserver/server.js --check` → exit 0.

- 2025-12-30 — Planning deliverables + “Endurance Brain” agent:
	- Added planning docs to this session:
		- `GOALS_REVIEW.md`
		- `UI_COHESION_IMPLEMENTATION_PLAN.md`
		- `DASHBOARD_MODULARIZATION_STANDARD.md`
		- `VALIDATION_MATRIX.md`
		- `NEXT_AGENT_BRIEFING.md`
		- `NEXT_AGENT_PROMPT.md`
	- Added durable workflow doc: `docs/agents/endurance-brain-workflow.md`.
	- Added reference doc with templates + anti-stall rules: `docs/agents/endurance-brain-reference.md`.
	- Added new agent file: `.github/agents/🔥 Endurance Brain 🔥.agent.md`.
	- Registered both in `.github/agents/index.json` and linked the new docs from `INDEX.md`.

- 2025-12-30 — Validation note:
	- `npm run diagram:check` can take a while (builds `diagram-atlas.check.html`). File generation confirmed via updated timestamp.
