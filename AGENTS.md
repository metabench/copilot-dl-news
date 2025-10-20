# AGENTS.md — AI Agent Workflow & Project Structure

## � AI Agent Documentation Strategy

**CRITICAL FOR AI AGENTS**: This repository has extensive documentation. Use this strategy to find and apply the right information efficiently.

### How AI Agents Should Use Documentation

1. **Start Here First**: Read this section BEFORE starting any work
2. **Use the Topic Index**: Jump to relevant docs using the index below
3. **Check "When to Read"**: Don't read everything, read what's needed for your task
4. **Cross-Reference**: Docs reference each other - follow the links
5. **Update as You Learn**: Add discoveries back to AGENTS.md for future agents

### Documentation Discovery Pattern

```javascript
// STEP 1: Identify your task category
const taskCategories = {
  'architecture': 'Understanding system design',
  'crawls': 'Working with web crawling',
  'background-tasks': 'Long-running processing',
  'database': 'Schema, queries, normalization',
  'ui': 'Frontend components and styling',
  'testing': 'Writing and running tests',
  'debugging': 'Investigating failures'
};

// STEP 2: Find relevant docs in Topic Index below

// STEP 3: Read "When to Read" guidance for each doc

// STEP 4: Read docs in priority order (⭐ first, then context-specific)

// STEP 5: Cross-reference as you encounter references
```

### Topic Index (Quick Navigation)

**Service Layer & Code Organization**
- 🔍 Service layer guide → `docs/SERVICE_LAYER_GUIDE.md` ⭐ **START HERE for services**
- 📐 Service extraction patterns → `SERVICE_LAYER_ARCHITECTURE.md`
- 🛠️ News website service refactor → `docs/ARCHITECTURE_REFACTORING_NEWS_WEBSITES.md`
- 📊 Performance analysis → `ARCHITECTURE_ANALYSIS_AND_IMPROVEMENTS.md`
- 🌐 API endpoint reference → `docs/API_ENDPOINT_REFERENCE.md` ⭐ **Complete API docs**

**Crawls (Foreground System)**
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

**Background Tasks (Background System)**
- ⚙️ Task basics → `ARCHITECTURE_CRAWLS_VS_BACKGROUND_TASKS.md` (Section 2)
- 🗜️ Compression → `BACKGROUND_TASKS_COMPLETION.md`, `COMPRESSION_IMPLEMENTATION_FULL.md`
- ⚡ Compression performance → `docs/COMPRESSION_PERFORMANCE_SUMMARY.md`
- 🔬 Analysis → `ANALYSIS_AS_BACKGROUND_TASK.md`
- 📈 Coverage API → `docs/COVERAGE_API_AND_JOB_DETAIL_IMPLEMENTATION.md`

**Database**
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

**UI Development**
- ⚠️ **DEPRECATED**: UI code moved to `src/deprecated-ui/` (October 2025)
- ⚠️ **DO NOT TEST DEPRECATED UI**: Agents should not run tests on deprecated UI code. Use `deprecated-ui` test suite only when explicitly requested for reference.
- 📋 **New UI Planning**: `src/ui/README.md` - Simple data-focused interface
- 🎨 HTML composition → `deprecated-ui/express/public/views/` (reference only)
- 🧩 Component modules → `deprecated-ui/express/public/components/` (reference only)
- 📡 SSE integration → `deprecated-ui/express/routes/events.js` (reference only)

**Language Tools & Utilities**
- 🔧 Architectural patterns → `LANG_TOOLS_ARCHITECTURAL_PATTERNS.md`
- 🧠 Pattern catalog → `LANG_TOOLS_PATTERNS.md`
- 🗺️ Action plan → `LANG_TOOLS_ACTION_PLAN.md`
- ⏱️ Timeout tuning → `AGENTS_UPDATE_TIMEOUT_OPTIMIZATION.md`

**Testing & Debugging**
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

**Documentation & Maintenance**
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

**Operations & Workflows**
- 📖 Operations guide → `docs/RUNBOOK.md`
- ⚙️ Configuration reference → `docs/CONFIGURATION_GUIDE.md`
- 🗺️ Project roadmap → `docs/ROADMAP.md`
- ⚡ Rapid feature mode → `docs/RAPID_FEATURE_MODE.md`
- ⚡ Rapid feature chatmode → `.github/chatmodes/Rapid Features.chatmode.md`
- 🧪 Server root verification → `docs/SERVER_ROOT_VERIFICATION.md`
- 🌐 Geography progress log → `docs/GEOGRAPHY_PROGRESS_IMPLEMENTATION.md`
- � Geography fixes summary → `GEOGRAPHY_CRAWL_FIXES_SUMMARY.md`
- �📊 News website stats cache → `NEWS_WEBSITES_STATS_CACHE.md`
- 🔬 Test performance results → `docs/TEST_PERFORMANCE_RESULTS.md`

**System Components & Architecture**
- 🧩 Component overview → `docs/COMPONENTS.md`
- 🚀 Enhanced features → `docs/ENHANCED_FEATURES.md` (crawler intelligence, priority system)
- 🔄 Architecture update log → `docs/ARCHITECTURE_UPDATE_CRAWLS_VS_TASKS.md`
- 📡 SSE shutdown design → `SSE_CLOSURE_ARCHITECTURE.md`

**Advanced Planning**
- 🤖 GOFAI planning → `GOFAI_ARCHITECTURE.md` ⭐ **Symbolic AI foundation**
- 🔮 Async planner → `ASYNC_PLANNER_PREVIEW.md`
- 🎯 Advanced suite → `ADVANCED_PLANNING_SUITE.md`
- 🔌 Integration design → `ADVANCED_PLANNING_INTEGRATION_DESIGN.md`
- 🧠 Hierarchical planning integration → `docs/HIERARCHICAL_PLANNING_INTEGRATION.md` ⭐ **IMPLEMENTED**

**Implementation & Historical Notes**
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

## Index of Operational Docs

| doc | purpose | when_to_use | tags | last_review |
|-----|---------|-------------|------|-------------|
| `command-rules` | Rules for executing commands without approval dialogs | When you need to run terminal commands | commands, powershell, tools | 2025-10-19 |
| `core-workflow-rules` | Fundamental execution patterns for autonomous agent work | When starting any coding task | workflow, agents, development | 2025-10-19 |
| `database-schema-evolution` | Comprehensive database normalization and compression | When planning database schema changes | database, schema, normalization | 2025-10-19 |
| `testing-guidelines` | Comprehensive testing patterns and workflows | When writing or fixing tests | testing, guidelines, development | 2025-10-19 |
| `tools-correction-scripts` | Safe data manipulation and correction workflows | When creating data manipulation tools | tools, correction, data-manipulation | 2025-10-19 |
| `test-log-migration` | Safe migration and management of test logs | When repository has many old logs | testing, logs, migration | 2025-10-19 |
| `database-schema-tools` | Quick database inspection without dialogs | When needing database structure info | database, schema, tools | 2025-10-19 |
| `tdd-guidelines` | Ensures reliable code changes through testing | When implementing new features | testing, tdd, development | 2025-10-19 |
| `intelligent-crawl-startup` | Rapid iteration on crawl startup output | When improving startup output | crawls, startup, analysis | 2025-10-19 |

### When to Read Which Docs

| If you need to... | Read this first | Then read (if needed) |
|------------------|----------------|----------------------|
| Understand system architecture | `ARCHITECTURE_CRAWLS_VS_BACKGROUND_TASKS.md` ⭐ | `SERVICE_LAYER_ARCHITECTURE.md` |
| Understand system components | `COMPONENTS.md` | `ENHANCED_FEATURES.md` |
| Work with services | `docs/SERVICE_LAYER_GUIDE.md` ⭐ | `SERVICE_LAYER_ARCHITECTURE.md` |
| Fix failing tests systematically | `docs/TESTING_REVIEW_AND_IMPROVEMENT_GUIDE.md` ⭐ | `docs/TESTING_STATUS.md` (current state) |
| Check current test status | `docs/TESTING_STATUS.md` ⭐ | `docs/TESTING_REVIEW_AND_IMPROVEMENT_GUIDE.md` |
| Implement API consumers | `docs/API_ENDPOINT_REFERENCE.md` ⭐ | `ARCHITECTURE_CRAWLS_VS_BACKGROUND_TASKS.md` |
| Understand place hub taxonomy | `docs/PLACE_HUB_HIERARCHY.md` ⭐ | `HIERARCHICAL_PLANNING_INTEGRATION.md` |
| Improve country hub discovery | `docs/PATTERN_LEARNING_AND_DSPLS.md` ⭐ | Generate DSPLs from existing data |
| Implement country hub behavioral profile | `docs/COUNTRY_HUB_BEHAVIORAL_PROFILE_ANALYSIS.md` ⭐ | `docs/INTELLIGENT_CRAWL_COUNTRY_HUB_ENHANCEMENT_PLAN.md` |
| Implement geography crawl | `GEOGRAPHY_CRAWL_TYPE.md` | `GAZETTEER_BREADTH_FIRST_IMPLEMENTATION.md` |
| Fix crawl not showing up | `ARCHITECTURE_CRAWLS_VS_BACKGROUND_TASKS.md` | `GEOGRAPHY_E2E_INVESTIGATION.md` |
| Add background task | `BACKGROUND_TASKS_COMPLETION.md` | `ANALYSIS_AS_BACKGROUND_TASK.md` (example) |
| Get database connection | AGENTS.md (in-file section) | `DATABASE_INITIALIZATION_ARCHITECTURE_ANALYSIS.md` |
| Understand enhanced DB adapter | AGENTS.md "Enhanced Database Adapter" section ⭐ | `docs/COVERAGE_API_AND_JOB_DETAIL_IMPLEMENTATION.md` |
| Perform database migration | `docs/DATABASE_MIGRATION_GUIDE_FOR_AGENTS.md` ⭐ | `docs/DATABASE_SCHEMA_ISSUES_STATUS.md` (current state) |
| Normalize database schema | `PHASE_0_IMPLEMENTATION.md` ⭐ | `DATABASE_NORMALIZATION_PLAN.md` (1660 lines) |
| Add compression | `COMPRESSION_IMPLEMENTATION_FULL.md` | `COMPRESSION_BUCKETS_ARCHITECTURE.md` |
| Write new tests | AGENTS.md "Testing Guidelines" ⭐ | `docs/TEST_TIMEOUT_GUARDS_IMPLEMENTATION.md` |
| Prevent test hangs | `docs/TEST_TIMEOUT_GUARDS_IMPLEMENTATION.md` ⭐ | `src/test-utils/timeoutGuards.js` |
| Debug test failures | AGENTS.md "Testing Guidelines" | `docs/TESTING_ASYNC_CLEANUP_GUIDE.md` ⭐ |
| Fix tests that hang | `docs/TESTING_ASYNC_CLEANUP_GUIDE.md` ⭐ | `docs/TEST_FIXES_2025-10-10.md` (examples) |
| Review recent test fixes | `docs/TEST_FIXES_2025-10-10.md` | AGENTS.md "Testing Guidelines" |
| Improve testing tools | `docs/POTENTIAL_TESTING_IMPROVEMENTS.md` ⭐ | Implement max 1 simple change per session |
| Debug child processes | `DEBUGGING_CHILD_PROCESSES.md` | Check SSE logs, add MILESTONE events |
| Build UI component | `CLIENT_MODULARIZATION_PLAN.md` | `HTML_COMPOSITION_ARCHITECTURE.md` |
| Investigate slow queries | `DATABASE_ACCESS_PATTERNS.md` | `PERFORMANCE_INVESTIGATION_GUIDE.md` |
| Review/improve documentation | `DOCUMENTATION_REVIEW_AND_IMPROVEMENT_GUIDE.md` ⭐ | `AI_AGENT_DOCUMENTATION_GUIDE.md` |
| Run operations tasks | `RUNBOOK.md` | Server CLI reference in AGENTS.md |
| Check project roadmap | `ROADMAP.md` | Review AGENTS.md current focus section |

**Analysis run linkage (October 2025)**: `analysis_runs` now includes `background_task_id` and `background_task_status`. New analysis runs started through `BackgroundTaskManager` **must** populate both fields so the `/analysis` list can render the “Task” column and deep-link to `/api/background-tasks/{id}`. Legacy rows may leave them `NULL`.

### Documentation Maintenance Rules

**When to Update AGENTS.md**:
1. ✅ You discover a new pattern that applies project-wide
2. ✅ You fix a bug that reveals a common mistake
3. ✅ You create a new architectural document
4. ✅ You find existing docs are outdated or misleading
5. ❌ Don't duplicate what's already in specialized docs

**When to Create New Docs**:
1. ✅ Architectural decisions that affect multiple systems
2. ✅ Implementation guides for complex features
3. ✅ Investigation results that reveal system behavior
4. ✅ Migration/upgrade procedures
5. ✅ **Formal review documents only** → `docs/review/` (systematic doc/test reviews, NOT routine work progress)
6. ❌ Don't create docs for simple one-off fixes or routine implementation progress

**Documentation Hierarchy**:
```
AGENTS.md (Central hub, patterns, quick reference)
    ↓
docs/COMMAND_EXECUTION_GUIDE.md (Specialized quick references)
docs/TESTING_QUICK_REFERENCE.md
docs/DATABASE_QUICK_REFERENCE.md
    ↓
ARCHITECTURE_*.md (System design, component interaction)
    ↓
BACKGROUND_TASKS_*.md, ANALYSIS_*.md, etc. (Feature-specific)
    ↓
docs/review/ (Formal review findings only - systematic doc/test reviews)
    ↓
Code comments (Implementation details)
```

**Review Document Purpose**: `docs/review/` is for **formal systematic reviews** (documentation audits, test suite analysis) where findings need to be preserved for future reference. NOT for routine implementation progress or task summaries.

### Anti-Patterns: Documentation Overload

❌ **Don't**: Read all 20+ docs before starting work (analysis paralysis)  
✅ **Do**: Use Topic Index to find the 1-3 relevant docs

❌ **Don't**: Create 50-page docs for every feature  
✅ **Do**: Create concise, focused docs with clear "When to Read" sections

❌ **Don't**: Duplicate information across multiple docs  
✅ **Do**: Cross-reference and maintain single source of truth

❌ **Don't**: Ignore existing docs and reinvent patterns  
✅ **Do**: Search for existing docs first, extend them if needed

---

## 🚨 CRITICAL COMMAND RULES 🚨

**Rules for executing commands without VS Code approval dialogs.** Use safe patterns and tools instead of complex PowerShell commands that trigger security prompts.

**When to consult**:
- When you need to run terminal commands
- When editing files or searching code
- When you encounter approval dialog blocks

**See**: `docs/agents/command-rules.md` for complete patterns and safe command examples.

---

## 🎯 Core Workflow Rules

**Fundamental execution patterns for autonomous agent work including research limits, fast-path development, test discipline, and quality validation.**

**When to consult**:
- When starting any coding task or feature implementation
- When deciding how much research to do before coding
- When running or validating tests during development
- When checking tool outputs for warnings/errors
- When implementing pre-implementation checklists

**See**: `docs/agents/core-workflow-rules.md` for complete execution principles, research budgets, fast-path patterns, and quality gates.

## Project Structure

**UI Styles**: `src/deprecated-ui/express/public/styles/*.scss` (DEPRECATED - reference only)  
**UI Components**: `src/deprecated-ui/public/**/*.js` (DEPRECATED - reference only)  
**Server**: `src/deprecated-ui/express/server.js` (DEPRECATED - reference only)  
**Database**: SQLite WAL mode via better-sqlite3 (`src/db/sqlite/ensureDb.js`)

### Crawls vs Background Tasks ⚠️ CRITICAL

**See**: `docs/ARCHITECTURE_CRAWLS_VS_BACKGROUND_TASKS.md` for complete details.  
**See**: `docs/ARCHITECTURE_QUEUES_ARE_INTERNAL.md` ⭐ **Queues are internal to crawls**

This project has **two distinct systems**:

1. **Crawls (Foreground)** - `src/crawler/`
   - **Purpose**: Fetch content from external websites (BBC, Wikidata, etc.)
   - **Manager**: `CrawlOrchestrationService` + `JobRegistry` + `JobEventHandlerService`
   - **Execution**: Node.js child processes (isolated)
   - **Duration**: Minutes to hours
   - **Tables**: `crawl_jobs`, `queue_events` (queues are internal to crawls)
   - **API**: `/api/crawl`, `/api/crawls/:id/*`
   - **UI**: `/crawls` page, "Resume Crawls" section
   - **Examples**: Crawl news site, fetch Wikidata countries, discover sitemaps

2. **Background Tasks (Background)** - `src/background/`
   - **Purpose**: Process data already in database (compress, analyze, export)
   - **Manager**: `BackgroundTaskManager` (in-process tasks)
   - **Execution**: Same process, optional worker pool
   - **Duration**: Hours to days
   - **Tables**: `background_tasks`
   - **API**: `/api/background-tasks`
   - **UI**: `/background-tasks.html` page
   - **Examples**: Compress articles, run analysis, export database, vacuum

**Shared Infrastructure**: Both use telemetry, SSE broadcasting, progress tracking, pause/resume.

**Key Rule**: Crawls **acquire new data** (network I/O). Background tasks **process existing data** (CPU/disk I/O).

**Compression Behavior (October 2025)**: Crawls now compress content with Brotli 6 by default during ingestion. Background tasks handle lifecycle compression (hot/warm/cold tiers).

**Critical Terminology Rule** (October 2025):
- ✅ **Crawls** are user-facing entities (users start, resume, pause, clear crawls)
- ❌ **Queues** are internal implementation details (not directly controllable by users)
- Each crawl has an internal queue of URLs to visit (`queue_events` table)
- Users never "resume a queue" - they "resume a crawl" (which restores queue state)
- UI text must say "Resume Crawls", not "Resume Queues"
- See `docs/ARCHITECTURE_QUEUES_ARE_INTERNAL.md` for complete explanation

### UI Module Pattern ⚠️ CRITICAL

**ES6 Modules Only**: All UI code uses `import/export`, NOT CommonJS `require/module.exports`

**Factory Pattern**: Modules export factory functions that MUST be called with dependencies:
```javascript
// ✅ CORRECT: Import AND call with dependencies
import { createCrawlControls } from './crawlControls.js';
createCrawlControls({ elements, formElements, actions, formatters });

// ❌ WRONG: Import alone does nothing
import { createCrawlControls } from './crawlControls.js';
// Missing call - no handlers attached!
```

**Common Bug** (Oct 2025): `index.js` imported `createCrawlControls` but never called it → start button had no click handler for months.

**Verification**: Search `export function create*` → verify corresponding call site exists in `index.js`

### Build Process

**Auto-Build on Server Start**: Components auto-rebuild if sources newer than outputs (~100-300ms) - DEPRECATED  
**Manual Build**: `node scripts/build-ui.js` (rebuilds index.js, global-nav.js, chunks) - DEPRECATED  
**SASS**: `npm run sass:build` for styles, `npm run sass:watch` for auto-compile - DEPRECATED

---

## Tools and Correction Scripts

All correction and data manipulation tools default to dry-run mode requiring `--fix` to apply changes, ensuring safety. This enables safe database and file operations with verification workflows. When creating new tools or running cleanup scripts, follow these patterns to prevent data loss.

**When to consult**:
- When creating new data manipulation or correction tools
- When running existing correction scripts for data cleanup
- When implementing tools that modify database records or files

**See**: `docs/agents/tools-correction-scripts.md`

**Example**: Run `node tools/corrections/fix-foreign-keys.js` in dry-run first.

---

## Test Log Migration and Management

Tools for migrating legacy test-timing-*.log files to organized testlogs/ directory, validating integrity, and managing cleanup. Includes audit, dry-run, and execution modes for safe operations. Use when repository has many old logs or needs cleanup.

**When to consult**:
- Repository root has many old test-timing logs (> 50 files)
- Before major cleanup sessions (preserve logs safely)
- When testlogs has suspicious "ALL" labels (tool detects mislabeling)
- After test suite reconfigurations (ensure correct suite names)

**See**: `docs/agents/test-log-migration.md`

**Example**: `node tools/migrate-test-logs.js --audit` to check current state.

---

## Database Schema Tools

Quick database inspection tools that eliminate PowerShell approval dialogs using simple Node commands. Provides table structure, indexes, foreign keys, stats, and read-only queries. Opens DB read-only for safety and formats output for readability.

**When to consult**:
- When needing database structure information (tables, columns, indexes)
- For read-only queries during development and debugging
- To verify schema after code changes
- When checking foreign key relationships or row counts

**See**: `docs/agents/database-schema-tools.md`

**Example**: `node tools/db-schema.js tables` to list all tables.

---

## How to Get a Database Handle (SIMPLIFIED - October 2025)

**⚠️ READ FIRST**: `docs/DATABASE_QUICK_REFERENCE.md` - Complete database connection patterns.

**Quick Summary** (Full details in guide above):

**Most Common Usage**:
```javascript
const { ensureDatabase } = require('../db/sqlite');
const db = ensureDatabase('/path/to/db.sqlite');
// Use directly with better-sqlite3 API
```

**In Tests (CRITICAL)**:
```javascript
// ✅ Use app's shared connection (WAL mode requires this)
beforeEach(() => {
  app = createApp({ dbPath: createTempDb() });
  const db = app.locals.backgroundTaskManager.db; // Use THIS
});

// ❌ NEVER create separate connections in tests
```

**With Query Telemetry**:
```javascript
const { ensureDatabase, wrapWithTelemetry } = require('../db/sqlite');
const db = ensureDatabase('/path/to/db.sqlite');
const instrumentedDb = wrapWithTelemetry(db, { trackQueries: true });
```

**See `docs/DATABASE_QUICK_REFERENCE.md` for complete patterns and WAL mode details.**

---

## Database Backup Policy (October 2025)

**Keep only one recent backup** to avoid cluttering the repository while maintaining recovery capability.

**Current Backups** (`data/backups/`):
- `news-backup-YYYY-MM-DD-HHMMSS.db` - Most recently modified main database (news.db)
- `gazetteer-backup-YYYY-MM-DD-HHMMSS.db` - Gazetteer database backup
- `urls.db` - Most recent URL database backup
- `gazetteer-backup/` - NDJSON export of gazetteer tables (681,400 rows as of 2025-10-20)

**Policy**:
- ✅ Keep **one recent backup** of each major database
- ✅ Create timestamped backups before major schema changes
- ✅ Remove old backups when creating new ones
- ✅ Gazetteer backups are critical (contains place/country data)
- ❌ Don't accumulate multiple backups over time

**When to Create Backups**:
- Before major schema migrations
- Before running data correction scripts
- When testing new compression algorithms
- Before large data imports/exports

**Backup Command Pattern**:
```powershell
$timestamp = Get-Date -Format "yyyy-MM-dd-HHmmss"
Copy-Item -Path "data\news.db" -Destination "data\backups\news-backup-$timestamp.db" -Force
Copy-Item -Path "data\gazetteer.db" -Destination "data\backups\gazetteer-backup-$timestamp.db" -Force
```

**See `docs/DATABASE_QUICK_REFERENCE.md` for complete patterns and WAL mode details.**

---

## Enhanced Database Adapter (Optional Analytics Infrastructure)

**⚠️ SUBJECT TO CHANGE**: This feature is actively evolving. Update this section when implementation changes.

**What It Is**:
The `EnhancedDatabaseAdapter` (`src/db/EnhancedDatabaseAdapter.js`) is an **optional** analytics infrastructure that provides advanced monitoring for intelligent crawls. It consists of three modules:

1. **QueueDatabase** - Enhanced queue event tracking with priority scores
2. **PlannerDatabase** - Knowledge reuse statistics and pattern tracking  
3. **CoverageDatabase** - Real-time coverage analytics, milestones, gap tracking

**When It's Used**:
- Powers `/api/coverage/*` endpoints for job analytics
- Enables job detail pages with real-time metrics
- Required for advanced planning features (gap-driven prioritization, problem clustering, knowledge reuse)

**Is It Required?**:
**NO** - Completely optional. The crawler works perfectly without it:
- If initialization fails, crawl continues normally
- Core crawling features remain fully functional
- Only advanced analytics features become unavailable

**Common Warning Message**:
```
Enhanced DB adapter unavailable (optional - missing tables), crawl continues normally
```

This appears when:
- Advanced features enabled in `config/priority-config.json` (e.g., `advancedPlanningSuite: true`)
- Required database tables don't exist yet (11 tables: `queue_events_enhanced`, `problem_clusters`, `coverage_snapshots`, `hub_discoveries`, etc.)

**What To Do**:
- **Ignore it** (recommended) - Crawl works fine, advanced analytics just unavailable
- **Disable feature** - Set `advancedPlanningSuite: false` in config to suppress warning
- **Implement tables** - Run migrations to create required tables (only if you need coverage API)

**Documentation**:
- Architecture: `docs/COVERAGE_API_AND_JOB_DETAIL_IMPLEMENTATION.md`
- Implementation status: "90% complete but 80% unused" (as of Oct 2025)
- This is planned infrastructure, not critical path functionality

---

## Database Architecture (SQLite WAL Mode)

**UPDATE (October 2025)**: Database initialization simplified from 4 layers to 2 layers.
- See "How to Get a Database Handle" section above for new simplified API
- Legacy `ensureDb()`, `getDbRW()`, `getDbRO()` still work but deprecated
- New code should use `ensureDatabase()` and `wrapWithTelemetry()`

**CRITICAL**: Tests MUST use app's shared DB connection. Multiple connections cause WAL isolation (writes invisible).

```javascript
// ✅ CORRECT: Single shared connection
beforeEach(() => {
  app = createApp({ dbPath: createTempDb(), verbose: false });
  const db = app.locals.backgroundTaskManager.db; // Use THIS
  seedArticles(db); // Same connection
});

// ❌ WRONG: Multiple connections (WAL isolation)
const db = ensureDb(dbPath); // Connection 1
seedArticles(db);
db.close();
app = createApp({ dbPath }); // Connection 2 - won't see seeded data!
```

---

## Testing Guidelines

**Comprehensive testing patterns, rules, and workflows for reliable code changes.** Every code change requires tests - write them alongside implementation, not after. Critical rules include: check logs before running tests, use single DB connections in WAL mode, verify results with exit codes, and fix schema bugs first (100% failure rate = schema issue).

**When to consult**:
- When writing new code or modifying existing code
- When tests are failing and need systematic fixing
- When implementing new features that require tests
- When debugging test hangs or async issues
- When working with database operations in tests

**See**: `docs/agents/testing-guidelines.md` for complete patterns, golden rules, debugging techniques, and workflow examples.## Build Process

**CRITICAL**: Browser components must be built before the server can serve them correctly.

### Automatic Build on Server Start ✅

**The server automatically checks and rebuilds components if needed when it starts.**

- **Fast Check**: Compares source file timestamps with built file timestamps
- **Only Rebuilds When Necessary**: If sources are newer than outputs, rebuilds automatically
- **Quick**: esbuild makes rebuilds nearly instant (~100-300ms)

**Implementation**: `src/ui/express/auto-build-components.js`

### Manual Build (Optional)

```bash
# Build components (usually not needed due to auto-build)
npm run components:build

# Build styles
npm run sass:build
```

---

## Architecture Documentation

**See Topic Index at top of AGENTS.md** for complete documentation map organized by category.

Key architecture docs:
- **`docs/ARCHITECTURE_CRAWLS_VS_BACKGROUND_TASKS.md`** ⭐ **START HERE** - Crawls vs Background Tasks
- **`docs/SERVICE_LAYER_ARCHITECTURE.md`** - Service patterns and dependency injection
- **`docs/DATABASE_NORMALIZATION_PLAN.md`** - Schema evolution strategy
- **`docs/COMPRESSION_IMPLEMENTATION_FULL.md`** - Compression infrastructure

---

## 🎯 CURRENT FOCUS: Feature Development & Bug Fixes (October 2025)

**Status**: ✅ Core infrastructure complete - active feature development  
**Next**: Continue with background tasks, UI improvements, and optimizations

---

## Test-Driven Development (TDD) Guidelines

Test-driven development patterns for reliable code changes. Every code change requires tests written alongside implementation, not after. Includes test types, workflow, and common pitfalls. Critical rules include checking logs before running tests and using single DB connections.

**When to consult**:
- When writing new code or modifying existing code
- When implementing new features that require tests
- When refactoring code that affects existing behavior
- When debugging test failures or hangs

**See**: `docs/agents/tdd-guidelines.md`

**Example**: Check test logs first: Read recent test-timing-*.log files to see failures.

---

## Communication & Documentation

**Chat Summaries**: 1-2 sentences only. State what was done and the result. No detailed reports, metrics, or multi-section summaries in chat.

**AGENTS.md hygiene**: This file is for CURRENT and FUTURE work only. When initiatives complete, delete implementation details but keep high-level patterns/lessons. Move detailed retrospectives to separate docs.

**Don't create summary documents for routine work**: Code changes, refactoring, bug fixes don't need documentation. Just report results briefly in chat.

---

## Refactoring Guidelines

**Read-First, Match-Existing**: Always read existing code before designing changes. Don't refactor well-architected code. If your service doesn't fit existing patterns, delete it and read more code.

**Autonomous workflow** (for AI agents):
1. **Assessment**: Read files, identify what needs work vs already clean
2. **Implementation**: Create service + tests → integrate incrementally → run tests → delete old code
3. **Validation**: Full test suite → update docs (at end only)

**Decision framework**:
- 🟢 **Proceed autonomously**: Writing tests, fixing test failures, integrating code, committing work
- 🟡 **Think carefully**: Service doesn't fit architecture (delete it), tests fail unexpectedly (debug first)
- 🔴 **Ask human**: Major architectural changes, breaking API changes, performance trade-offs

---

## Test Console Output

**Keep output minimal** (<100 lines, ideally <50). Add noisy patterns to `jest.setup.js` DROP_PATTERNS. Use `verbose: false` and `silent: true` flags in tests.

---

### PowerShell Command Guidelines

**See "CRITICAL COMMAND RULES" section above and `docs/COMMAND_EXECUTION_GUIDE.md` for complete guidance.**

# Multi-line commands with backticks or line breaks
Get-Content "file.js" `
  -replace 'pattern1', 'replacement1' `
  -replace 'pattern2', 'replacement2' | Set-Content "file.js"

# Commands with complex escaping or nested quotes
### PowerShell Command Guidelines

Rules for executing commands without VS Code approval dialogs. Use safe patterns and tools instead of complex PowerShell commands that trigger security prompts. Prefer replace_string_in_file for file edits and simple Node commands for operations.

**When to consult**:
- When you need to run terminal commands
- When editing files or searching code
- When you encounter approval dialog blocks

**See**: `docs/agents/command-rules.md`

**Example**: Use `replace_string_in_file` tool instead of Get-Content piped to Set-Content.

# Chained commands with semicolons
command1; Start-Sleep -Seconds N; command2 | ConvertFrom-Json

# Multi-command pipelines
Start-Job -ScriptBlock { ... } | Out-Null; Start-Sleep -Seconds 3; curl http://...

# ForEach-Object with complex logic
Get-ChildItem | ForEach-Object { ... complex logic ... }

# Complex string manipulation with -replace, -match, etc.
Get-Content "file.js" | Select-String -Pattern "complex.*regex" | ForEach-Object { ... }
```

**✅ SIMPLE Commands That Work (USE THESE)**:
```powershell
# Single-purpose file operations
Test-Path "file.js"
Get-Content "file.log"
Get-Content "file.log" | Select-Object -Last 20
Get-ChildItem "directory"

# Simple process operations
node server.js --detached --auto-shutdown-seconds 10
npm test
npm run build

# Simple output formatting (no complex logic)
command 2>&1 | Select-String "pattern"
command | Select-Object -First 10
```

**✅ Use Tools Instead of Complex Commands (PRIMARY APPROACH)**:
```javascript
// Option 1: replace_string_in_file tool (PRIMARY CHOICE - 95% of cases)
replace_string_in_file({
  filePath: "file.js",
  oldString: "const config = JSON.parse(taskRes.body.task.config);",
  newString: "const config = taskRes.body.task.config; // Already parsed"
})

// Option 2: Multiple sequential replacements (if pattern appears multiple times)
replace_string_in_file({ filePath, oldString: "pattern1", newString: "replacement1" })
replace_string_in_file({ filePath, oldString: "pattern2", newString: "replacement2" })

// Option 3: create_file to overwrite (ONLY if rewriting entire file is simpler)
// Rare scenario: >50% of file content changing
create_file({ filePath: "file.js", content: "entire new file content..." })
```

**Available Editing Tools Research** (October 2025):
- ✅ **replace_string_in_file** - Direct VS Code API, never requires approval, handles exact string replacement
- ✅ **create_file** - Can overwrite existing files, useful for massive rewrites (rare)
- ❌ **edit_files** - Placeholder tool marked "do not use" (may be enabled in Edit2 mode)
- ❌ **edit_notebook_file** - Only for Jupyter notebooks (.ipynb)
- ❌ **run_in_terminal** - PowerShell commands trigger approval dialogs
- ❌ **MCP tools** - GitHub/Context7 MCPs are for repository ops and docs, not local file editing

**Edit2 Mode** (October 2025):
VS Code has an "Edit2" option that changes editing tool behavior. This mode:
- Requires tool-calling capabilities
- May enable additional editing interfaces (e.g., `edit_files` tool)
- Can be toggled in VS Code settings
- May require new conversation session to take effect
- **Current status**: Investigating tool availability in Edit2 mode
- **Recommendation**: Until Edit2 capabilities are confirmed, continue using `replace_string_in_file` as primary editing method

**Why `replace_string_in_file` Doesn't Require Approval**:
- Uses VS Code's internal file editing API
- No shell command execution
- No regex parsing complexity
- Validation built into the tool

**Why PowerShell Commands DO Require Approval**:
- Shell command execution with potential side effects
- Complex regex patterns with escaping
- Piping through Get-Content/Set-Content
- String interpolation and special characters

**When Tempted to Use Complex PowerShell**:
1. ✅ **STOP - Use `replace_string_in_file` tool instead** (PRIMARY - 95% of cases)
2. ✅ **STOP - Use `read_file` tool to get file contents** (not Get-Content with complex logic)
3. ✅ **STOP - Use `grep_search` tool to search files** (not Select-String with regex)
4. ✅ **STOP - Use `file_search` tool to find files** (not Get-ChildItem with ForEach-Object)
5. ✅ If pattern appears multiple times, call `replace_string_in_file` sequentially
6. ✅ If unsure about pattern match, `read_file` first to verify exact string
7. ❌ **NEVER** use Get-Content piped to Set-Content for code changes
8. ❌ **NEVER** use complex regex in PowerShell commands
9. ❌ **NEVER** chain multiple commands with semicolons
10. ❌ **NEVER** use ForEach-Object with complex logic

**Key Principle**: If you're about to write a PowerShell command longer than ONE line or with ANY piping beyond simple filtering, STOP and use a tool instead.

**Additional Commands That Require Approval** (October 2025):
```powershell
# ❌ WRONG: Running ANY command in a terminal with a background process
# (This is the actual issue - not the curl syntax)
Terminal> node server.js --detached --auto-shutdown-seconds 30  # Background server
Terminal> curl http://...  # ← KILLS THE BACKGROUND SERVER
Terminal> echo "test"      # ← ALSO KILLS THE BACKGROUND SERVER
Terminal> Get-Content file.log  # ← ALSO KILLS THE BACKGROUND SERVER

# ❌ WRONG: Unix curl syntax in PowerShell
curl -X POST http://localhost:3000/api/crawl -H "Content-Type: application/json" -d '{"key":"value"}'
# Error: "Cannot bind parameter 'Headers'" 

# ❌ WRONG: Complex multi-command pipelines
Start-Job -ScriptBlock { ... } | Out-Null; Start-Sleep -Seconds 3; curl http://...

# ❌ WRONG: Commands with multiple stages, sleeps, and conditionals
Start-Sleep -Seconds 5; (Invoke-WebRequest -Uri http://... -UseBasicParsing).Content

# ❌ WRONG: Chained commands with semicolons and complex expressions
command1; Start-Sleep -Seconds N; command2 | ConvertFrom-Json | Select-Object

# ✅ RIGHT: Simple, single-purpose commands (IN A CLEAN TERMINAL)
Test-Path "file.js"
Get-Content "file.log" | Select-Object -Last 20
node server.js --detached --auto-shutdown-seconds 10

# ✅ RIGHT: Use tools instead of running commands
# Use get_terminal_output to read background process logs (read-only, safe)
# Use read_file to read log files from disk
```

---

## Database Schema Evolution

**Comprehensive database normalization and compression infrastructure enabling schema evolution without export/import cycles.**

**When to consult**:
- When planning database schema changes or normalization
- When implementing compression infrastructure
- When needing to evolve schema without breaking changes
- When adding normalized tables alongside existing schema

**See**: `docs/agents/database-schema-evolution.md` for complete normalization plan, implementation phases, compression performance, and migration strategy.

---

## Intelligent Crawl Startup Analysis (Rapid Iteration Workflow)

Rapidly iterate on dense, informative startup output for intelligent crawls in seconds rather than minutes. Use --limit N to display only first N lines, enabling rapid testing without full crawl completion.

**When to consult**:
- When improving information density in startup output
- For rapid testing of initialization changes (<30 seconds per iteration)
- To verify database status, coverage, and missing hubs without full crawl
- When debugging initialization issues

**See**: `docs/agents/intelligent-crawl-startup.md`

**Example**: `node tools/intelligent-crawl.js --limit 100` for recommended analysis.

**Note (Oct 2025)**: the helper now launches `NewsCrawler` with `countryHubExclusiveMode` enabled, so runs stay focused on hub structure; unset this flag inside `tools/intelligent-crawl.js` if you need full article fetching for comparisons.

---

*This refactoring transforms the codebase into a more idiomatic, maintainable state while preserving all existing functionality. Follow the workflow systematically, test continuously, and document progress transparently.*