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

###  Complete Documentation Index

**For the complete documentation index with all 187 docs organized by category, see `docs/INDEX_FOR_AGENTS.md`.**

---

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
| `database-overview` | Database architecture, connections, and operational SLOs | When understanding database setup and ownership | database, architecture, operations | 2025-11-04 |
| `database-schema-main` | Detailed SQLite schema with tables, domains, and triggers | When working with specific tables or understanding data flow | database, schema, tables | 2025-11-04 |
| `database-adapters-news-sqlite` | News SQLite adapter family and v1 implementation | When using or extending the base database adapter | database, adapters, sqlite | 2025-11-04 |
| `database-adapters-enhanced` | Enhanced adapter with queue/planner/coverage modules | When implementing advanced analytics features | database, adapters, analytics | 2025-11-04 |
| `database-migrations-policy` | Migration authoring, review, and rollback procedures | When planning or executing schema changes | database, migrations, policy | 2025-11-04 |
| `database-ops-runbooks` | Operational runbooks for backups, maintenance, partitioning | When performing database operations or troubleshooting | database, operations, maintenance | 2025-11-04 |
| `tdd-guidelines` | Ensures reliable code changes through testing | When implementing new features | testing, tdd, development | 2025-10-19 |
| `intelligent-crawl-startup` | Rapid iteration on crawl startup output | When improving startup output | crawls, startup, analysis | 2025-10-19 |
| `testing-focused-workflow` | Targeted test development patterns | When developing features with comprehensive test coverage | testing, workflow, development | 2025-10-19 |
| `database-migration-quick-reference` | Migration patterns and commands | When performing database migrations | database, migration, tools | 2025-10-19 |
| `analysis-background-integration` | Analysis task implementation details | When working with background analysis tasks | background-tasks, analysis, integration | 2025-10-19 |

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
| Refactor JavaScript code safely | `tools/dev/README.md` ⭐ | `docs/CLI_REFACTORING_QUICK_START.md` |
| Use CLI tools for automation | AGENTS.md "CLI Tools & Commands" ⭐ | `tools/README.md` |
| Build agentic workflows | AGENTS.md "Agentic CLI Workflows" ⭐ | Tool-specific documentation |
| Run operations tasks | `RUNBOOK.md` | Server CLI reference in AGENTS.md |
| Check project roadmap | `ROADMAP.md` | Review AGENTS.md current focus section |
| Execute commands safely | AGENTS.md "OS Awareness & Command Line Best Practices" ⭐ | `docs/COMMAND_EXECUTION_GUIDE.md` |
| Learn comprehensive agentic workflow patterns | `docs/GUIDE_TO_AGENTIC_WORKFLOWS_BY_GROK.md` ⭐ | Grok's complete framework for autonomous task execution |
| Perform database migration | `docs/DATABASE_MIGRATION_GUIDE_FOR_AGENTS.md` ⭐ | `docs/DATABASE_SCHEMA_ISSUES_STATUS.md` (current state) |
| Check database schema status | `docs/DATABASE_SCHEMA_ISSUES_STATUS.md` | When investigating schema-related bugs or planning migrations |
| Follow testing focused workflow | `docs/TESTING_FOCUSED_WORKFLOW.md` | When developing features with comprehensive test coverage |
| Analyze JS GUI3 patterns | `docs/JSGUI3_PATTERNS_ANALYSIS.md` | When working with UI component architecture and patterns |
| Review queues page optimizations | `docs/QUEUES_PAGE_OPTIMIZATION.md` | When optimizing UI performance and user experience |
| Review language tools improvements | `docs/QUEUES_PAGE_LANG_TOOLS_IMPROVEMENTS.md` | When enhancing language processing capabilities |
| Analyze false positive test results | `docs/POST_MORTEM_FALSE_POSITIVE_TEST_RESULTS.md` | When investigating unexpected test failures |
| Plan database migration strategy | `docs/DATABASE_MIGRATION_STRATEGY.md` | When planning large-scale database changes |
| Review phase 6 test fixing insights | `docs/documentation-review/2025-10-10-phase-6-test-fixing-insights.md` | When learning from recent testing improvements |
| Understand database schema | `docs/database/schema/main.md` ⭐ | `docs/database/overview.md` |
| Perform database operations | `docs/database/ops/runbooks/` | `docs/database/overview.md` |
| Use database adapters | `docs/database/adapters/` | `docs/database/overview.md` |
| Plan database migrations | `docs/database/migrations/policy.md` ⭐ | `docs/DATABASE_MIGRATION_GUIDE_FOR_AGENTS.md` |

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

## 🖥️ OS AWARENESS & COMMAND LINE BEST PRACTICES

**CRITICAL**: AI agents must maintain awareness of the operating system and adjust command line usage accordingly. This repository runs on **Windows** with **PowerShell** as the default shell.

### Operating System Context

**Current Environment**:
- **OS**: Windows (PowerShell v5.1)
- **Shell**: `powershell.exe`
- **Path Separator**: `\` (backslash)
- **Line Endings**: CRLF (`\r\n`)
- **File Paths**: Use absolute paths with `c:\` prefix

**Key OS Differences**:
- **Windows/PowerShell**: `Get-Content`, `Set-Content`, `Select-String`, `ForEach-Object`
- **Linux/Posix**: `cat`, `grep`, `sed`, `awk`, `xargs`
- **Path Handling**: Windows uses `\`, Posix uses `/`
- **Command Chaining**: Windows uses `;` or `&&`, Posix uses `;` or `&&`

### Command Line Philosophy

**SIMPLE COMMANDS ONLY**: Avoid complex piping, chaining, or output parsing that requires approval dialogs.

**Golden Rules**:
1. ✅ **Use simple, single-purpose commands**
2. ✅ **Avoid `|` (pipe) and `&&` (conditional execution)**
3. ✅ **Prefer tools over complex shell operations**
4. ✅ **Test commands in isolation first**
5. ❌ **Never chain commands with `;` for complex operations**
6. ❌ **Never use output parsing or redirection for logic**

### Windows/PowerShell Command Patterns

**✅ SAFE Commands (Use These)**:
```powershell
# Simple file operations
Test-Path "c:\path\to\file.js"
Get-Content "c:\path\to\log.txt"
Get-Content "c:\path\to\log.txt" | Select-Object -Last 20
Get-ChildItem "c:\path\to\directory"

# Simple process operations
node server.js --detached --auto-shutdown-seconds 10
npm test
npm run build
node tools/script.js arg1 arg2

# Simple output filtering (minimal piping only)
command | Select-Object -First 10
```

**❌ UNSAFE Commands (Never Use These)**:
```powershell
# Complex piping and chaining
Get-Content file.js | Select-String "pattern" | ForEach-Object { ... }
command1; Start-Sleep -Seconds 5; command2
command1 && command2 | ConvertFrom-Json

# Complex regex and string manipulation
(Get-Content "file.js") -replace 'complex.*regex', 'replacement' | Set-Content "file.js"

# Multi-line commands with backticks
Get-Content "file.js" `
  -replace 'pattern1', 'replacement1' `
  -replace 'pattern2', 'replacement2' | Set-Content "file.js"

# Output parsing for logic
npm test 2>&1 | Select-String "error"
Get-Content file.log | Select-String "complex.*pattern"
```

### Cross-Platform Compatibility

**When writing code that might run on different OSes**:
- Use `path.join()` or `path.resolve()` for path construction
- Use `os.platform()` to detect OS if needed
- Prefer Node.js APIs over shell commands
- Test path separators: `path.sep` instead of hardcoded `/` or `\`

**Example OS-Aware Code**:
```javascript
const path = require('path');
const os = require('os');

// OS-aware path construction
const dbPath = path.join('data', 'news.db'); // Works on Windows/Linux/Mac

// OS detection if needed
if (os.platform() === 'win32') {
  // Windows-specific logic
} else {
  // Posix logic
}
```

### Background Process Rules

**CRITICAL**: Terminals with background processes become dedicated - don't run additional commands in them.

```powershell
# ❌ WRONG: Commands in terminal with background process
Terminal> node server.js --detached --auto-shutdown-seconds 30
Terminal> curl http://localhost:3000/api/test  # KILLS THE SERVER!

# ✅ RIGHT: Use get_terminal_output tool for logs, run E2E tests instead
```

### Tool-First Approach

**For most operations, use tools instead of shell commands**:

- **File Editing**: `replace_string_in_file` tool (not PowerShell replace)
- **File Reading**: `read_file` tool (not Get-Content with logic)
- **File Searching**: `grep_search` tool (not Select-String with regex)
- **File Finding**: `file_search` tool (not Get-ChildItem with ForEach)

### Testing OS Awareness

**Before running commands**:
1. Verify you're using Windows/PowerShell syntax
2. Test simple commands first
3. Use tools for complex operations
4. Check for approval dialogs (they indicate unsafe commands)

**Command Testing Checklist**:
- [ ] Is this a simple, single-purpose command?
- [ ] Does it avoid `|` and `&&`?
- [ ] Can I use a tool instead?
- [ ] Have I tested it in isolation?
- [ ] Does it follow Windows path conventions?

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

### Continuous Execution Mandate

- Once you have an active plan or task list, execute its items back-to-back without waiting for new instructions or pausing after partial progress.
- If a validation step or tool failure blocks progress, attempt remediation first; when it remains unresolved, document the blocker in the living task tracker and immediately pivot to the next actionable item.
- Provide summaries only after every task in the plan is complete or every remaining item is explicitly documented as blocked.

### Careful Refactor Engagements

- Treat each careful refactor effort as **one phase** that lists every required task before implementation starts. Organize your work into sub-phases (discovery → plan → implementation → validation) but finish the entire task list before declaring the phase done.
- Begin with a **deep discovery sweep**: read the Topic Index in this file, relevant docs in `docs/`, and `.github/agents/Careful Refactor.agent.md`. Inventory existing CLI tools that illuminate the target area, decide which to run, and consider building or enhancing analyzers when gaps appear.
- Capture the discovery findings (docs consulted, tools evaluated/created, risks, preliminary targets) in the living task tracker so subsequent sub-phases have concrete evidence.
- Ensure every refactor task routes database access through adapters—expand or author adapters instead of embedding SQL in tools or services.
- Reference `.github/agents/Careful Refactor.agent.md` for the full sub-phase workflow and keep the tracker synchronized with the currently active sub-phase.

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

### UI Module Pattern ⚠️ DEPRECATED

**Note**: This section refers to the deprecated UI in `src/deprecated-ui/`. The new UI (v2) in `src/ui/` uses different patterns.

**ES6 Modules Only**: All UI code uses `import/export`, NOT CommonJS `require/module.exports`

**Factory Pattern**: Modules export factory functions that MUST be called with dependencies:
```javascript
// ✅ CORRECT: Import AND call with dependencies
import { createCrawlControls } from './crawlControls.js';
createCrawlControls({ elements, formElements, actions, formatters });

# ❌ WRONG: Import alone does nothing
import { createCrawlControls } from './crawlControls.js';
// Missing call - no handlers attached!
```

**Common Bug** (Oct 2025): `index.js` imported `createCrawlControls` but never called it → start button had no click handler for months.

**Verification**: Search `export function create*` → verify corresponding call site exists in `index.js`

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

## CLI Tools & Commands

**Comprehensive CLI toolkit for database operations, data analysis, and automation workflows.** All tools follow safety-first patterns with dry-run modes and clear output formatting.

**When to consult**:
- When performing database operations without VS Code approval dialogs
- When analyzing crawl data or performance metrics
- When running automated workflows or data corrections
- When debugging system behavior or child processes

### Core CLI Tools

#### Database Inspection (No Approval Dialogs)
```bash
# Quick table overview
node tools/db-schema.js tables

# Detailed table structure
node tools/db-schema.js describe <table>

# Foreign key relationships
node tools/db-schema.js fks

# Table sizes and statistics
node tools/db-table-sizes.js
```

#### Intelligent Crawl Analysis
```bash
# Rapid startup analysis (30 seconds)
node tools/intelligent-crawl.js --limit 100

# Full crawl analysis with coverage
node tools/intelligent-crawl.js
```

#### Data Correction & Maintenance
```bash
# Safe data corrections (dry-run first)
node tools/corrections/fix-foreign-keys.js
node tools/corrections/fix-duplicate-places.js

# Database maintenance
node tools/vacuum-db.js
node tools/db-maintenance.js
```

#### Performance & Benchmarking
```bash
# Compression benchmarks
node tools/compression-benchmark.cjs

# Database performance analysis
node tools/db-table-sizes-fast.js
```

#### Debug & Analysis
```bash
# Child process debugging
node tools/debug/child-process-monitor.js

# Test log analysis
node tools/count-testlogs.js
```

#### Code Analysis & Refactoring
```bash
# JavaScript function inspection and modification
node tools/dev/js-edit.js --file <path> --list-functions
node tools/dev/js-edit.js --file <path> --locate <selector> --emit-plan <plan.json>
node tools/dev/js-edit.js --file <path> --context-function <selector> --emit-plan <plan.json>
node tools/dev/js-edit.js --file <path> --replace <selector> --with <snippet> --expect-hash <hash>
```

### Agentic CLI Workflows

**Multi-step automation patterns for complex operations.** These workflows combine multiple CLI tools with decision logic for autonomous execution.

#### Database Migration Workflow
```javascript
// Pattern: Safe schema migration with backup
1. node tools/db-schema.js backup  // Create backup
2. node tools/corrections/validate-data.js  // Pre-flight checks
3. node tools/migrations/run-migration.js  // Apply changes
4. node tools/db-schema.js verify  // Post-migration validation
```

#### Crawl Analysis Workflow
```javascript
// Pattern: Comprehensive crawl evaluation
1. node tools/intelligent-crawl.js --limit 50  // Quick assessment
2. node tools/analyze-country-hub-patterns.js  // Pattern analysis
3. node tools/crawl-place-hubs.js  // Hub discovery validation
4. node tools/export-gazetteer.js  // Export results
```

#### Data Quality Assurance Workflow
```javascript
// Pattern: Systematic data cleanup
1. node tools/corrections/detect-issues.js  // Identify problems
2. node tools/corrections/fix-foreign-keys.js --dry-run  // Preview fixes
3. node tools/corrections/fix-foreign-keys.js --fix  // Apply fixes
4. node tools/db-schema.js verify  // Confirm integrity
```

### Tool Categories

| Category | Primary Tools | Purpose |
|----------|---------------|---------|
| **Database** | `db-schema.js`, `db-query.js`, `db-table-sizes.js` | Schema inspection, queries, statistics |
| **Analysis** | `intelligent-crawl.js`, `analyze-country-hub-patterns.js` | Crawl analysis, pattern discovery |
| **Correction** | `corrections/*.js` | Data cleanup, integrity fixes |
| **Performance** | `benchmarks/`, `compression-benchmark.cjs` | Performance testing, optimization |
| **Debug** | `debug/`, `manual-tests/` | Debugging, validation, testing |
| **Maintenance** | `vacuum-db.js`, `cleanup-test-logs.js` | Database maintenance, cleanup |
| **Code Refactoring** | `tools/dev/js-edit.js` | JavaScript function inspection, context analysis, guarded replacements with plan emission |

### Safety Patterns

**All CLI tools follow these safety principles:**
- ✅ **Dry-run mode** by default for destructive operations
- ✅ **Clear output formatting** with emojis and structured data
- ✅ **Progress indicators** for long-running operations
- ✅ **Error handling** with actionable error messages
- ✅ **No approval dialogs** - designed for automation

**Example Safety Pattern**:
```bash
# Always preview first
node tools/corrections/fix-data.js --dry-run

# Then apply with clear confirmation
node tools/corrections/fix-data.js --fix
```

### Integration with Agentic Workflows

**CLI tools are designed for composition in automated workflows:**
- **Structured output** for parsing by other tools
- **Exit codes** for decision logic (0=success, 1=error, 2=warning)
- **JSON output options** for programmatic consumption
- **Idempotent operations** (safe to re-run)

**See**: `tools/README.md` for complete tool reference and examples.

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

## 🎯 CURRENT FOCUS: CLI Tools & Agentic Workflows (October 2025)

**Status**: ✅ Core crawler and database infrastructure complete  
**Next**: Expand CLI toolkit and implement agentic automation patterns

**Priority Areas**:
- **CLI Tools Enhancement**: Add new tools for data analysis, corrections, and maintenance
- **Agentic Workflows**: Create multi-step automation patterns using CLI tools
- **Tool Integration**: Ensure tools work together seamlessly for complex operations
- **Documentation**: Keep CLI tools well-documented for easy discovery and usage

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

## Jest Command Guidelines (CRITICAL)

**Enforce simple command syntax without pipes for consistent agent behavior and fewer approval dialogs.**

### Rule: No Piping in Jest Commands

✅ **CORRECT - Simple, single-purpose commands**:
```powershell
npx jest tests/tools/__tests__/js-edit.test.js --forceExit
npx jest tests/tools/__tests__/js-edit.test.js --bail=1
npm test
npm run test:focused
```

❌ **WRONG - Never use pipes or complex chaining**:
```powershell
# DO NOT DO THIS
npx jest tests/tools/__tests__/js-edit.test.js --forceExit 2>&1 | Select-Object -Last 100
npx jest tests/tools/__tests__/js-edit.test.js | grep "FAIL"
npm test | tee test-output.log
```

### Explanation
Pipes (`|`) trigger VS Code approval dialogs and cause inconsistent agent behavior. Use one of these approaches instead:

1. **No piping - read full output**: Run Jest directly, let test framework write to screen
   ```powershell
   npx jest tests/tools/__tests__/js-edit.test.js --forceExit
   ```

### Impact on Agent Behavior
- ✅ Commands execute without approval dialogs
- ✅ Output is deterministic and consistent
- ✅ Easier for agents to parse and verify results
- ✅ Terminal remains available for follow-up commands
- ❌ Avoid: Approval dialogs slow down agent execution
- ❌ Avoid: Complex piping makes output unpredictable

---

## Test Console Output

**Keep output minimal** (<100 lines, ideally <50). Add noisy patterns to `tests/jest.setup.js` DROP_PATTERNS. Use `verbose: false` and `silent: true` flags in tests.

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