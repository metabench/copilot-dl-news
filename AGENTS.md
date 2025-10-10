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
- 🌍 Geography crawl → `GEOGRAPHY_CRAWL_TYPE.md`, `GEOGRAPHY_E2E_TEST.md`
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
- 🧰 Query module conventions → `src/db/sqlite/queries/README.md`

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
- 📉 Analysis page issues → `ANALYSIS_PAGE_ISSUES.md`
- 🔍 Child process debugging → `DEBUGGING_CHILD_PROCESSES.md`
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
- 📖 Operations guide → `RUNBOOK.md`
- ⚙️ Configuration reference → `docs/CONFIGURATION_GUIDE.md`
- 🗺️ Project roadmap → `ROADMAP.md`
- ⚡ Rapid feature mode → `RAPID_FEATURE_MODE.md`
- ⚡ Rapid feature chatmode → `.github/chatmodes/Rapid Features.chatmode.md`
- 🧪 Server root verification → `SERVER_ROOT_VERIFICATION.md`
- 🌐 Geography progress log → `GEOGRAPHY_PROGRESS_IMPLEMENTATION.md`
- � Geography fixes summary → `GEOGRAPHY_CRAWL_FIXES_SUMMARY.md`
- �📊 News website stats cache → `NEWS_WEBSITES_STATS_CACHE.md`
- 🔬 Test performance results → `docs/TEST_PERFORMANCE_RESULTS.md`

**System Components & Architecture**
- 🧩 Component overview → `COMPONENTS.md`
- 🚀 Enhanced features → `ENHANCED_FEATURES.md` (crawler intelligence, priority system)
- 🔄 Architecture update log → `docs/ARCHITECTURE_UPDATE_CRAWLS_VS_TASKS.md`
- 📡 SSE shutdown design → `SSE_CLOSURE_ARCHITECTURE.md`

**Advanced Planning (Future)**
- 🤖 GOFAI planning → `GOFAI_ARCHITECTURE.md` (not in execution path)
- 🔮 Async planner → `ASYNC_PLANNER_PREVIEW.md`
- 🎯 Advanced suite → `ADVANCED_PLANNING_SUITE.md`
- 🔌 Integration design → `ADVANCED_PLANNING_INTEGRATION_DESIGN.md`

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
- 📋 Phase 6 assessment → `PHASE_6_ASSESSMENT.md`

### When to Read Which Docs

| If you need to... | Read this first | Then read (if needed) |
|------------------|----------------|----------------------|
| Understand system architecture | `ARCHITECTURE_CRAWLS_VS_BACKGROUND_TASKS.md` ⭐ | `SERVICE_LAYER_ARCHITECTURE.md` |
| Understand system components | `COMPONENTS.md` | `ENHANCED_FEATURES.md` |
| Work with services | `docs/SERVICE_LAYER_GUIDE.md` ⭐ | `SERVICE_LAYER_ARCHITECTURE.md` |
| Fix failing tests systematically | `docs/TESTING_REVIEW_AND_IMPROVEMENT_GUIDE.md` ⭐ | `docs/TESTING_STATUS.md` (current state) |
| Check current test status | `docs/TESTING_STATUS.md` ⭐ | `docs/TESTING_REVIEW_AND_IMPROVEMENT_GUIDE.md` |
| Implement API consumers | `docs/API_ENDPOINT_REFERENCE.md` ⭐ | `ARCHITECTURE_CRAWLS_VS_BACKGROUND_TASKS.md` |
| Implement geography crawl | `GEOGRAPHY_CRAWL_TYPE.md` | `GAZETTEER_BREADTH_FIRST_IMPLEMENTATION.md` |
| Fix crawl not showing up | `ARCHITECTURE_CRAWLS_VS_BACKGROUND_TASKS.md` | `GEOGRAPHY_E2E_INVESTIGATION.md` |
| Add background task | `BACKGROUND_TASKS_COMPLETION.md` | `ANALYSIS_AS_BACKGROUND_TASK.md` (example) |
| Get database connection | AGENTS.md (in-file section) | `DATABASE_INITIALIZATION_ARCHITECTURE_ANALYSIS.md` |
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
5. ❌ Don't create docs for simple one-off fixes

**Documentation Hierarchy**:
```
AGENTS.md (Central hub, patterns, quick reference)
    ↓
ARCHITECTURE_*.md (System design, component interaction)
    ↓
BACKGROUND_TASKS_*.md, ANALYSIS_*.md, etc. (Feature-specific)
    ↓
Code comments (Implementation details)
```

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

## �🚨 CRITICAL COMMAND RULES 🚨

**NEVER USE POWERSHELL COMMANDS THAT REQUIRE USER APPROVAL**

If you're about to run a command that:
- Uses `Get-Content ... | Set-Content` pipelines
- Has complex regex patterns with `-replace`
- Chains multiple commands with semicolons (`;`)
- Uses `ForEach-Object` with complex logic
- Has backquotes (`` ` ``) for line continuation
- Is longer than ONE simple line

**→ STOP! Use a tool instead:**
- ✅ `replace_string_in_file` - for editing files (95% of cases)
- ✅ `read_file` - for reading file contents
- ✅ `grep_search` - for searching in files
- ✅ `file_search` - for finding files

**Simple commands that ARE okay:**
- ✅ `Test-Path "file.js"`
- ✅ `Get-Content "file.log" | Select-Object -Last 20`
- ✅ `node server.js --detached --auto-shutdown-seconds 10`

**🔥 CRITICAL: Avoid ALL Complex PowerShell Commands**

**ABSOLUTE RULE**: If a PowerShell command might require user authorization, **DO NOT USE IT**. Period.

**Commands that ALWAYS require authorization (NEVER USE)**:
- ANY piping to `Select-String`, `Select-Object`, `ForEach-Object`, `Where-Object` when combined with other operations
- ANY multi-line commands or commands with backticks
- ANY `Get-Content | Set-Content` patterns
- ANY commands with complex regex or string manipulation
- ANY chained commands with semicolons beyond simple navigation
- Running `npm test` without specific test pattern (takes too long, requires authorization for output parsing)

**The ONLY safe patterns**:
```powershell
# ✅ SAFE: Single file operations
Test-Path "file.js"
Get-ChildItem
npm run test:file "specific-pattern"  # Focused test ONLY

# ❌ NEVER: Output parsing or chaining
npm test 2>&1 | Select-String -Pattern "..."  # ← REQUIRES AUTHORIZATION
Get-Content file.js | Select-String "..."  # ← REQUIRES AUTHORIZATION
command1; command2  # ← REQUIRES AUTHORIZATION if complex
```

**For ANY data extraction or analysis**: Use file-based tools instead:
- ✅ `read_file` to read content
- ✅ `grep_search` to search files  
- ✅ `file_search` to find files
- ❌ NEVER use PowerShell piping/filtering

**🔥 CRITICAL: Don't Run Commands in Terminals with Background Processes**

When you start a background server with `--detached` or `isBackground: true`, that terminal becomes **dedicated to that background process**. Running ANY subsequent command in that same terminal (even simple commands) can:
- Interrupt or terminate the background process
- Kill the detached server
- Cause the background process to lose its output stream
- Leave processes in inconsistent states

```powershell
# ❌ WRONG: Running commands in a terminal with a background server
Terminal ID: abc123
> node server.js --detached --auto-shutdown-seconds 30  # Server starts in background
> curl http://localhost:3000/api/test  # ← KILLS THE SERVER!

# ✅ RIGHT: Check background process output, don't run new commands
Terminal ID: abc123
> node server.js --detached --auto-shutdown-seconds 30  # Server starts in background
# Use get_terminal_output tool to check server logs
# DON'T run any more commands in this terminal!

# ✅ RIGHT: Use a different approach entirely
# Run the E2E test suite instead (it manages server lifecycle)
# Or read existing server logs from log files
```

**Why this matters**:
- Background processes in terminals are fragile
- ANY command in that terminal can interrupt the background process
- Even "harmless" commands like `curl`, `echo`, or `Get-Content` can kill servers
- The terminal's input/output stream is shared with the background process

**Best practice**: 
- ❌ **NEVER run additional commands in a terminal that has a background process**
- ✅ Use `get_terminal_output` tool to check background process logs (read-only)
- ✅ Run E2E tests instead of starting servers manually
- ✅ Read existing log files from disk
- ✅ Add debugging code to source files (console.error writes to process stderr)

**🔥 CRITICAL: PowerShell curl is NOT Unix curl**

PowerShell has a `curl` alias that points to `Invoke-WebRequest` with **completely different syntax**:

```powershell
# ❌ WRONG: Unix curl syntax (will fail in PowerShell)
curl -X POST http://localhost:3000/api/crawl -H "Content-Type: application/json" -d '{"key":"value"}'
# Error: "Cannot bind parameter 'Headers'" 

# ✅ RIGHT: Use Invoke-WebRequest with PowerShell syntax (but see note below)
Invoke-WebRequest -Uri "http://localhost:3000/api/crawl" -Method POST -ContentType "application/json" -Body '{"key":"value"}' -UseBasicParsing

# ✅ EVEN BETTER: Don't test APIs manually - use E2E tests or read logs
```

**Best practice for API testing**: 
- ❌ Don't manually test APIs with curl/Invoke-WebRequest when debugging
- ✅ Run the E2E test suite (designed for this purpose)
- ✅ Read existing server logs and terminal output
- ✅ Use debugging code in the source files (console.error)

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
node tests/get-test-summary.js            # Quick overview (5s)
node tests/get-failing-tests.js           # List failures (5s)
node tests/get-latest-log.js              # Get log path (2s)
node tests/get-slow-tests.js              # Performance check (5s)
```

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

## Project Structure

**UI Styles**: `src/ui/express/public/styles/*.scss` → `npm run sass:build`  
**UI Components**: `src/ui/public/**/*.js` → `node scripts/build-ui.js` → `src/ui/express/public/assets/`  
**Server**: `src/ui/express/server.js` serves `/assets/` (built), `/theme/` (shared)  
**Database**: SQLite WAL mode via better-sqlite3 (`src/db/sqlite/ensureDb.js`)

### Crawls vs Background Tasks ⚠️ CRITICAL

**See**: `docs/ARCHITECTURE_CRAWLS_VS_BACKGROUND_TASKS.md` for complete details.

This project has **two distinct systems**:

1. **Crawls (Foreground)** - `src/crawler/`
   - **Purpose**: Fetch content from external websites (BBC, Wikidata, etc.)
   - **Manager**: `CrawlOrchestrationService` + `JobRegistry` + `JobEventHandlerService`
   - **Execution**: Node.js child processes (isolated)
   - **Duration**: Minutes to hours
   - **Tables**: `crawl_jobs`, `queue_events`
   - **API**: `/api/crawl`, `/api/crawls/:id/*`
   - **UI**: `/crawls` page
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

---

## How to Get a Database Handle (SIMPLIFIED - October 2025)

**Status**: Simplified from 4 layers to 2 layers for clarity and maintainability.

### Simple Usage (Most Common)

```javascript
const { ensureDatabase } = require('../db/sqlite');

// Open database with schema initialized
const db = ensureDatabase('/path/to/db.sqlite');

// Use directly with better-sqlite3 API
const stmt = db.prepare('SELECT * FROM articles WHERE host = ?');
const articles = stmt.all('example.com');
```

### With Query Telemetry (For Cost Estimation)

```javascript
const { ensureDatabase, wrapWithTelemetry } = require('../db/sqlite');

// Step 1: Open database
const db = ensureDatabase('/path/to/db.sqlite');

// Step 2: Wrap with telemetry tracking
const instrumentedDb = wrapWithTelemetry(db, { 
  trackQueries: true,
  logger: console 
});

// Queries are now tracked in query_telemetry table for QueryCostEstimatorPlugin
const stmt = instrumentedDb.prepare('SELECT * FROM places WHERE kind = ?');
const countries = stmt.all('country');
```

### In Tests (CRITICAL: Single Connection Pattern)

```javascript
const { createApp } = require('../src/ui/express/server');

beforeEach(() => {
  // Let createApp initialize the database
  app = createApp({ dbPath: createTempDb(), verbose: false });
  
  // Use app's shared connection (REQUIRED for WAL mode)
  const db = app.locals.backgroundTaskManager?.db || app.locals.getDb?.();
  
  // Seed data using SAME connection
  seedArticles(db, 10);
  
  // All queries will see seeded data (no WAL isolation)
});

afterEach(() => {
  // Clean up WAL files
  const suffixes = ['', '-shm', '-wal'];
  for (const suffix of suffixes) {
    try { fs.unlinkSync(dbPath + suffix); } catch (_) {}
  }
});
```

**Why Single Connection Matters**:
- SQLite WAL mode isolates writes between connections
- Creating multiple connections causes test data to be invisible
- Always use `app.locals.getDb()` or `app.locals.backgroundTaskManager.db`
- ❌ **NEVER** do `new Database(dbPath)` separately in tests

### Low-Level Access (Rare)

```javascript
const { openDatabase } = require('../db/sqlite');

// Just open connection without schema initialization
const db = openDatabase('/path/to/db.sqlite', { 
  readonly: false 
});

// Manually initialize schema if needed
const { initializeSchema } = require('../db/sqlite/schema');
initializeSchema(db, { verbose: true });
```

### Architecture Overview

**Before (4 Layers - Confusing)**:
```
ensureDb() → createWritableDbAccessor() → baseGetDbRW() → createInstrumentedDb() → getDbRW()
```

**After (2 Layers - Clear)**:
```
ensureDatabase() → wrapWithTelemetry() (optional) → getDb()
```

### Migration Notes

**Legacy code** may still use:
- `ensureDb()` - old function, still works but deprecated
- `getDbRW()` / `getDbRO()` - aliases to `getDb()`, same connection
- `createWritableDbAccessor()` - old wrapper, no longer needed

**New code** should use:
- `ensureDatabase()` - replaces `ensureDb()`
- `wrapWithTelemetry()` - replaces `createInstrumentedDb()` (with import!)
- `getDb()` - clear, simple name

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

**🚨 CRITICAL: USE THE SPECIALIZED TESTING DOCUMENTATION 🚨**

When working on tests (fixing, reviewing, debugging), **READ THESE FIRST**:
1. **`docs/TESTING_REVIEW_AND_IMPROVEMENT_GUIDE.md`** ⭐ **START HERE** - Systematic test fixing process
2. **`docs/TESTING_STATUS.md`** - Current test state, what's failing, what's fixed
3. **`docs/TESTING_ASYNC_CLEANUP_GUIDE.md`** - Async test patterns, preventing hangs
4. **`docs/TEST_TIMEOUT_GUARDS_IMPLEMENTATION.md`** - Timeout prevention patterns

**This section contains QUICK REFERENCE only. Full details are in the specialized docs above.**

---

### Quick Reference: Core Testing Rules

**🚨 GOLDEN RULE: Tests Must Never Hang Silently**

If a test gets stuck, it MUST output to console explaining what it's waiting for. Implementation:
- Always set explicit timeouts: `test('name', async () => {...}, 30000)`
- Add progress logging for operations >5s: `console.log('[TEST] Starting step X...')`
- Use AbortController with timeouts for network calls
- Add watchdog timers that report last completed step
- **See `docs/TESTING_ASYNC_CLEANUP_GUIDE.md` for complete patterns**

**🚨 CRITICAL: Verify Test Results After Every Run** (October 2025):

**The Problem**: VS Code task output shows "The task succeeded with no problems" even when tests fail (exit code 1). This creates FALSE POSITIVES where agents believe tests passed when they actually failed or hung.

**Prevention Pattern**:
```bash
# Step 1: Run test
npm test -- --testNamePattern=e2e

# Step 2: ALWAYS verify with terminal_last_command tool
# Check exit code: 0 = pass, 1 = fail

# Step 3: Read terminal output for details
# Look for: "Test Suites: X failed, Y passed"
# Look for: "Tests: X failed, Y passed"
# Look for: Tests still in "RUNS" state (indicates hang)
# Look for: Slow tests "🐌 359.67s" (often indicates hang)
```

**Red Flags for Hanging Tests**:
- Exit code 1 but task says "succeeded"
- E2E test taking >60 seconds (e.g., "🐌 359.67s")
- Test file listed as "RUNS" at end of output
- Total time >400s for E2E suite (indicates hangs)

**Test Console Output**: Keep <100 lines. Add noisy patterns to `jest.setup.js` DROP_PATTERNS.

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

**🔥 CRITICAL: Avoiding Open Async Handles in Tests**

Jest warning "Jest did not exit one second after the test run has completed" means async operations weren't cleaned up.

**Common Causes**:
1. `setImmediate()` in database instrumentation layer (query telemetry)
2. `setInterval()` / `setTimeout()` not cleared
3. Worker threads not terminated
4. Database connections not closed
5. File system watchers (ConfigManager) not stopped
6. Event emitters with active listeners
7. HTTP servers still listening

**Detection**:
```bash
# Use --detectOpenHandles to identify the source
node --experimental-vm-modules node_modules/jest/bin/jest.js src/test.js --detectOpenHandles

# Use --forceExit as temporary workaround (NOT a fix)
node --experimental-vm-modules node_modules/jest/bin/jest.js src/test.js --forceExit
```

**Solutions by Component**:

1. **Database Instrumentation (setImmediate)**:
   - Root cause: `src/db/sqlite/instrumentation.js` uses `setImmediate()` for async query logging
   - Solutions:
     a. Use `--forceExit` flag in tests (quick fix)
     b. Mock instrumentation layer in tests (avoid real setImmediate)
     c. Create uninstrumented DB for tests: `openDatabase()` instead of `wrapWithTelemetry()`

2. **BackgroundTaskManager**:
   ```javascript
   afterAll(async () => {
     if (app.locals.backgroundTaskManager) {
       await app.locals.backgroundTaskManager.shutdown();
     }
   });
   ```

3. **CompressionWorkerPool**:
   ```javascript
   afterAll(async () => {
     if (app.locals.compressionWorkerPool) {
       await app.locals.compressionWorkerPool.shutdown();
     }
   });
   ```

4. **ConfigManager (File Watchers)**:
   ```javascript
   afterAll(() => {
     if (app.locals.configManager?.stopWatching) {
       app.locals.configManager.stopWatching();
     }
   });
   ```

5. **Database Connections**:
   ```javascript
   afterAll(() => {
     const db = app.locals.getDbRW?.();
     if (db?.close) db.close();
   });
   ```

**Complete Test Template**:
```javascript
const { createApp } = require('../server');
const { openDatabase } = require('../db/sqlite/connection'); // Uninstrumented!

describe('My Test Suite', () => {
  let app;
  let dbPath;

  beforeAll(() => {
    dbPath = createTempDb();
    app = createApp({ dbPath, verbose: false });
  }, 3000); // Explicit timeout

  afterAll(async () => {
    // Shutdown in reverse order of creation
    
    // 1. Stop background services
    if (app.locals.backgroundTaskManager) {
      await app.locals.backgroundTaskManager.shutdown();
    }
    if (app.locals.compressionWorkerPool) {
      await app.locals.compressionWorkerPool.shutdown();
    }
    if (app.locals.configManager?.stopWatching) {
      app.locals.configManager.stopWatching();
    }
    
    // 2. Close database
    const db = app.locals.getDbRW?.();
    if (db?.close) db.close();
    
    // 3. Allow async operations to complete
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // 4. Clean up temp files
    cleanupDbFiles(dbPath);
  });

  test('my test', async () => {
    // Test code here
  }, 2000); // Per-test timeout
});
```

**Jest Configuration**:
```javascript
// jest.config.js or package.json
{
  "testTimeout": 5000,        // Global timeout (5s)
  "forceExit": true,          // Force exit despite open handles (use with caution)
  "detectOpenHandles": false  // Don't detect in CI (slows tests)
}
```

**When to Use --forceExit**:
- ✅ Tests that create instrumented databases (setImmediate in query telemetry)
- ✅ Integration tests with full server stack
- ✅ E2E tests with Puppeteer
- ❌ Pure unit tests (should not need it)
- ❌ As first resort (investigate root cause first)

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

When debugging complex issues (especially 0 results, missing data, silent failures):

1. **DON'T repeatedly run tests hoping for different results** ❌
   - Each test run costs time and provides minimal new information
   - Terminal output rarely changes without code changes
   
2. **DO add comprehensive debugging FIRST** ✅
   - Add `console.error()` statements at key decision points
   - Log function entry/exit with parameters
   - Log conditional branches (if/else outcomes)
   - Log API responses, query results, loop iterations
   - Make debugging output grep-able with unique prefixes (e.g., `[WikidataCountry]`)
   - **MOST IMPORTANT**: Add PROBLEM telemetry for API errors (surfaces in test output)

3. **Research execution flow before testing** 🔍
   - Read the code path from entry to exit
   - Identify where results might be filtered/skipped
   - Check for early returns, error swallowing, silent failures
   - Verify handlers/callbacks are actually registered

4. **Test run criteria** - Only run tests when:
   - You've added NEW debugging output that will show something different
   - You've changed code that should alter behavior
   - You've identified a specific hypothesis to validate
   - NOT when you're still gathering information about what the code does

**Example: 0 Results Mystery** (Oct 2025)
```javascript
// ❌ WRONG: Run test 5 times seeing "0 countries" without understanding why
npm run test:geography-full  // 0 countries
npm run test:geography-full  // still 0 countries
npm run test:geography-full  // still 0 countries... why?

// ✅ RIGHT: Add debugging to understand execution flow FIRST
async execute({ signal, emitProgress }) {
  console.error('[DEBUG] execute() CALLED');
  console.error('[DEBUG] maxCountries:', this.maxCountries);
  
  const sparql = this._buildQuery();
  console.error('[DEBUG] Query built, length:', sparql.length);
  
  const result = await this._fetchSparql(sparql);
  console.error('[DEBUG] SPARQL result:', result?.results?.bindings?.length, 'bindings');
  
  if (result.bindings.length === 0) {
    console.error('[DEBUG] EARLY RETURN: Zero bindings from SPARQL');
    return { recordsProcessed: 0 }; // ← Found it!
  }
  // ... rest of method
}

// NOW run test once with debugging to see execution path
npm run test:geography-full
```

**Rule of Thumb**: If you've run a test 3+ times without code changes between runs, STOP and add more debugging instead.

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

✅ Check attachments FIRST → search for pattern → read example → START CODING  
✅ Use app's shared DB connection in tests  
✅ Call factory functions after importing them  
✅ Create tests alongside implementation  
✅ Use `replace_string_in_file` for file edits  
✅ Fix all test failures, then report once  
✅ **Check initialization order when adding code to server.js** ← NEW

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

### System Architecture
- **`docs/ARCHITECTURE_CRAWLS_VS_BACKGROUND_TASKS.md`** ⭐ **START HERE** - Critical distinction between crawls (foreground) and background tasks (background)

### Database & Schema
- **`docs/DATABASE_NORMALIZATION_PLAN.md`** (1660 lines) - Comprehensive normalization plan from denormalized to 3NF/BCNF
- **`docs/PHASE_0_IMPLEMENTATION.md`** (761 lines) - Ready-to-run migration infrastructure (schema versioning, exporter, importer)
- **`docs/COMPRESSION_IMPLEMENTATION_FULL.md`** - Gzip/Brotli compression at all levels (70-85% size reduction, 6-25x ratios)
- **`docs/COMPRESSION_BUCKETS_ARCHITECTURE.md`** - Bucket compression system for similar content
- **`docs/DATABASE_ACCESS_PATTERNS.md`** - Query patterns and optimization strategies

### Service Layer & Code Organization
- **`docs/SERVICE_LAYER_ARCHITECTURE.md`** (1159 lines) - Service extraction patterns, dependency injection, testing
- **`docs/ARCHITECTURE_ANALYSIS_AND_IMPROVEMENTS.md`** - Codebase analysis and refactoring roadmap

### Background Tasks System
- **`docs/BACKGROUND_TASKS_COMPLETION.md`** - Background tasks implementation (compression, analysis, exports)
- **`docs/ANALYSIS_AS_BACKGROUND_TASK.md`** - Analysis integration with background task framework

### UI & Client Architecture
- **`docs/HTML_COMPOSITION_ARCHITECTURE.md`** - Server-side HTML composition patterns
- **`docs/CLIENT_MODULARIZATION_PLAN.md`** - UI component architecture and module boundaries

### Advanced Features (Future)
- **`docs/GOFAI_ARCHITECTURE.md`** - GOFAI planning system (not in execution path)
- **`docs/ADVANCED_PLANNING_SUITE.md`** - Plugin-based planning architecture
- **`docs/ASYNC_PLANNER_PREVIEW.md`** - Async planner preview system

### Implementation & Historical Notes
- 🏙️ Cities crawl implementation → `docs/CITIES_IMPLEMENTATION_COMPLETE.md`
- 📈 Cities integration status → `docs/CITIES_INTEGRATION_STATUS.md`
- 📦 Database refactoring summary → `docs/DATABASE_REFACTORING_COMPLETE.md`

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

**Keep summaries brief**: 1-2 sentences for simple tasks, 1-2 short paragraphs (max) for complex work. No multi-section reports with headers/bullets/tables.

**AGENTS.md hygiene**: This file is for CURRENT and FUTURE work only. When initiatives complete, delete implementation details but keep high-level patterns/lessons. Move detailed retrospectives to separate docs.

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

### PowerShell Command Complexity Guidelines

**🚨 CRITICAL: NEVER USE COMMANDS THAT REQUIRE USER APPROVAL 🚨**

**THE RULE**: If a PowerShell command requires user approval, DON'T USE IT. Find a simpler alternative or use a tool.

**Why This Matters**: Complex commands trigger VS Code's approval dialog, interrupt autonomous work, waste time, and frustrate users. You have tools that work WITHOUT approval - use them.

**❌ Commands That ALWAYS Require Approval (NEVER USE)**:
```powershell
# Complex regex replace with Get-Content/Set-Content pipeline
(Get-Content "file.js") -replace 'pattern', 'replacement' | Set-Content "file.js"

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

**When Testing Servers or APIs**:
- ✅ Start server with `--detached --auto-shutdown-seconds N` (simple command)
- ✅ Check server logs via `get_terminal_output` tool (read-only, won't kill server)
- ✅ Read existing log files instead of making live API calls
- ✅ Run E2E test suite instead of manual API testing (tests manage server lifecycle)
- ❌ **NEVER run ANY command in a terminal that has a background process running**
- ❌ **NEVER use `curl` in PowerShell** (it's an alias for Invoke-WebRequest with different syntax)
- ❌ Don't chain Start-Sleep with HTTP requests (requires approval)
- ❌ Don't use Start-Job with complex scriptblocks (requires approval)
- ❌ Don't try to test APIs in the same command that starts the server
- ❌ Don't manually test APIs when debugging (use E2E tests or logs instead)

**Example From This Session**:
```powershell
# ❌ REQUIRED APPROVAL (complex regex, special chars, long line)
(Get-Content "analysis.new-apis.test.js") -replace 'const config = JSON\.parse\(taskRes\.body\.task\.config\);', 'const config = taskRes.body.task.config; // Already parsed by API' | Set-Content "analysis.new-apis.test.js"

# ✅ NO APPROVAL NEEDED (tool-based, researched October 2025)
replace_string_in_file({
  filePath: "analysis.new-apis.test.js",
  oldString: "const config = JSON.parse(taskRes.body.task.config);",
  newString: "const config = taskRes.body.task.config; // Already parsed"
})
```

---

### Database Schema Evolution

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

3. **`docs/DATABASE_NORMALIZATION_PLAN.md`** — Full technical specification (80+ pages)
4. **`docs/SCHEMA_NORMALIZATION_SUMMARY.md`** — Executive summary with priorities
5. **`docs/SCHEMA_EVOLUTION_DIAGRAMS.md`** — Visual architecture diagrams
6. **`docs/COMPRESSION_BUCKETS_ARCHITECTURE.md`** — Bucket lifecycle and caching strategies

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

*This refactoring transforms the codebase into a more idiomatic, maintainable state while preserving all existing functionality. Follow the workflow systematically, test continuously, and document progress transparently.*