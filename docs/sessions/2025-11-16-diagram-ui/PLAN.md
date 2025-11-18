# Plan: diagram-ui

**Lifecycle Phase**: Spark → Spec City kickoff (targeting Scaffold readiness)

**Objective**: Stand up a reusable Express + jsgui3 web server that visualizes repository code/database structures using data pulled from existing CLI tooling outputs.

**Done When**
- A new Express server endpoint serves a jsgui3-driven UI with multiple diagram views (file size shapes, feature-to-files mapping, DB/code structure overview).
- Diagrams consume live/refreshable data derived from CLI tool outputs (js-scan, md-scan, or supplemental scripts) rather than hard-coded samples.
- Helper scripts/utilities exist to gather the necessary metadata (file sizes, feature compositions) for the UI, with clear extension points.
- Documentation (session notes + relevant docs) explains how to run the new app and refresh its data.
- Basic verification (manual or automated check) confirms the server boots and renders diagrams without runtime errors.

**Change Set (initial)**
- `docs/sessions/2025-11-16-diagram-ui/*`
- New server source under `src/ui/server/diagramAtlasServer.js` (Express entry) plus supporting controls under `src/ui/controls/`
- Supporting utilities under `src/ui/server/services/diagramDataService.js` and a reusable CLI `tools/dev/diagram-data.js` that shells out to `js-scan`
- Documentation updates (README snippet, docs/index link if needed)

**Implementation Outline**
1. **CLI Aggregator (`tools/dev/diagram-data.js`)**
	- Wraps `js-scan --build-index`, `js-scan --deps-of`, and SQL migration scrapes to emit JSON describing files, features, and DB tables.
	- Supports `--sections code,features,db` filtering plus caching under `tmp/.ai-cache/diagram-data.json`.
2. **Data Service (`src/ui/server/services/diagramDataService.js`)**
	- Provides refresh + memoization helpers that invoke the CLI aggregator and normalize data for UI consumption.
3. **Express Server (`src/ui/server/diagramAtlasServer.js`)**
	- Routes: `/diagram-atlas` (HTML via jsgui3), `/api/diagram-data` (JSON), `/api/diagram-data/refresh` (POST to rebuild cache).
	- Shares middleware (compression, diagnostics) with existing data explorer patterns.
4. **jsgui3 Controls**
	- `DiagramCanvasControl`, `DiagramLegendControl`, `FeatureBreakdownControl` to render shape-size diagrams for files/features/DB tables.
	- Shapes sized by `areaScale = Math.sqrt(metric)` to keep layout stable.
5. **Client Enhancement**
	- Lightweight browser bundle to poll `/api/diagram-data` and animate transitions (reuse existing client bundler if practical).

**Risks / Assumptions**
- Need to respect Tier 1 tooling mandate (js-scan/js-edit) for discovery + edits.
- Diagram rendering in jsgui3 may require new helper components; ensure plugin compatibility.
- CLI outputs might be large—must cache or paginate to keep UI responsive.
- No direct DB connectivity specified; will rely on filesystem + CLI data.

**Tests / Verification**
- Manual check script (e.g., `node src/servers/diagram-ui/checks/render.check.js`) to render diagrams headlessly for sanity.
- Optionally, lightweight unit test covering data transformation utilities.

**Docs to Update**
- This session folder (PLAN, WORKING_NOTES, SESSION_SUMMARY)
- Possibly `docs/INDEX.md` or relevant workflow doc referencing the new tooling/diagrams
- README snippet for running the new server if not already covered
