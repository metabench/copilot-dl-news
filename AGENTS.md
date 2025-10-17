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

**UI Development**
- 🎨 HTML composition → `HTML_COMPOSITION_ARCHITECTURE.md`
- 🧩 Component modules → `CLIENT_MODULARIZATION_PLAN.md`
- 📡 SSE integration → `UI_INTEGRATION_COMPLETE.md`

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

**⚠️ READ FIRST**: `docs/COMMAND_EXECUTION_GUIDE.md` - Complete guide to avoiding VS Code approval dialogs.

**The `AGENT_IMMEDIATE.js` Strategy** (October 2025)

To prevent VS Code from requesting user approval for terminal commands, we use a dynamic script execution strategy. Instead of running complex `node -e "..."` or multi-part shell commands, agents will:

1.  **Dynamically Create a Script**: Write the desired logic into `AGENT_IMMEDIATE.js` using the `create_file` tool (which allows overwriting).
2.  **Execute the Script**: Run the simple, pre-approved command `node AGENT_IMMEDIATE.js`.

This workflow ensures that all complex logic is contained within a local file, and the only command executed in the terminal is a simple, non-threatening one that does not trigger security prompts.

**Example**:

Instead of this (which requires approval):

```bash
# ❌ WRONG: Complex command requires approval
node -e "require('./my-script.js').doSomething({ complex: 'arg' })"
```

Do this:

```javascript
// 1. Overwrite AGENT_IMMEDIATE.js with the required logic
create_file({
  filePath: 'c:\\Users\\james\\Documents\\repos\\copilot-dl-news\\AGENT_IMMEDIATE.js',
  content: `
    const { doSomething } = require('./my-script.js');
    doSomething({ complex: 'arg' });
  `
});

// 2. Run the simple, pre-approved command
run_in_terminal({
  command: 'node AGENT_IMMEDIATE.js',
  explanation: 'Run the immediate agent script.'
});
```

**Field note (October 2025)**: Default to this pattern for any ad-hoc investigation—SPARQL probes, API smoke checks, or quick data transforms. Author the scratch logic in `AGENT_IMMEDIATE.js`, run it once, then restore the placeholder. This keeps every exploratory command inside the approved workflow.

**Quick Summary** (Full details in guide above):

**NEVER USE** these PowerShell patterns:
- `Get-Content | Set-Content` pipelines
- Complex regex with `-replace`
- Chained commands with semicolons (`;`)
- Piping to `Select-String`, `ForEach-Object`
- Multi-line commands with backticks (`` ` ``)

**USE TOOLS INSTEAD**:
- ✅ `replace_string_in_file` - for editing files (95% of cases)
- ✅ `read_file` - for reading file contents
- ✅ `grep_search` - for searching in files
- ✅ `file_search` - for finding files

**Safe Commands** (OK to run):
- `Test-Path "file.js"`
- `Get-ChildItem`
- `node script.js arg1 arg2`
- `npm run test:file "pattern"`

**Critical Rules**:
1. ❌ Never run commands in terminals with background processes (kills the server)
2. ❌ PowerShell `curl` is NOT Unix curl (use E2E tests instead)
3. ✅ Use `get_terminal_output` tool to check background process logs (read-only)

**Decision Rule**: If command is >1 line OR uses piping/chaining → Use a tool instead.

**See `docs/COMMAND_EXECUTION_GUIDE.md` for complete examples and decision trees.**

---

## 🎯 Core Workflow Rules

**Execution**: Work autonomously. Stop only if genuinely blocked.  
**Research Budget**: Read 5-10 files max before coding. For small changes (<50 lines): 1-3 files, 1-2 searches.  
**Fast Path**: Check attachments → ONE search for pattern → Read ONE example → START CODING (within 2-5 min)  
**Test Discipline**: Add debugging code BEFORE running tests repeatedly. If you've run the same test 3+ times without code changes, STOP and add more debugging.

**🚨 CRITICAL: Configuration-Based Test Execution** (October 2025):

**AUTONOMOUS OPERATION**: Use configuration-based test runner to avoid PowerShell confirmation dialogs.

```bash
# ✅ CORRECT: Configuration-based (no confirmation)
node tests/run-tests.js e2e
node tests/run-tests.js unit

# ❌ WRONG: Environment variables (requires confirmation)
cross-env E2E=1 npm test
GEOGRAPHY_E2E=1 npm test
```

**How It Works**:
1. **Modify `tests/test-config.json`** - AI agents can edit freely (no confirmation)
2. **Run `node tests/run-tests.js <suite>`** - Simple Node command (no confirmation)
3. **Check logs** - Read `test-timing-*.log` files for results

**Available Test Suites** (defined in `tests/test-config.json`):
- `unit` - Fast unit tests (<30s)
- `integration` - HTTP server tests (~60s)
- `e2e` - Standard E2E tests (2-5min, excludes dev tests)
- `e2e-quick` - Quick E2E smoke tests (<1min)
- `all` - All regular tests (excludes dev tests)
- `dev-geography` - Development test (5-15min, explicit run only)
- `dev-geography-monitor` - Development test (10min, explicit run only)

**See**: `tests/README.md` for complete documentation.

**🚨 CRITICAL: Check Test Logs FIRST** (October 2025):

**Simple Query Tools** - Extract specific info from logs (NO APPROVAL NEEDED):
```bash
node tests/get-test-summary.js --compact  # Quick overview (5s)
node tests/get-failing-tests.js           # List failures + message (5s)
node tests/get-failing-tests.js --history --test <pattern>  # Confirm fix history fast
node tests/get-latest-log.js              # Get log path (2s)
node tests/get-slow-tests.js              # Performance check (5s)
```

- `get-failing-tests.js` reads `test-failure-summary.json`, and the reporter also writes per-run snapshots to `testlogs/<timestamp>_<suite>.failures.json`, so history queries surface the original failure messages.

**Test Log Analyzer** - Comprehensive historical analysis:
```bash
node tests/analyze-test-logs.js --summary  # Quick status (5s)
node tests/analyze-test-logs.js            # Full analysis (10s)
```

**Features**: Current status, fixed tests, regressions, still broken (prioritized), hanging tests (🐌🐌🐌), historical patterns  
**Documentation**: `tests/SIMPLE_TOOLS_README.md` (simple tools), `docs/TESTING_REVIEW_AND_IMPROVEMENT_GUIDE.md` (workflow)

**Why**: Saves 5-10 min/session, smart prioritization, learn from fixes, avoid duplicate work

**🚨 CRITICAL: Verify Test Results After Every Run** (October 2025):
- **Check logs FIRST** - Read `test-timing-*.log` files before running ANY tests
- **NEVER trust task success messages** - Always check exit code (0 = pass, non-zero = fail)
- **Read terminal output** - Look for "Test Suites: X failed" and "Tests: X failed"
- **Detect hangs** - E2E tests >60s often indicate hangs, check for tests in RUNS state
- **Check test timing** - Review slowest tests (e.g., "🐌 359.67s") as hang indicators
- **Consult docs FIRST** - Read `docs/TESTING_REVIEW_AND_IMPROVEMENT_GUIDE.md` before running tests
- **Use `terminal_last_command`** - Verify exit code after every test run: `exit code: 0` = pass, `exit code: 1` = fail

**Pre-Implementation Checklist**:
1. Check AGENTS.md for documented patterns
2. Search for similar files (file_search for patterns)
3. Match existing conventions (naming, structure)
4. Document discoveries in AGENTS.md
5. Review the latest test timing logs (`test-timing-*.log` in repo root) to capture prior Jest failures before running new suites.

**🚨 CRITICAL: Always Check Tool Output** (October 2025):
- **NEVER say "Perfect" or "Success" if there are warnings or errors**
- **Read ALL output**: Exit codes, warnings, error messages, stack traces
- **Investigate warnings**: Node warnings about circular dependencies, deprecations, type errors are RED FLAGS
- **Report issues**: Mention warnings/errors explicitly, assess severity (critical/moderate/minor)
- **Fix or document**: Either fix the issue immediately or document why it's acceptable
- **Examples of missed issues**: Circular dependency warnings, constraint violations, silent failures

## Project Structure

**UI Styles**: `src/ui/express/public/styles/*.scss` → `npm run sass:build`  
**UI Components**: `src/ui/public/**/*.js` → `node scripts/build-ui.js` → `src/ui/express/public/assets/`  
**Server**: `src/ui/express/server.js` serves `/assets/` (built), `/theme/` (shared)  
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

**Auto-Build on Server Start**: Components auto-rebuild if sources newer than outputs (~100-300ms)  
**Manual Build**: `node scripts/build-ui.js` (rebuilds index.js, global-nav.js, chunks)  
**SASS**: `npm run sass:build` for styles, `npm run sass:watch` for auto-compile

---

## Tools and Correction Scripts (October 2025)

**Convention**: All correction and data manipulation tools **default to dry-run mode** and require `--fix` to apply changes.

**Rationale**: Prevents accidental data corruption, allows safe inspection of changes before applying them.

**Standard Pattern**:
```bash
# Default behavior - dry run (safe, shows what would change)
node tools/corrections/fix-duplicate-capitals.js

# Apply changes - requires explicit --fix flag
node tools/corrections/fix-duplicate-capitals.js --fix

# Dry run with filter
node tools/corrections/fix-duplicate-capitals.js --country=GB

# Apply changes with filter
node tools/corrections/fix-duplicate-capitals.js --fix --country=GB
```

**Implementation Pattern** (for new tools):
```javascript
#!/usr/bin/env node
/**
 * tool-name.js - Brief description
 * 
 * Usage:
 *   node tools/corrections/tool-name.js              # Dry run (default)
 *   node tools/corrections/tool-name.js --fix        # Apply changes
 */

// Default to dry-run mode, require --fix to apply changes
const dryRun = !process.argv.includes('--fix');

// ... tool logic ...

console.log(`\n${'='.repeat(60)}`);
if (dryRun) {
  console.log(`DRY RUN COMPLETE`);
  console.log(`Would make X changes`);
  console.log(`\nRun with --fix to apply changes`);
} else {
  console.log(`✓ CHANGES APPLIED`);
  console.log(`Made X changes`);
}
```

**Existing Tools Following This Convention**:
- `tools/corrections/fix-place-hub-names.js` - Normalize place hub slugs
- `tools/corrections/fix-canonical-names.js` - Set canonical_name_id for places missing it
- `tools/corrections/fix-duplicate-places.js` - Advanced deduplication with coordinate proximity
- `tools/corrections/fix-duplicate-capitals.js` - Merge duplicate capital records (legacy, use fix-duplicate-places instead)

**Recommended Workflow for Data Cleanup**:
1. **Fix canonical names first**: `node tools/corrections/fix-canonical-names.js --fix`
2. **Then deduplicate**: `node tools/corrections/fix-duplicate-places.js --fix --kind=city --role=capital`
3. **Verify results**: `node tools/gazetteer/list-capital-cities.js --with-country`

**Critical: Always Verify Tool Output**:
- ✅ Check for warnings (circular dependencies, deprecations, type errors)
- ✅ Check for error messages (constraint violations, missing files, failed operations)
- ✅ Verify expected results match actual results (row counts, file changes)
- ✅ Read exit codes: 0 = success, non-zero = failure
- ❌ **NEVER claim success if warnings/errors appear in output**
- ❌ Don't ignore Node.js warnings - they indicate real problems

**See Also**: 
- `docs/GAZETTEER_DEDUPLICATION_IMPLEMENTATION.md` - Cleanup tools documentation
- Tool-specific comments for detailed usage

---

## Test Log Migration and Management (October 2025)

**Purpose**: Migrate legacy `test-timing-*.log` files from root to organized `testlogs/` directory, validate log integrity.

**Quick Commands**:
```bash
# Audit existing testlogs (validate suite claims, detect issues)
node tools/migrate-test-logs.js --audit

# Dry run - see what would be migrated
node tools/migrate-test-logs.js

# Execute migration and cleanup (DESTRUCTIVE - deletes root logs)
node tools/migrate-test-logs.js --execute

# Verbose mode (detailed analysis)
node tools/migrate-test-logs.js --verbose
```

**Tool Features**:
- **Smart Import**: Only imports most recent root log (ignores ~804 old logs)
- **Validation**: Checks "ALL" suite claims (must have ≥100 tests, ≥50 files)
- **Duplicate Detection**: Compares timestamps + test counts with existing testlogs
- **Safe by Default**: Dry-run mode unless `--execute` flag provided
- **Audit Mode**: Reviews existing testlogs for mislabeled suites (e.g., single-file "ALL" suites)

**When to Use**:
- Repository root has many old test-timing logs (> 50 files)
- Before major cleanup sessions (preserve logs safely)
- When testlogs has suspicious "ALL" labels (tool detects mislabeling)
- After test suite reconfigurations (ensure correct suite names)

**Common Workflow**:
```bash
# 1. Check what's in root
(Get-ChildItem test-timing-*.log).Count  # e.g., 805 files

# 2. Audit testlogs to find issues
node tools/migrate-test-logs.js --audit
# Shows: Many "ALL" logs with only 1-30 tests (mislabeled)

# 3. Dry run to preview migration
node tools/migrate-test-logs.js
# Shows: Would import most recent, delete 804 old logs

# 4. Execute if satisfied
node tools/migrate-test-logs.js --execute
# Imports recent log, deletes old root logs
```

**Docs**: See `docs/TESTING_REVIEW_AND_IMPROVEMENT_GUIDE.md` for complete testing workflow integration.

**Cleanup Tool**: Use `tools/cleanup-test-logs.js` for aggressive maintenance:
```bash
# Default: keep only 2 recent logs per suite type (parallel processing, ~5s for 2,000+ files)
node tools/cleanup-test-logs.js --execute

# Dry run to preview deletions
node tools/cleanup-test-logs.js --stats
```

**Strategy**: Keeps only most recent logs per suite to minimize AI scanning overhead. Parallel worker threads analyze 1,000+ logs in seconds. See `docs/TESTING_QUICK_REFERENCE.md` for options.

---

## Database Schema Tools (October 2025)

**Quick database inspection without approval dialogs**:

```bash
# Table structure and metadata
node tools/db-schema.js tables                    # List all tables
node tools/db-schema.js table analysis_runs       # Show columns
node tools/db-schema.js indexes analysis_runs     # Show indexes
node tools/db-schema.js foreign-keys articles     # Show foreign keys
node tools/db-schema.js stats                     # Row counts + DB size

# Read-only queries
node tools/db-query.js "SELECT * FROM articles LIMIT 5"
node tools/db-query.js --json "SELECT * FROM analysis_runs WHERE status='running'"
```

**Why**: Eliminates PowerShell approval dialogs, opens DB read-only for safety, formats output for readability.
**Docs**: `tools/debug/README.md` (Database Schema Tools section)

**VS Code Approval Mechanism** (Researched October 2025):
- **Auto-Approve Setting**: `terminal.integrated.enableAutoApprove` (default: `true`)
- **Simple commands DON'T need approval**: `node script.js arg1 arg2` (single command, simple args)
- **Commands that REQUIRE approval**: Piping (`|`), chaining (`;`), output parsing (`2>&1 | Select-String`), complex shell operations
- **Our tools are simple Node commands**: Should NOT trigger approval in normal operation
- **If approval appears**: User may have disabled auto-approve setting, or command output is being processed by VS Code
- **Source**: VS Code `runInTerminalTool.ts`, `terminalConfiguration.ts` (auto-approve system for Copilot Chat tool invocations)

**Common Workflows**:
```bash
# Verify schema after code changes
node tools/db-schema.js table analysis_runs

# Check if index exists
node tools/db-schema.js indexes analysis_runs

# Manually upgrade schema (server does this automatically)
node tools/upgrade-analysis-schema.js

# Query specific records
node tools/db-query.js "SELECT * FROM analysis_runs WHERE background_task_id IS NOT NULL LIMIT 5"
```

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

**⚠️ READ FIRST WHEN WORKING ON TESTS**:
1. `docs/TESTING_QUICK_REFERENCE.md` ⭐ **Quick patterns and rules**
2. `docs/TESTING_REVIEW_AND_IMPROVEMENT_GUIDE.md` ⭐ **Systematic test fixing**
3. `docs/TESTING_ASYNC_CLEANUP_GUIDE.md` - Async patterns, preventing hangs
4. `docs/TEST_TIMEOUT_GUARDS_IMPLEMENTATION.md` - Timeout prevention

**This section: CRITICAL RULES ONLY. Full patterns in docs above.**

---

### Golden Rules

**🚨 GOLDEN RULE**: Tests Must Never Hang Silently
- Set explicit timeouts: `test('name', async () => {...}, 30000)`
- Add progress logging for operations >5s
- Use AbortController with timeouts for network calls
- See `docs/TESTING_ASYNC_CLEANUP_GUIDE.md` for patterns

**🚨 CRITICAL**: Verify Test Results After Every Run
- VS Code task messages are UNRELIABLE (shows "succeeded" even when tests fail)
- ALWAYS use `terminal_last_command` tool to check exit code
- Exit code 0 = pass, exit code 1 = fail
- Read terminal output for details

**🔥 CRITICAL**: Check Logs BEFORE Running Tests
```bash
# Saves 5-10 min per session
node tests/analyze-test-logs.js --summary  # Current status (5s)
node tests/get-failing-tests.js            # List failures (5s)
```

**🔥 CRITICAL**: Single DB Connection in Tests (WAL Mode)
```javascript
// ✅ CORRECT: Use app's shared connection
beforeEach(() => {
  app = createApp({ dbPath: createTempDb() });
  const db = app.locals.backgroundTaskManager.db; // Use THIS
  seedArticles(db); // Same connection
});

// ❌ WRONG: Multiple connections (WAL isolation)
const db = ensureDb(dbPath); // Connection 1
seedArticles(db);
db.close();
app = createApp({ dbPath }); // Connection 2 - won't see seeded data!
```

**Common Patterns**:
- Schema bugs → 100% failure rate (fix these first)
- Async without await → Returns Promise instead of value
- Multiple DB connections → WAL isolation makes writes invisible
- See `docs/TESTING_QUICK_REFERENCE.md` for complete patterns

**Test Discipline**:
- Add debugging BEFORE running tests 3+ times
- Fix one test, verify, then next (no batching)
- Use `npm run test:file "pattern"` for focused tests
- Configuration runner: `node tests/run-tests.js <suite>` (no approval dialogs)
- When the user labels a test "broken", move the file into `tests/broken/` (mirroring its subdirectory) so regular suites skip it. Keep the contents intact there for future repair work and note the relocation in your summary.

**See specialized docs above for complete testing workflows and patterns.**

**Telemetry Regression Pack (October 2025)**
- **Trigger**: Changes to `analyse-pages-core`, timeline renderers, crawl stop/start controls, or any telemetry/milestone wiring.
- **Fast status check**:
  ```bash
  node tests/get-test-summary.js --compact
  node tests/get-failing-tests.js --history --test "telemetry"
  ```
- **Instrumentation rules**: Emit `telemetry.problem()` whenever SSE payloads are missing or invalid, drop `milestoneOnce` markers for crawl boot/stop, and keep `timelineEvents`, `nonGeoTopicSlugs`, and `problemSummaries` as arrays (never `undefined`).
- **Verification loop (~15s total)**:
  ```bash
  npm run test:file "telemetry-flow.http.test"
  npm run test:file "telemetry-flow.e2e.test"
  npm run test:file "start-button.e2e.test"
  npm run test:file "problems.api.ssr.test"
  ```
- **Post-run checks**: Confirm `terminal_last_command` exit code `0` and record the pass in the analyzer:
  ```bash
  node tests/analyze-test-logs.js --test "telemetry-flow"
  node tests/analyze-test-logs.js --test "problems.api"
  ```
- **Documentation**: Reflect any new telemetry expectations in `docs/TESTING_STATUS.md` (if active) and update this section when workflows change.

---

**🔥 CRITICAL Schema Validation** (October 2025 - Phase 6 Sessions 1-3):

When ALL tests in a suite fail with zero results, suspect schema mismatch BEFORE logic bugs:
```javascript
// ✅ Add schema validation test to catch issues early
test('schema validation', () => {
  const result = db.prepare('INSERT INTO table (col) VALUES (?)').run('value');
  expect(typeof result.lastInsertRowid).toBe('number');
  const row = db.prepare('SELECT * FROM table WHERE id = ?').get(result.lastInsertRowid);
  expect(row).toBeDefined();
  expect(row.id).toBe(result.lastInsertRowid); // Catches TEXT vs INTEGER id bugs
});
```

**Schema Evolution Pattern** (Phase 6 Session 2-3): When removing tables/columns, check ALL code:
```javascript
// ✅ Check table exists before querying removed features
const tableExists = db.prepare(
  "SELECT name FROM sqlite_master WHERE type='table' AND name='old_table'"
).get();
if (!tableExists) return [];
```

**Collateral Wins Pattern** (Phase 6 Session 3): 1 schema fix → 10+ tests pass. **Prioritize schema bugs!**
- 75 tests fixed in 90 minutes = 50 tests/hour (schema-first approach)
- Session 1: 11 tests/60min (structure), Session 2: 38 tests/20min (bugs), Session 3: 26 tests/10min (collateral)

**🔥 CRITICAL WAL Mode Single Connection** (October 2025 - Phase 6 Insight):

In SQLite WAL mode, multiple connections to same database create isolation - writes invisible across connections:
```javascript
// ❌ WRONG: Multiple connections = WAL isolation
beforeEach(() => { app = createApp({ dbPath }); }); // Connection 1
test('...', () => {
  const testApp = createApp({ dbPath }); // Connection 2 - invisible writes!
});

// ✅ RIGHT: Single app per test
beforeEach(() => { tempDbPath = createTempDbPath(); }); // No connection yet
test('...', () => {
  const app = createApp({ dbPath: tempDbPath }); // Single connection
  const db = getDbFromApp(app); // Use SAME connection
});
```

**🔥 CRITICAL Async/Await Misuse** (October 2025 - Phase 6 Session 2):

**Only declare `async` if function uses `await`**. Unnecessary `async` returns Promise instead of value:
```javascript
// ❌ WRONG: async but no await
async function startCrawl() {
  setTimeout(() => { work(); }, 0);
  return { jobId }; // Returns Promise<{ jobId }> - caller gets Promise!
}

// ✅ RIGHT: Remove async
function startCrawl() {
  setTimeout(() => { work(); }, 0);
  return { jobId }; // Returns { jobId } directly
}
```

**See `docs/TESTING_REVIEW_AND_IMPROVEMENT_GUIDE.md` Phase 6 Insights for complete patterns.**

**🔥 CRITICAL: Async Cleanup in Tests**

**⚠️ READ FIRST**: `docs/TESTING_ASYNC_CLEANUP_GUIDE.md` - Complete patterns for preventing "Jest did not exit" warnings.

**Quick Summary**: Jest warning means async operations weren't cleaned up (setImmediate, timers, workers, DB connections, file watchers, event listeners, HTTP servers).

**Common Solutions**:
- Use `--forceExit` for instrumented DB tests
- Shutdown managers: `backgroundTaskManager.shutdown()`, `compressionWorkerPool.shutdown()`
- Stop watchers: `configManager.stopWatching()`
- Close connections: `db.close()`
- Clear timers: Track and clear all setTimeout/setInterval

**See full guide for complete test template, detection commands, and component-specific solutions.**

**🔥 CRITICAL: API Error Detection via Telemetry** (October 2025)

External API failures often return HTTP 200 with error objects in JSON, making them invisible without proper telemetry. The geography crawl debug session took 60+ minutes because API errors weren't surfaced until explicitly logging the response structure.

**Telemetry-First Pattern for External APIs**:
```javascript
const response = await fetch(apiUrl);
const data = await response.json();

// CRITICAL: Check for API-level errors IMMEDIATELY
if (data.error) {
  this.telemetry.problem({
    kind: 'external-api-error',
    scope: 'wikidata-api',
    message: `API error: ${data.error.code || 'unknown'}`,
    details: {
      errorCode: data.error.code,
      errorInfo: data.error.info,
      parameter: data.error.parameter,
      limit: data.error.limit
    }
  });
  // Handle error (throw, return empty, retry, etc.)
}
```

**Why This Matters**:
- PROBLEM events appear in test output immediately (no need to add console.error)
- E2E tests display problem count in summary ("Errors: 3 events")
- Concise one-line format shows error without verbose logs
- Catches issues like "Too many values supplied" (Wikidata 50-entity limit)

**When to Emit PROBLEM Telemetry**:
- ✅ External API returns error object (even with HTTP 200)
- ✅ Rate limit exceeded
- ✅ Invalid response structure (missing expected fields)
- ✅ Partial success (requested 100 items, received 50)
- ✅ Batch operation failures (e.g., batch 3/5 failed, continue with remaining)
- ❌ NOT for expected empty results (zero records found)
- ❌ NOT for normal control flow (cache hit, skip already processed)

**Timeout Discipline and Error Context** (October 2025)

When operations can hang indefinitely (API calls, SSE streams, database operations):

1. **Always use AbortController with timeouts**:
```javascript
const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), 30000);
try {
  const response = await fetch(url, { signal: controller.signal });
  // ... process response
} catch (error) {
  if (error.name === 'AbortError') {
    throw new Error(`Timeout: Operation took longer than 30s`);
  }
  throw error;
} finally {
  clearTimeout(timeout);
}
```

2. **Track last successful operation for debugging**:
```javascript
let lastEventTime = Date.now();
let lastEventType = null;

// In event loop:
lastEventTime = Date.now();
lastEventType = event.type;

// On timeout:
logger.error(`Last event: ${lastEventType} (${Date.now() - lastEventTime}ms ago)`);
```

3. **Batch operations should continue on individual failures**:
```javascript
for (let i = 0; i < batches.length; i++) {
  try {
    await processBatch(batches[i]);
  } catch (error) {
    this.telemetry.problem({
      kind: 'batch-operation-failed',
      message: `Batch ${i+1}/${batches.length} failed: ${error.message}`
    });
    // Continue with remaining batches
  }
}
```

4. **Test timeouts should have descriptive messages**:
```javascript
test('should complete operation', async () => {
  // ... test code
}, 30000); // Jest timeout: 30s - must be longer than internal timeouts
```

**🔥 CRITICAL: Debugging Before Testing**

**Rule of Thumb**: If you've run a test 3+ times without code changes, STOP and add debugging instead.

**Debugging-First Approach**:
1. ❌ **Don't**: Repeatedly run tests hoping for different results
2. ✅ **Do**: Add `console.error()` at decision points, log entry/exit/branches/API responses
3. ✅ **Do**: Add PROBLEM telemetry for API errors (surfaces in test output)
4. ✅ **Do**: Research execution flow before testing
5. ✅ **Only run tests when**: New debugging added OR code changed OR hypothesis formed

**See `docs/TESTING_REVIEW_AND_IMPROVEMENT_GUIDE.md` for complete debugging patterns and examples.**

**Concise E2E Test Output** (Oct 2025):
For development E2E tests that need clean, single-line output:
1. **Suppress console in jest.setup.js**: Check for `GEOGRAPHY_FULL_E2E=1` env var and set `console.log/warn/info/error = () => {}`
2. **Custom reporter**: Create compact reporter that shows errors inline (see `jest-compact-reporter.js`)
3. **LogCondenser utility**: Use `src/utils/LogCondenser.js` for single-line progress (writes to `stderr` to bypass Jest)
4. **Run command**: `npm run test:geography-full` (uses `cross-env` for Windows compatibility)
5. **Output format**: `[•] 0s STEP 1  Setting up` (progress) and `✖ Test Name - Error message` (failures)

**Development E2E Tests**: `geography.full.e2e.test.js` and similar are **development/debugging tools**, not regular tests:
- **Purpose**: Live monitoring of long-running processes (5min-hours) with detailed telemetry
- **Usage**: `npm run test:geography-full` (configured in package.json with environment variables)
- **Requirements**: Must show continuous progress (no silent periods >10s), detailed timing/ETAs, defensive completion detection
- **When to use**: Developing ingestors, debugging crawls, understanding system behavior
- **Documentation**: See `docs/DEVELOPMENT_E2E_TESTS.md` for patterns and examples
- **Not for**: CI/CD, regular TDD, regression testing (too slow/expensive)

**Test-Friendly Code**:
```javascript
✅ const app = createApp({ dbPath, verbose: false });
✅ const manager = new BackgroundTaskManager({ db, silent: true });
❌ console.warn('[Task] Processing...'); // Appears in every test (unless suppressed)
```

**Async Cleanup Checklist**:
- [ ] All `setInterval()` / `setTimeout()` cleared in afterAll/afterEach
- [ ] Worker pools shut down (`.shutdown()` method)
- [ ] Database connections closed (`.close()` method)
- [ ] File watchers stopped (`.stopWatching()` method)
- [ ] Event listeners removed (`.removeAllListeners()`)
- [ ] HTTP servers closed (`.close()` on Express app)
- [ ] Use `--forceExit` for instrumented DB tests (setImmediate issue)

**Creating Concise E2E Tests**:
```javascript
// 1. Create LogCondenser for single-line output (writes to stderr)
const { LogCondenser } = require('../../../utils/LogCondenser');
const logger = new LogCondenser({ startTime: Date.now() });

// 2. Use compact logging methods
logger.info('STEP 1', 'Setting up test environment');
logger.success('OK  ', 'Server running at http://...');
logger.error('ERR ', 'Failed to initialize');

// 3. Configure package.json script with environment variable
"test:my-e2e": "cross-env MY_E2E=1 JEST_DISABLE_TRUNCATE=1 node --experimental-vm-modules node_modules/jest/bin/jest.js --testPathPattern='my.e2e' --reporters=./jest-compact-reporter.js"

// 4. Update jest.setup.js to suppress console for your test
if (process.env.MY_E2E === '1') {
  console.log = () => {};
  console.warn = () => {};
  console.info = () => {};
  console.error = () => {};
}
```

**Test Discipline**: Fix autonomously, report once when done. Don't report after each fix.

**Tests Are Mandatory**: Every new feature/change requires tests. Search for existing tests first, extend them.

**Log Recon Before Reruns**: Jest timing logs (`test-timing-*.log` files in repo root) capture the most recent failures and durations—skim the newest entries and summarize findings before deciding to rerun suites. **ALWAYS check logs before running tests** - saves 30-60 minutes per testing session. See `docs/TESTING_REVIEW_AND_IMPROVEMENT_GUIDE.md` Phase 1 for log consultation procedure.

**🔥 CRITICAL: Iterative Test Fixing Workflow**:
1. **Check logs FIRST** - Read test-timing-*.log files to see what failed, when, and why (may skip test run entirely)
2. **Consult terminal output** - Read the most recent test failure output to identify which tests failed
2. **Run ONLY failed tests** - Use `npm run test:file "specific-pattern"` to run just the failing test files
3. **Fix and verify individually** - Fix one test file, run it, verify it passes, then move to next
4. **NO full suite reruns** - Once you've verified each failing test passes individually, you're DONE
5. **Use terminal history** - Check previous terminal output to see what failed, don't guess

**Example Iteration**:
```bash
# Step 1: Terminal shows Action.test.js and ActionRegistry.test.js failed
# Step 2: Fix Action imports, then run ONLY that test:
npm run test:file "Action.test"
# Step 3: If passes, fix ActionRegistry, run ONLY that test:
npm run test:file "ActionRegistry.test"
# Step 4: Both pass? DONE. No need for full suite rerun.
```

---

## Running Focused Tests

**Windows PowerShell**: `npm test --` does NOT forward `--testPathPattern` properly. Use these instead:

```bash
# ✅ RECOMMENDED: Use test:file script (NO CONFIRMATION REQUIRED)
npm run test:file "dbAccess"
npm run test:file "gazetteer.*http"
npm run test:file "background-tasks.api"

# ✅ Alternative: Direct Jest
node --experimental-vm-modules node_modules/jest/bin/jest.js --testPathPattern="dbAccess"

# ❌ WRONG: Silently runs ALL tests
npm test -- --testPathPattern=dbAccess

# ❌ WRONG: Complex piping REQUIRES CONFIRMATION (DO NOT USE)
npm run test:file "pattern" 2>&1 | Select-String -Pattern "..."
# Use npm run test:file directly - Jest output is already concise
```

**CRITICAL: Always use `npm run test:file` directly**:
- ✅ **NO confirmation required** - runs immediately
- ✅ **Full output visible** - see all passes/failures
- ✅ **Simple single command** - no piping complexity
- ❌ **DO NOT pipe to Select-String** - triggers confirmation dialog
- ❌ **DO NOT chain multiple commands** - triggers confirmation dialog

**Test Categories**:
```bash
npm test                    # Full suite (~75s, 127 files)
npm run test:fast           # Unit only (~30s)
npm run test:integration    # HTTP integration
npm run test:e2e            # Puppeteer E2E
npm run test:file "pattern" # Single file(s) - NO CONFIRMATION
```

---

## Communication Guidelines

**Keep summaries brief** (1-2 sentences, max 1-2 short paragraphs). No multi-section reports with headers/bullets/tables.

**Exception: Complex Multi-File Problems** (October 2025):
When investigating failures or bugs involving multiple code files, architectural patterns, or cross-system interactions, provide a **detailed report** covering:
- **Root Cause**: Clear explanation of why the issue occurs
- **What the Code Does**: Actual behavior with code snippets
- **What Should Happen**: Expected behavior with examples
- **Why Each Symptom Occurs**: Map symptoms to root causes
- **Architecture Context**: How systems interact, what's missing
- **Fix Options**: Ranked by recommendation with code examples
- **Evidence**: Terminal output, database states, file locations

Example scenario: Test failures where the problem isn't obvious, database/API integration issues, event system bugs, or architectural mismatches. The detailed report helps understand context before fixing.

**⚠️ CRITICAL: Page Optimization Requirements** (October 2025):
When asked to "optimize a page" or "make a page faster", **ALWAYS** implement **BOTH**:
1. **Server-side optimizations**:
   - Query optimization (eliminate N+1, use JOINs)
   - Database indexes (composite indexes on sort/filter columns)
   - Efficient data structures and algorithms
   - Response payload optimization

2. **Client-side optimizations** (MANDATORY):
   - Add `?limit=N` parameters to API calls (don't fetch unlimited data)
   - Implement client-side caching (5-30 second TTL)
   - Reduce payload sizes (100 items vs 200, fetch only needed fields)
   - Add loading states (prevent double-clicks, show feedback)
   - Debounce rapid requests (search inputs, scroll events)
   - Lazy loading for large lists/tables

**Example**: "The queues page is slow" → Fix both:
- Server: Optimize `listQueues()` query, add indexes
- Client: Add `?limit=50` to fetch, cache results for 5s, reduce events from 200→100

**Why both matter**: A 2ms server query is useless if client fetches unlimited data without caching.

---

## Debugging Child Process Issues

**Critical Understanding**: The UI server spawns crawlers as **child processes**. Their console.log output goes to the child process stdout, NOT the server console directly.

**How to Debug Child Process Hangs**:

1. **Structured Output Method** (Preferred):
   - Child process uses structured output: `PROGRESS`, `MILESTONE`, `TELEMETRY`, `PROBLEM`, `QUEUE`
   - These are parsed by `JobEventHandlerService` and broadcast via SSE
   - Add MILESTONE events instead of console.log for critical checkpoints:
     ```javascript
     this.telemetry.milestoneOnce('debug:checkpoint-name', {
       kind: 'debug',
       message: 'Checkpoint description',
       details: { contextInfo: 'value' }
     });
     ```
   - Watch browser console or SSE logs panel for these events

2. **Direct Test Method**:
   - Create a direct test script (not via server/child process)
   - Example: `test-geography-direct.js` runs crawler directly in same process
   - All console.log statements visible immediately in terminal
   - Use for pinpointing exact blocking location

3. **SSE Log Inspection**:
   - Non-structured console.log from child goes through SSE as log events
   - Check browser's Network tab → Events stream for all child output
   - Or enable verbose logging: open `/events?logs=1` endpoint

4. **Server Console Output**:
   - Some child output logged to server console if matching patterns
   - Look for `[child:stdout]` prefix in server terminal
   - See `JobEventHandlerService._handleStructuredOutput()` for patterns

**When Child Process Hangs**:
- Add MILESTONE events before/after suspected blocking code
- Use Promise.race() with timeout for async operations
- Check if operation is synchronous DB call that might deadlock
- Verify WAL mode isn't causing connection isolation issues

## Anti-Patterns to Avoid

❌ Reading 20+ files before coding (analysis paralysis)  
❌ CommonJS in UI code (use ES6 `import/export`)  
❌ Importing modules without calling initialization functions  
❌ Multiple DB connections in tests (WAL isolation)  
❌ Features without tests  
❌ Complex PowerShell commands requiring approval (use `replace_string_in_file` tool)  
❌ Status updates mid-work (work autonomously, report once when complete)  
❌ Using console.log to debug child processes (use MILESTONE/TELEMETRY structured output instead)  
❌ **Referencing variables/functions before they're initialized** ← NEW: CRITICAL  
❌ **Modifying data viewing tools to fix data quality issues** ← NEW: CRITICAL

✅ Check attachments FIRST → search for pattern → read example → START CODING  
✅ Use app's shared DB connection in tests  
✅ Call factory functions after importing them  
✅ Create tests alongside implementation  
✅ Use `replace_string_in_file` for file edits  
✅ Fix all test failures, then report once  
✅ **Check initialization order when adding code to server.js** ← NEW  
✅ **Fix data quality at the source (ingestors), not in viewing tools** ← NEW: CRITICAL

---

## Data Quality Principles ⚠️ CRITICAL

**Problem**: Data viewing tools show incorrect data (e.g., "Srilanka" not recognized as country)

**WRONG Approach** ❌:
- Modify the viewing tool to handle edge cases
- Add special case logic to list/display tools
- Work around data issues in presentation layer

**RIGHT Approach** ✅:
1. **Diagnose the root cause**: Why was the data ingested incorrectly?
2. **Fix at the source**: Improve ingestor robustness (handle "srilanka" → "Sri Lanka")
3. **Create correction tools**: Build tools in `tools/corrections/` to fix existing data
4. **Prevent recurrence**: Add validation/normalization to ingestors

**Example (October 2025)**:
- Issue: `place_slug` "srilanka" not matching gazetteer "Sri Lanka"
- Wrong: Modify `list-place-hubs` to handle slug variations
- Right: Create `tools/corrections/fix-place-hub-names.js` to normalize slugs
- Right: Improve ingestor to normalize place names during discovery

**Key Principle**: **Viewing tools should be dumb**. All intelligence belongs in:
1. **Ingestors** (data acquisition)
2. **Correction tools** (fixing historical data)
3. **Validation** (catching issues early)

**Correction Tools Pattern**:
- Location: `tools/corrections/` directory
- Purpose: One-time fixes for data quality issues
- Naming: `fix-{specific-issue}.js` (e.g., `fix-place-hub-names.js`)
- Idempotent: Safe to run multiple times
- Documented: Clear explanation of what they fix and why

---

## 🔥 CRITICAL: Initialization Order in server.js (October 2025)

**Problem**: ReferenceError when accessing variables/functions before they're defined.

**Example Error** (October 2025):
```javascript
// ❌ WRONG: Using getDbRW() before it's created (line 339)
const enhancedDbAdapter = new EnhancedDbAdapter({
  jobRegistry,
  db: getDbRW(),  // ← ReferenceError: Cannot access 'getDbRW' before initialization
  logger: verbose ? console : { error: console.error, warn: () => {}, log: () => {} }
});

// ... 80 lines later ...

// getDbRW is created here (line 416)
const getDbRW = createWritableDbAccessor({
  ensureDb: ensureDbFactory,
  urlsDbPath,
  queueDebug,
  verbose,
  logger: console
});
```

**Root Cause**:
- JavaScript const/let have **temporal dead zone** - cannot be accessed before declaration
- server.js `createApp()` function has ~800 lines with complex initialization sequence
- Easy to add code in wrong location without checking dependencies

**Prevention Strategy**:
1. **Search for dependencies BEFORE adding code**: Use `grep_search` to find where variables are defined
2. **Read surrounding context**: Check 20-30 lines before/after your insertion point
3. **Verify initialization order**: Ensure all variables you reference are defined earlier in the file
4. **Group related initializations**: Keep dependent code close to its dependencies
5. **Add initialization comments**: Mark sections like "// Database setup" or "// After getDbRW is defined"

**Fix Pattern**:
```javascript
// ✅ RIGHT: Move initialization AFTER dependencies are defined
const getDbRW = createWritableDbAccessor({ ... });  // Line 416

// ... later, after getDbRW exists ...

// Create enhanced DB adapter for coverage API (after getDbRW is defined)
const enhancedDbAdapter = new EnhancedDbAdapter({
  jobRegistry,
  db: getDbRW(),  // ← Now safe to call
  logger: verbose ? console : { error: console.error, warn: () => {}, log: () => {} }
});
```

**When Adding New Code to server.js**:
1. ✅ **STEP 1**: Identify what variables/functions your code needs
2. ✅ **STEP 2**: Search file to find where they're defined: `grep_search` with variable name
3. ✅ **STEP 3**: Read 30+ lines around your intended insertion point
4. ✅ **STEP 4**: Verify all dependencies are initialized BEFORE your insertion point
5. ✅ **STEP 5**: If not, move your code AFTER the last dependency initialization
6. ✅ **STEP 6**: Add a comment explaining why it's placed there

**server.js Initialization Sequence** (for reference):
1. Lines 1-200: Imports and function definitions
2. Lines 200-330: Options parsing, jobRegistry, intelligentCrawlerManager, realtime setup
3. Lines 330-420: Broadcast functions, planning session manager, **getDbRW created here (line 416)**
4. Lines 420-520: Async plan runner, config watchers
5. Lines 520+: Database initialization, background task manager, Express app setup

---

## PowerShell Command Guidelines

**AVOID complex commands requiring approval**. Use tools instead:

```powershell
# ❌ WRONG: Complex regex replace (requires approval)
(Get-Content "file.js") -replace 'pattern', 'replacement' | Set-Content "file.js"

# ✅ RIGHT: Use replace_string_in_file tool
replace_string_in_file({ filePath, oldString, newString })
```

**Simple commands are OK**:
```powershell
✅ Test-Path "file.js"
✅ Get-Content "file.log"
✅ Get-Content "file.log" | Select-Object -Last 20
Get-ChildItem "directory"

# Simple process operations
node server.js --detached --auto-shutdown-seconds 10
npm test
npm run build

# Simple output formatting (no complex logic)
command 2>&1 | Select-String "pattern"
command | Select-Object -First 10
```

---

## Build Process

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

**CRITICAL**: Every code change requires tests. Write tests alongside (not after) implementation.

**For Comprehensive Test Fixing**: See `docs/TESTING_REVIEW_AND_IMPROVEMENT_GUIDE.md` for systematic test fixing process, including Phase 6 insights on common failure patterns.

**Test Types**:
- **Unit tests**: Mock external dependencies (DB, network, file system)
- **Integration tests**: Use real DB/APIs to verify end-to-end behavior
- **API tests**: Test endpoints with actual HTTP requests

**TDD Workflow**:
1. **Check test logs first**: Read `test-timing-*.log` files to see recent failures (saves 30-60 min)
2. Search for existing tests covering code you'll modify
3. Write new test stubs before implementation
4. Implement incrementally: code → test → next feature
5. Fix test failures immediately before proceeding
6. Only mark complete when all tests pass

**Rule of Thumb**: New file → new test file. Modified endpoint → updated tests. Failing tests = incomplete work.

**Common Pitfalls** (October 2025):
- ✅ **Check schema before logic**: Schema bugs are silent (TEXT vs INTEGER id)
- ✅ **One app per test**: Multiple connections in WAL mode = isolation
- ✅ **Fix in layers**: Structure → logic → data → assertions
- ✅ **Use targeted runs**: `npm run test:file "pattern"` (5s) vs full suite (hangs)

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
(Get-Content "file.js") -replace 'const config = JSON\.parse\(taskRes\.body\.task\.config\);', 'const config = taskRes.body.task.config; // Already parsed by API' | Set-Content "file.js"

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

**Status**: Ready for Implementation (2025-10-06)  
**Main Document**: `docs/DATABASE_NORMALIZATION_PLAN.md`  
**Quick Start**: `docs/PHASE_0_IMPLEMENTATION.md` ⭐ **START HERE**

The project has identified significant opportunities for database normalization and compression infrastructure. A comprehensive 80+ page plan has been developed that enables schema evolution **without requiring immediate export/import cycles**.

### Implementation Documents

1. **`docs/PHASE_0_IMPLEMENTATION.md`** ⭐ — **Ready-to-run Phase 0 code**
   - Complete module implementations with tests
   - Schema version tracking infrastructure
   - Database exporter for backups/analytics
   - CLI tool for migration management
   - Zero risk (no schema changes)
   - Time: 1-2 days

2. **`docs/COMPRESSION_IMPLEMENTATION_FULL.md`** ⭐ — **Complete gzip + brotli implementation (all levels)**
   - 17 compression variants: gzip (1-9), brotli (0-11), zstd (3, 19)
   - Ultra-high quality brotli (levels 10-11) with 256MB memory windows
   - Full compression utility module with auto-selection
   - Bucket compression supporting both gzip and brotli
   - Benchmarking tool for compression ratio testing
   - Expected: 70-85% database size reduction, 6-25x compression ratios
   - Time: 2-4 hours for full implementation

3. **`docs/COMPRESSION_TABLES_MIGRATION.md`** — Quick-start guide for adding tables
   - `compression_types` table seeding
   - `compression_buckets` and `content_storage` tables
   - Code examples for basic usage
   - Time: 30 minutes to add tables

3. **`docs/DATABASE_NORMALIZATION_PLAN.md`** - Full technical specification (80+ pages)
4. **`docs/SCHEMA_NORMALIZATION_SUMMARY.md`** - Executive summary with priorities
5. **`docs/SCHEMA_EVOLUTION_DIAGRAMS.md`** - Visual architecture diagrams
6. **`docs/COMPRESSION_BUCKETS_ARCHITECTURE.md`** - Bucket lifecycle and caching strategies

### Key Innovations

1. **Migration-Free Normalization**: Add new normalized tables alongside existing schema, use dual-write + views for compatibility, gradually migrate data
2. **Compression Infrastructure**: Individual compression (zstd/gzip) + bucket compression (20x for similar files)
3. **Backward Compatibility**: Views reconstruct denormalized tables for zero-downtime migration
4. **Programmatic Groundwork**: Complete migration infrastructure (exporter, importer, transformer, validator) ready for future use

### Current Schema Issues Identified

**Critical Denormalization** (articles table):
- 30+ columns mixing URL identity, HTTP metadata, content, timing, and analysis
- Duplicate data between `articles` and `fetches` tables
- Cannot efficiently query just HTTP metadata or just content

**Proposed Normalized Schema**:
- `http_responses`: Pure HTTP protocol metadata
- `content_storage`: Content with compression support (inline, compressed, bucket)
- `content_analysis`: Analysis results (multiple versions per content)
- `discovery_events`: How URLs were discovered
- `compression_types` + `compression_buckets`: Compression infrastructure
- `place_provenance` + `place_attributes`: Normalized gazetteer provenance

### Implementation Strategy (No Breaking Changes)

**Phase 0-1 (Weeks 1-4)**: Infrastructure + add new tables
- Migration modules: exporter, importer, transformer, validator
- Add normalized tables without modifying existing tables
- Record as schema version 2

**Phase 2-3 (Weeks 5-10)**: Dual-write + backfill
- Write to both old and new schemas
- Backfill historical data incrementally
- Create backward compatibility views

**Phase 4-5 (Weeks 11-20)**: Cutover + cleanup
- Switch reads to views, then to normalized tables
- Archive legacy tables after validation period
- 40-50% database size reduction expected

### Compression Performance

| Method | Compression Ratio | Access Time | Use Case |
|--------|------------------|-------------|----------|
| Uncompressed | 1.0x | <1ms | Hot data |
| zstd level 3 (individual) | 3.0x | ~2ms | Warm data |
| zstd level 19 (bucket) | 19.6x | ~150ms (first), <1ms (cached) | Cold data, archives |

### Next Steps

1. Review `docs/DATABASE_NORMALIZATION_PLAN.md` for full technical details
2. Decide on implementation timeline (can proceed incrementally)
3. Begin Phase 0: Create migration infrastructure modules
4. Begin Phase 1: Add normalized tables (no breaking changes)

**Critical**: The plan enables future schema changes without export/import cycles by using dual-write and views during transition.

---

## Intelligent Crawl Startup Analysis (Rapid Iteration Workflow)

**Purpose**: Rapidly iterate on dense, informative startup output for intelligent crawls in seconds rather than minutes.

**Quick Start**:
```bash
# Analyze first 100 lines of startup (recommended)
node tools/intelligent-crawl.js --limit 100

# Quick check (50 lines)
node tools/intelligent-crawl.js --limit 50

# Extended analysis (200 lines)
node tools/intelligent-crawl.js --limit 200
```

**Workflow**: Use `--limit N` to display only first N lines, enabling rapid testing of startup reporting improvements without waiting for full crawl completion.

**Key Benefits**:
- ✅ Test startup changes in <30 seconds per iteration
- ✅ Verify database status, gazetteer coverage, missing hubs in first 100 lines
- ✅ Optimize information density (single-line summaries, inline lists)
- ✅ Debug initialization without full crawl overhead

**Target Output** (first 100 lines should show):
- Database size, article count, place count, country count
- Country hub coverage (X cached, Y missing [names listed])
- Topic hub coverage (categories cached)
- DSPL loading status (learned patterns for domains)
- Feature flags enabled (abbreviated)
- Intelligent plan preview (hub count, coverage prediction)

**Logging Discipline** (applies to all intelligent crawl components):
- ✅ Log once at initialization with summary statistics
- ✅ Batch operations: "Generated 50 URLs for 50 countries" not 50 separate lines
- ✅ Single-line summaries with counts, not per-item messages
- ❌ Never repeat identical log messages in loops
- ❌ No verbose per-country/per-URL logging during planning

**Full Documentation**: `docs/INTELLIGENT_CRAWL_OUTPUT_LIMITING.md` ⭐ **Complete workflow guide**

**Related Tools**:
- `tools/db-schema.js` - Query database structure without approval dialogs
- `tools/db-query.js` - Run read-only queries for status checks
- See "Database Schema Tools" section in AGENTS.md

---

*This refactoring transforms the codebase into a more idiomatic, maintainable state while preserving all existing functionality. Follow the workflow systematically, test continuously, and document progress transparently.*