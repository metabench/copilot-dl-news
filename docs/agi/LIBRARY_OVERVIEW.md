# Library Overview for AGI Enablement (Draft)

## System Snapshot
- **Core Mission**: Aggregate, normalize, and surface news-location intelligence (gazetteers, hubs, crawlers) with modular services housed under `/src`.
- **Primary Layers**:
  1. **Ingress**: Crawlers, scrapers, and background tasks orchestrated via configs in `/config` and scripts under `/scripts`.
  2. **Processing**: Domain logic in `/src/modules`, `/src/services`, and `/src/utils`, with heavy reliance on shared helpers.
  3. **Persistence**: Adapter-based DB access under `/src/db`, enforcing no direct driver usage outside adapters (per AGENTS.md).
  4. **Delivery/UI**: Legacy `deprecated-ui-root/`, `public/`, and associated APIs documented in `API_SERVER_ARCHITECTURE.md`.

## Key Artifacts to Track
- **Configurations**: `config/crawl-runner.json`, priority configs, and schema definitions guiding autonomous crawls.
- **Data Assets**: `data/` tree containing NDJSON manifests and cache snapshots; informs storage contracts for adapters.
- **Tooling**: `tools/dev/js-scan.js`, `js-edit.js`, `md-scan.js` – lifeblood for automated reasoning.

## Hotspots for Static Analysis
- **Crawl Pipelines**: `crawl.js` and `crawl.js.config.json` define entry points; need call-graph visibility to avoid regressions.
- **Adapters**: `/src/db/**` must stay coherent with migrations documented under `docs/database/` – monitor for schema drift.
- **Long-Running Plans**: Gap 4 (plans) touches multiple files (CLI + tmp). Static checks should trace feature flags and plan serialization logic.

## Module Summaries (2025-11-16)

### Crawler & Planning Stack
- **Location**: `crawl.js`, `src/crawler/`, `src/orchestration/`, configs under `config/`.
- **What It Does**: Orchestrates adaptive crawling, hub discovery, budget allocation, and milestone tracking (e.g., `IntelligentPlanningFacade`, `BudgetAllocator`, `MilestoneTracker`).
- **Key Docs**: `ARCHITECTURE_CRAWLS_VS_BACKGROUND_TASKS.md`, `HIERARCHICAL_PLANNING_INTEGRATION.md`, `HUB_EXTENSIBILITY_IMPLEMENTATION_PLAN.md`.
- **Dependencies**: Relies on planner kernel (`src/planner`), queue/database adapters, and telemetry logging under `CrawlerTelemetry.js`.
- **AGI Hooks**: Capture `js-scan --deps-of src/crawler/IntelligentPlanningFacade.js` outputs to map decision pipelines; monitor configs for plan serialization changes (Gap 4).
- **Recommended Commands**: `node tools/dev/js-scan.js --dir src/crawler --search IntelligentPlanningFacade --view terse --fields location,name,selector,hash`; `node tools/dev/js-scan.js --ripple-analysis src/crawler/CrawlOperations.js --json`.

### Planner Kernel & Microprolog
- **Location**: `src/planner/` (PlannerHost, plugins, microprolog interpreter).
- **What It Does**: Hosts rule-based planning language used by crawler stack to express strategies and constraints.
- **Key Docs**: `PLANNING_SYSTEM_ANALYSIS.md`, `PLANNING_SYSTEM_CONSOLIDATION_TODO.md`, `HIERARCHICAL_PLANNING_INTEGRATION.md`.
- **Dependencies**: Consumes knowledge from `src/crawler/planner/` data, interfaces with database adapters for state, and exposes plugin registration points.
- **AGI Hooks**: Run `js-scan --what-calls PlannerHost` to understand plugin usage; proposed knowledge-graph tool should treat planner predicates as first-class nodes.
- **Recommended Commands**: `node tools/dev/js-scan.js --dir src/planner --outline --view terse`; `node tools/dev/js-scan.js --what-calls PlannerHost --json`.

### Services & Gap Analysis Layer
- **Location**: `src/services/` plus shared helpers.
- **What It Does**: Computes gap metrics (country/city/topic) and drives reporting (`HubGapAnalyzerBase`, `NewsWebsiteService`, `NewsWebsiteStatsCache`).
- **Key Docs**: `HUB_EXTENSIBILITY_REVIEW.md`, `COUNTRY_HUB_BEHAVIORAL_PROFILE_ANALYSIS.md`, `NEWS_WEBSITES_STATS_CACHE.md`.
- **Dependencies**: Pulls data from adapters (`CoverageDatabase`, `PlannerDatabase`) and exposes results to API/UI layers.
- **AGI Hooks**: Use `js-scan --what-imports src/services/HubGapAnalyzerBase.js` to ensure downstream analyzers stay synchronized; highlight any N+1 queries for database research backlog.
- **Recommended Commands**: `node tools/dev/js-scan.js --dir src/services --what-imports src/services/HubGapAnalyzerBase.js --json`; `node tools/dev/js-scan.js --dir src/services --search GapAnalyzer --view summary`.

### Database Layer & Adapters
- **Location**: `src/db/` (CoverageDatabase, QueueDatabase, PlannerDatabase, migrations).
- **What It Does**: Encapsulates persistence for crawls, queues, coverage stats, and planner artifacts, enforcing adapter boundaries.
- **Key Docs**: `docs/database/` suite (e.g., `DATABASE_MIGRATION_GUIDE_FOR_AGENTS.md`, `DATABASE_SCHEMA_ERD.md`).
- **Dependencies**: Called by services, crawler stack, planner host; migrations align with `migration/` scripts and `DB_QUERIES_DURING_CRAWLS.md`.
- **AGI Hooks**: Track `js-scan --what-calls CoverageDatabase` results before schema changes; proposed knowledge graph should flag any module bypassing adapters.
- **Recommended Commands**: `node tools/dev/js-scan.js --what-imports src/db/CoverageDatabase.js --json`; `node tools/dev/js-scan.js --deps-of src/db/index.js --json`; `node tools/dev/js-scan.js --ripple-analysis src/db/QueueDatabase.js --json`.

### API & Delivery Surface
- **Location**: `src/api/`, `src/server/`, `src/ui/`, `deprecated-ui-root/`.
- **What It Does**: Serves HTTP routes, assembles OpenAPI contracts, and renders UI artefacts for hub status/analysis.
- **Key Docs**: `API_SERVER_ARCHITECTURE.md`, `SERVICE_LAYER_ARCHITECTURE.md`, `UI_INTEGRATION_COMPLETE.md`.
- **Dependencies**: Calls services for data, uses cache helpers (`src/cache.js`), and references configuration in `config/`.
- **AGI Hooks**: Before editing routes, run `js-scan --what-imports src/api/routes` to enumerate consumers; ensure any documentation updates sync with `/docs/API_ENDPOINT_REFERENCE.md`.
- **Recommended Commands**: `node tools/dev/js-scan.js --dir src/api --search route --include-path routes --view terse`; `node tools/dev/js-scan.js --what-calls loadRoutes --json`.

### Analysis, Background, and Tooling Modules
- **Location**: `src/analysis/`, `src/background/`, `src/tools/`, `src/utils/`.
- **What They Do**: Handle offline analytics, background job runners, shared utilities, and developer tooling hooks (e.g., `analysis/analyzers`, `background/tasks`).
- **Key Docs**: `ANALYSIS_AS_BACKGROUND_TASK.md`, `BACKGROUND_TASKS_COMPLETION.md`, `ANALYSIS_PAGE_ISSUES.md`, `CLI_TOOL_REFACTORING_SUMMARY.md`.
- **Dependencies**: Consume crawler outputs, touch database adapters, and may integrate with `tools/dev` scripts.
- **AGI Hooks**: Favor `js-scan --ripple-analysis` before refactoring utils; proposed `scan-metrics` tool should compute fan-in from `/src/utils` to prevent accidental coupling.
- **Recommended Commands**: `node tools/dev/js-scan.js --dir src/analysis --find-pattern "*Analyzer" --json`; `node tools/dev/js-scan.js --ripple-analysis src/background/JobRunner.js --json`; `node tools/dev/js-scan.js --dir src/utils --ripple-analysis src/utils/index.js --json`.

## Integration with AGI Docs
- When agents investigate a module (e.g., `src/modules/hub/`), they should:
  1. Capture `js-scan` outputs.
  2. Summarize findings in `LIBRARY_OVERVIEW.md` (this file) using subsections per module/service when depth is needed.
  3. Reference supporting docs (e.g., `ARCHITECTURE_REFACTORING_NEWS_WEBSITES.md`).

## Next Steps
- Maintain the module summaries above as source-of-truth, expanding with owners/metrics when data becomes available.
- Introduce tables linking modules ↔ relevant docs ↔ owners to give AGI agents immediate handoffs.
- Capture future scan outputs (graph slices, risk metrics) under this file or linked appendices once tooling proposals materialize.
