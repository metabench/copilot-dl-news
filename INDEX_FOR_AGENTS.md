# INDEX_FOR_AGENTS.md — Complete Documentation Index

**Generated**: October 25, 2025
**Purpose**: Complete index of all documentation for AI agents and developers.
**See**: `AGENTS.md` for usage guidance and workflow patterns.

## 📋 Quick Navigation

- [Service Layer & Code Organization](#service-layer--code-organization)
- [CLI Tools & Agentic Workflows](#cli-tools--agentic-workflows)
- [Crawls (Foreground System)](#crawls-foreground-system)
- [Background Tasks (Background System)](#background-tasks-background-system)
- [Database](#database)
- [UI Development](#ui-development)
- [Language Tools & Utilities](#language-tools--utilities)
- [Testing & Debugging](#testing--debugging)
- [Documentation & Maintenance](#documentation--maintenance)
- [Operations & Workflows](#operations--workflows)
- [System Components & Architecture](#system-components--architecture)
- [Advanced Planning](#advanced-planning)
- [Implementation & Historical Notes](#implementation--historical-notes)

---

## Service Layer & Code Organization
- 🔍 Service layer guide → `docs/SERVICE_LAYER_GUIDE.md` ⭐ **START HERE for services**
- 📐 Service extraction patterns → `SERVICE_LAYER_ARCHITECTURE.md`
- 🛠️ News website service refactor → `docs/ARCHITECTURE_REFACTORING_NEWS_WEBSITES.md`
- 📊 Performance analysis → `ARCHITECTURE_ANALYSIS_AND_IMPROVEMENTS.md`
- 🌐 API endpoint reference → `docs/API_ENDPOINT_REFERENCE.md` ⭐ **Complete API docs**

## CLI Tools & Agentic Workflows
- 🛠️ **CLI Tools Overview** → AGENTS.md "CLI Tools & Commands" section ⭐ **START HERE for automation**
- 🤖 **Agentic Workflows** → AGENTS.md "Agentic CLI Workflows" section ⭐ **Multi-step automation patterns**
- 📚 **Grok's Agentic Workflows Guide** → `docs/GUIDE_TO_AGENTIC_WORKFLOWS_BY_GROK.md` ⭐ **Comprehensive framework for autonomous task execution**
- 🔧 **Database Tools** → `tools/db-schema.js`, `tools/db-query.js` ⭐ **Database inspection without dialogs**
- 📊 **Analysis Tools** → `tools/intelligent-crawl.js` ⭐ **Rapid crawl analysis**
- 🧹 **Data Correction** → `tools/corrections/` ⭐ **Safe data manipulation**
- 📈 **Performance Tools** → `tools/benchmarks/` ⭐ **Compression and performance testing**
- 🔍 **Debug Tools** → `tools/debug/` ⭐ **Child process debugging**

## Crawls (Foreground System)
- 🕷️ Crawl basics → `ARCHITECTURE_CRAWLS_VS_BACKGROUND_TASKS.md` (Section 1)
- 🔗 Queues are internal → `docs/ARCHITECTURE_QUEUES_ARE_INTERNAL.md` ⭐ **Queues vs crawls terminology**
- 🧠 Hierarchical planning → `docs/HIERARCHICAL_PLANNING_INTEGRATION.md` ⭐ **Multi-level strategic planning**
- 🚀 Intelligent crawl startup → `docs/INTELLIGENT_CRAWL_OUTPUT_LIMITING.md` ⭐ **Rapid iteration workflow**
- 🗺️ Place hub hierarchy → `docs/PLACE_HUB_HIERARCHY.md` ⭐ **Continent/Country/Region/City taxonomy**
- � Pattern learning & DSPLs → `docs/PATTERN_LEARNING_AND_DSPLS.md` ⭐ **Auto-learn URL patterns from data**
- �🌍 Geography crawl → `GEOGRAPHY_CRAWL_TYPE.md`, `GEOGRAPHY_E2E_TEST.md`
- 🗺️ Gazetteer breadth-first → `GAZETTEER_BREADTH_FIRST_IMPLEMENTATION.md`
- ⚙️ Concurrency model → `docs/CONCURRENCY_IMPLEMENTATION_SUMMARY.md`
- 🧪 E2E test implementation → `docs/GEOGRAPHY_E2E_IMPLEMENTATION_SUMMARY.md`
- 📊 Geography flowchart UI → `docs/GEOGRAPHY_FLOWCHART_IMPLEMENTATION.md`
- 🎯 Country hub behavioral profile → `docs/COUNTRY_HUB_BEHAVIORAL_PROFILE_ANALYSIS.md` ⭐ **Goal-driven crawling behavior**
- 🧠 Intelligent crawl enhancements → `docs/INTELLIGENT_CRAWL_ENHANCEMENTS_SUMMARY.md` ⭐ **Advanced crawling capabilities**
- 🎯 Country hub discovery → `docs/COUNTRY_HUB_DISCOVERY_STRATEGIES.md` ⭐ **Strategic hub identification**
- 🧠 Intelligent crawl improvements → `docs/INTELLIGENT_CRAWL_IMPROVEMENTS.md` ⭐ **Advanced crawling capabilities**

## Background Tasks (Background System)
- ⚙️ Task basics → `ARCHITECTURE_CRAWLS_VS_BACKGROUND_TASKS.md` (Section 2)
- 🗜️ Compression → `BACKGROUND_TASKS_COMPLETION.md`, `COMPRESSION_IMPLEMENTATION_FULL.md`
- ⚡ Compression performance → `docs/COMPRESSION_PERFORMANCE_SUMMARY.md`
- 🔬 Analysis → `ANALYSIS_AS_BACKGROUND_TASK.md`
- 📈 Coverage API → `docs/COVERAGE_API_AND_JOB_DETAIL_IMPLEMENTATION.md`
- 🔗 Analysis background integration → `docs/ANALYSIS_BACKGROUND_TASK_INTEGRATION_SUMMARY.md` ⭐ **Analysis task implementation**

## Database
- 🔌 Getting DB handle → AGENTS.md "How to Get a Database Handle" section
- � Database ERD → `docs/DATABASE_SCHEMA_ERD.md` ⭐ **Visual schema reference**
- �📐 Normalization plan → `DATABASE_NORMALIZATION_PLAN.md` (1660 lines, read when implementing schema changes)
- 🚀 Migration infra → `PHASE_0_IMPLEMENTATION.md` (ready-to-run code)
- 🪣 Bucket storage plan → `docs/BUCKET_STORAGE_IMPLEMENTATION_PLAN.md`
- 🔍 Query patterns → `DATABASE_ACCESS_PATTERNS.md`
- 🚀 Query optimization case study → `DATABASE_ACCESS_PATTERNS.md` (Queues N+1 fix, Oct 2025)
- 🧰 Query module conventions → `src/db/sqlite/queries/README.md`
- 🔧 Correction tools → `tools/corrections/README.md` ⭐ **Data cleanup workflow**
- 🗄️ Deduplication guide → `docs/GAZETTEER_DEDUPLICATION_IMPLEMENTATION.md` ⭐ **Fix duplicates**
- 💾 Backup policy → AGENTS.md "Database Backup Policy" section ⭐ **Keep only one recent backup**
- 🚀 Migration quick reference → `docs/DATABASE_MIGRATION_QUICK_REFERENCE.md` ⭐ **Migration patterns and commands**
- 📋 Migration delivery summary → `docs/DATABASE_MIGRATION_DELIVERY_SUMMARY.md` ⭐ **Migration implementation status**
- 🏗️ Migration implementation → `docs/DATABASE_MIGRATION_IMPLEMENTATION_SUMMARY.md` ⭐ **Migration architecture details**
- 📋 Migration strategy → `docs/DATABASE_MIGRATION_STRATEGY.md` ⭐ **Migration planning and execution**
- 🔍 Schema issues status → `docs/DATABASE_SCHEMA_ISSUES_STATUS.md` ⭐ **Current schema status and fixes**
- 📊 Schema version 1 → `docs/DATABASE_SCHEMA_VERSION_1.md` ⭐ **Original schema design**

## UI Development
- ⚠️ **DEPRECATED**: UI code moved to `src/deprecated-ui/` (October 2025)
- ⚠️ **DO NOT TEST DEPRECATED UI**: Agents should not run tests on deprecated UI code. Use `deprecated-ui` test suite only when explicitly requested for reference.
- 📋 **New UI Planning**: `src/ui/README.md` - Simple data-focused interface
- 🎨 HTML composition → `deprecated-ui/express/public/views/` (reference only)
- 🧩 Component modules → `deprecated-ui/express/public/components/` (reference only)
- 📡 SSE integration → `deprecated-ui/express/routes/events.js` (reference only)
- 🔧 JS GUI3 patterns → `docs/JSGUI3_PATTERNS_ANALYSIS.md` ⭐ **UI component patterns and architecture**

## Language Tools & Utilities
- 🔧 Architectural patterns → `LANG_TOOLS_ARCHITECTURAL_PATTERNS.md`
- 🧠 Pattern catalog → `LANG_TOOLS_PATTERNS.md`
- 🗺️ Action plan → `LANG_TOOLS_ACTION_PLAN.md`
- ⏱️ Timeout tuning → `AGENTS_UPDATE_TIMEOUT_OPTIMIZATION.md`
- 🎯 Core workflow rules → `docs/agents/core-workflow-rules.md` ⭐ **Research limits and fast-path development**
- 🧪 Testing guidelines → `docs/agents/testing-guidelines.md` ⭐ **Complete testing patterns and rules**
- 🛠️ Kilo setup and workflows → `docs/KILO_SETUP_AND_WORKFLOWS.md` ⭐ **Advanced tooling setup**
- 🎯 Multi-lingual topics → `docs/MULTI_LINGUAL_TOPICS.md` ⭐ **Multi-language content processing**

## Testing & Debugging
- 🧪 Test review process → `docs/TESTING_REVIEW_AND_IMPROVEMENT_GUIDE.md` ⭐ **Systematic test fixing**
- 📊 Current test status → `docs/TESTING_STATUS.md` ⭐ **Live test state (max 200 lines)**
- 🧪 Test patterns → AGENTS.md "Testing Guidelines" section
- ⏱️ Timeout guards → `docs/TEST_TIMEOUT_GUARDS_IMPLEMENTATION.md` ⭐ **Prevent silent hangs**
- 🔧 Test fixes Oct 2025 → `docs/TEST_FIXES_2025-10-10.md` ⭐ **Recent fixes**
- � Async cleanup guide → `docs/TESTING_ASYNC_CLEANUP_GUIDE.md` ⭐ READ WHEN TESTS HANG
- �🐛 Performance debugging → `PERFORMANCE_INVESTIGATION_GUIDE.md`
- 🚨 Geography issues → `GEOGRAPHY_E2E_INVESTIGATION.md`, `GEOGRAPHY_CRAWL_CONSOLE_ERRORS.md`
- 📉 Analysis page issues → `docs/ANALYSIS_PAGE_ISSUES.md`
- 🔍 Child process debugging → `docs/DEBUGGING_CHILD_PROCESSES.md`
- 📈 Long-run E2E telemetry → `E2E_TEST_PROGRESS_LOGGING.md`
- 🧭 Specialized E2E suite → `SPECIALIZED_E2E_TESTING.md`
- 🧪 Specialized E2E feature suite → `tests/e2e-features/README.md`
- 🌍 Geography E2E testing -> `docs/GEOGRAPHY_E2E_TESTING.md`
- 🛠️ Debug scripts quickstart → `tools/debug/README.md`
- 🎯 Testing focused workflow → `docs/TESTING_FOCUSED_WORKFLOW.md` ⭐ **Targeted test development patterns**
- 🧪 Development E2E tests → `docs/DEVELOPMENT_E2E_TESTS.md` ⭐ **E2E testing patterns**
- 📊 Post-mortem false positives → `docs/POST_MORTEM_FALSE_POSITIVE_TEST_RESULTS.md` ⭐ **Test failure analysis**
- 🧪 Simple tools → `tests/SIMPLE_TOOLS_README.md` ⭐ **Fast test status queries**

## Documentation & Maintenance
- 📚 Documentation review → `DOCUMENTATION_REVIEW_AND_IMPROVEMENT_GUIDE.md` ⭐ WHEN REQUESTED
- 🧪 Testing review → `docs/TESTING_REVIEW_AND_IMPROVEMENT_GUIDE.md` ⭐ WHEN REQUESTED (integrates with doc review)
- 📋 Test timeout integration → `docs/documentation-review/2025-10-10-test-timeout-integration-summary.md` ⭐ **Complete**
- 🏁 Project overview → `README.md`
- 📝 AI-friendly docs → `AI_AGENT_DOCUMENTATION_GUIDE.md`
- 🔄 Documentation strategy → AGENTS.md "AI Agent Documentation Strategy" section
- 🎯 Improvement roadmap → `DOCUMENTATION_STRATEGY_ENHANCEMENT.md`
- 🤖 Agent instructions → `.github/instructions/GitHub Copilot.instructions.md`
- � Phase 6 self-improvement → `docs/documentation-review/2025-10-10-phase-6-self-improvement.md`
- �🗂️ Documentation review snapshot 2025-10-09 → `docs/documentation-review/2025-10-09-findings.md`, `docs/documentation-review/2025-10-09-missing-in-agents.md`, `docs/documentation-review/2025-10-09-needs-when-to-read.md`, `docs/documentation-review/2025-10-09-zero-crossrefs.md`
- 🗂️ Documentation review snapshot 2025-10-10 → `docs/documentation-review/2025-10-10-review-complete.md`, `docs/documentation-review/2025-10-10-missing-in-agents.md`, `docs/documentation-review/2025-10-10-needs-when-to-read.md`, `docs/documentation-review/2025-10-10-zero-crossrefs.md`
- 🗂️ Documentation review archive (2025-10-10) → `docs/documentation-review/2025-10-10/2025-10-09-missing-in-agents.md`, `docs/documentation-review/2025-10-10/2025-10-09-needs-when-to-read.md`, `docs/documentation-review/2025-10-10/2025-10-09-zero-crossrefs.md`
- 🔍 Post-mortem false positive tests → `docs/POST_MORTEM_FALSE_POSITIVE_TEST_RESULTS.md` ⭐ **Test failure analysis**
- 📚 Documentation migration → `docs/DOCUMENTATION_MIGRATION_SUMMARY.md` ⭐ **Documentation evolution**

## Operations & Workflows
- 📖 Operations guide → `docs/RUNBOOK.md`
- ⚙️ Configuration reference → `docs/CONFIGURATION_GUIDE.md` ⭐ **All env vars and config options**
- 🗺️ Project roadmap → `docs/ROADMAP.md` ⭐ **Current and future development plans**
- ⚡ Rapid feature mode → `docs/RAPID_FEATURE_MODE.md`
- ⚡ Rapid feature chatmode → `.github/chatmodes/Rapid Features.chatmode.md`
- 🧪 Server root verification → `docs/SERVER_ROOT_VERIFICATION.md`
- 🌐 Geography progress log → `docs/GEOGRAPHY_PROGRESS_IMPLEMENTATION.md`
- � Geography fixes summary → `GEOGRAPHY_CRAWL_FIXES_SUMMARY.md`
- �📊 News website stats cache → `NEWS_WEBSITES_STATS_CACHE.md`
- 🔬 Test performance results → `docs/TEST_PERFORMANCE_RESULTS.md`
- 📋 Database migration strategy → `docs/DATABASE_MIGRATION_STRATEGY.md` ⭐ **Migration planning and execution**
- 🔍 Database schema issues → `docs/DATABASE_SCHEMA_ISSUES_STATUS.md` ⭐ **Current schema status and fixes**
- 📊 Quick wins delivery → `docs/QUICK_WINS_DELIVERY_SUMMARY.md` ⭐ **Recent feature deliveries**
- 🎨 UI integration complete → `docs/UI_INTEGRATION_COMPLETE.md` ⭐ **UI system integration**
- 📋 Database migration strategy → `docs/DATABASE_MIGRATION_STRATEGY.md` ⭐ **Migration planning and execution**
- 🔍 Database schema issues → `docs/DATABASE_SCHEMA_ISSUES_STATUS.md` ⭐ **Current schema status and fixes**
- 📊 Compression tables migration → `docs/COMPRESSION_TABLES_MIGRATION.md` ⭐ **Compression infrastructure migration**

## System Components & Architecture
- 🧩 Component overview → `docs/COMPONENTS.md` ⭐ **System component relationships**
- 🚀 Enhanced features → `docs/ENHANCED_FEATURES.md` ⭐ **Crawler intelligence and priority system**
- 🔄 Architecture update log → `docs/ARCHITECTURE_UPDATE_CRAWLS_VS_TASKS.md`
- 📡 SSE shutdown design → `SSE_CLOSURE_ARCHITECTURE.md`
- 🏗️ Schema evolution → `docs/SCHEMA_EVOLUTION_DIAGRAMS.md` ⭐ **Database schema evolution patterns**
- 📐 Schema normalization → `docs/SCHEMA_NORMALIZATION_SUMMARY.md` ⭐ **Database normalization implementation**

## Advanced Planning
- 🤖 GOFAI planning → `GOFAI_ARCHITECTURE.md` ⭐ **Symbolic AI foundation**
- 🔮 Async planner → `ASYNC_PLANNER_PREVIEW.md`
- 🎯 Advanced suite → `ADVANCED_PLANNING_SUITE.md`
- 🔌 Integration design → `ADVANCED_PLANNING_INTEGRATION_DESIGN.md`
- 🧠 Hierarchical planning integration → `docs/HIERARCHICAL_PLANNING_INTEGRATION.md` ⭐ **IMPLEMENTED**
- 📊 Planning system analysis → `docs/PLANNING_SYSTEM_ANALYSIS.md` ⭐ **Planning architecture and patterns**
- 🎯 Planning consolidation → `docs/PLANNING_SYSTEM_CONSOLIDATION_TODO.md` ⭐ **Planning system improvements**

## Implementation & Historical Notes
- 🏙️ Cities crawl implementation → `docs/CITIES_IMPLEMENTATION_COMPLETE.md`
- 📈 Cities integration status → `docs/CITIES_INTEGRATION_STATUS.md`
- 📦 Database refactoring summary → `docs/DATABASE_REFACTORING_COMPLETE.md`
- 🧱 Service layer roadmap → `docs/PHASE_3_IMPLEMENTATION_GUIDE.md`
- � Future refactor vision → `docs/REFACTORING_PLAN.md`
- �🔄 Telemetry and progress complete → `docs/TELEMETRY_AND_PROGRESS_COMPLETE.md`
- 🎯 Specialized crawl concurrency → `docs/SPECIALIZED_CRAWL_CONCURRENCY.md`
- 📋 Phase 3 refactoring complete → `docs/PHASE_3_REFACTORING_COMPLETE.md`
- 📋 Phase 4 refactoring complete → `docs/PHASE_4_REFACTORING_COMPLETE.md`
- 📋 Phase 6 assessment → `docs/PHASE_6_ASSESSMENT.md`
- 🔧 Queues page optimization → `docs/QUEUES_PAGE_OPTIMIZATION.md` ⭐ **Performance improvements**
- 🛠️ Queues page lang tools → `docs/QUEUES_PAGE_LANG_TOOLS_IMPROVEMENTS.md` ⭐ **Language processing enhancements**
- 📋 Phase 1 implementation → `docs/PHASE_1_IMPLEMENTATION_COMPLETE.md` ⭐ **Initial implementation details**
- 📋 Phase 2 implementation → `docs/PHASE_2_IMPLEMENTATION_COMPLETE.md` ⭐ **Second phase completion**
- 📋 Phase 3 implementation → `docs/PHASE_3_IMPLEMENTATION_COMPLETE.md` ⭐ **Service layer implementation**
- 🔄 Phase 123 integration → `docs/PHASE_123_INTEGRATION_COMPLETE.md` ⭐ **Multi-phase integration status**
- 🔧 Queues page optimization → `docs/QUEUES_PAGE_OPTIMIZATION.md` ⭐ **Performance improvements**
- 🛠️ Queues page lang tools → `docs/QUEUES_PAGE_LANG_TOOLS_IMPROVEMENTS.md` ⭐ **Language processing enhancements**

---

## 📊 Documentation Statistics

**Total Documents**: 187
**Discoverability Rate**: 81% (151 indexed)
**When to Read Coverage**: 67%
**Timely Content**: 100%
**Focused Content**: 99%
**Code Examples**: 79%
**Visual Aids**: 43%

**Last Updated**: October 25, 2025
**Next Inventory**: Run `node tools/docs/generate-doc-inventory.js` to refresh