# AGENTS.md — AI Agent Quick Start & Navigation Hub

**Purpose**: Central navigation and workflow rules for AI agents

**File Size**: Keep this file <500 lines. Extract details to specialized docs.

---

## 🎯 Start Here

**First Time Working in This Repo?**
1. Read "Documentation Strategy" section below (5 min)
2. Scan "Topic Index" to understand available documentation
3. Jump to relevant specialized docs based on your task
4. Reference "Core Workflow Rules" for autonomous operation patterns

**Already Familiar?**
- Use Topic Index to find what you need
- Check "When to Read" guidance in each doc
- Cross-reference as needed

---

## 📚 Documentation Strategy

### How to Use Documentation Efficiently

```javascript
// STEP 1: Identify your task category
const taskCategories = {
  'commands': 'Running terminal commands, avoiding approval dialogs',
  'testing': 'Writing tests, running tests, fixing failures',
  'database': 'DB operations, schema changes, queries',
  'crawls': 'Web crawling system (foreground)',
  'background-tasks': 'Long-running processing (background)',
  'ui': 'Frontend components, styling, SSE',
  'architecture': 'System design, component interaction'
};

// STEP 2: Find relevant doc in Topic Index below

// STEP 3: Read "When to Read" guidance in that doc

// STEP 4: Apply patterns, cross-reference as needed
```

### Key Principles

1. **Don't read everything** - Use Topic Index to find what's relevant
2. **Check "When to Read"** - Every doc has usage guidance
3. **Cross-reference** - Docs link to each other
4. **Update as you learn** - Add discoveries to appropriate docs

---

## 📖 Topic Index (Quick Navigation)

### Essential Quick References ⭐

**Before Running Commands**:
- 🚨 **`docs/COMMAND_EXECUTION_GUIDE.md`** ⭐ **READ BEFORE ANY TERMINAL OPERATIONS**
  - Prevents approval dialogs, tool vs command decisions, PowerShell pitfalls

**Before Testing**:
- 🧪 **`docs/TESTING_QUICK_REFERENCE.md`** ⭐ **READ BEFORE RUNNING TESTS**
  - Common patterns, test log analyzer, exit code verification, debugging

**Before Database Operations**:
- 🔌 **`docs/DATABASE_QUICK_REFERENCE.md`** ⭐ **READ BEFORE DB WORK**
  - Getting DB handle, WAL mode, schema tools, query patterns

### Complete Workflow Guides

**Testing** (Systematic Approach):
- 📋 `docs/TESTING_REVIEW_AND_IMPROVEMENT_GUIDE.md` - Complete test fixing workflow
- 📊 `docs/TESTING_STATUS.md` - Current test state (max 200 lines)
- ⏱️ `docs/TEST_TIMEOUT_GUARDS_IMPLEMENTATION.md` - Prevent hangs
- 🧹 `docs/TESTING_ASYNC_CLEANUP_GUIDE.md` - Async patterns, "Jest did not exit"
- 🔧 `docs/TEST_FIXES_2025-10-10.md` - Recent fix patterns to learn from

**Database** (Complete References):
- 🗄️ `docs/DATABASE_MIGRATION_GUIDE_FOR_AGENTS.md` - Migration workflow
- 📊 `docs/DATABASE_SCHEMA_ERD.md` - Visual schema reference
- 📐 `docs/DATABASE_NORMALIZATION_PLAN.md` - Future normalization (1660 lines)
- 🔍 `docs/DATABASE_ACCESS_PATTERNS.md` - Query optimization

**Documentation** (Meta):
- 📚 `docs/DOCUMENTATION_REVIEW_AND_IMPROVEMENT_GUIDE.md` - When user requests doc review
- 📝 `docs/AI_AGENT_DOCUMENTATION_GUIDE.md` - Writing AI-friendly docs

### Architecture & System Design

**Core Systems**:
- 🏗️ `docs/ARCHITECTURE_CRAWLS_VS_BACKGROUND_TASKS.md` ⭐ **Critical system distinction**
  - Crawls (foreground): Fetch external content
  - Background tasks (background): Process existing data
- 🧩 `COMPONENTS.md` - System components overview
- 🚀 `ENHANCED_FEATURES.md` - Crawler intelligence, priority system

**Service Layer**:
- 🔍 `docs/SERVICE_LAYER_GUIDE.md` ⭐ Service patterns
- 📐 `docs/SERVICE_LAYER_ARCHITECTURE.md` - Service extraction
- 🌐 `docs/API_ENDPOINT_REFERENCE.md` ⭐ Complete API docs

**Crawls** (Foreground System):
- 🌍 `GEOGRAPHY_CRAWL_TYPE.md` - Geography crawl implementation
- 🗺️ `GAZETTEER_BREADTH_FIRST_IMPLEMENTATION.md` - Gazetteer patterns
- ⚙️ `docs/CONCURRENCY_IMPLEMENTATION_SUMMARY.md` - Concurrency model
- 📊 `docs/GEOGRAPHY_FLOWCHART_IMPLEMENTATION.md` - UI flowcharts

**Background Tasks** (Background System):
- ⚙️ `docs/BACKGROUND_TASKS_COMPLETION.md` - Task framework
- 🗜️ `docs/COMPRESSION_IMPLEMENTATION_FULL.md` - Compression (70-85% reduction)
- 🔬 `docs/ANALYSIS_AS_BACKGROUND_TASK.md` - Analysis integration
- 📈 `docs/COVERAGE_API_AND_JOB_DETAIL_IMPLEMENTATION.md` - Coverage API

**UI Development**:
- 🎨 `docs/HTML_COMPOSITION_ARCHITECTURE.md` - Server-side HTML
- 🧩 `docs/CLIENT_MODULARIZATION_PLAN.md` - Component modules
- 📡 `docs/UI_INTEGRATION_COMPLETE.md` - SSE integration

### Debugging & Tools

**Debugging**:
- 🐛 `DEBUGGING_CHILD_PROCESSES.md` - SSE/milestone events
- 🚨 `GEOGRAPHY_E2E_INVESTIGATION.md` - Geography issues
- 🛠️ `tools/debug/README.md` - Debugging utilities

**Testing Tools**:
- 🧪 `tests/README.md` - Test runner configuration
- 🔍 `tests/SIMPLE_TOOLS_README.md` - Query tools
- 🌍 `docs/GEOGRAPHY_E2E_TESTING.md` - Long-running E2E

**Database Tools**:
- 🔧 `tools/debug/README.md` - DB inspection tools (no approval dialogs)

### Operations & Configuration

- 📖 `RUNBOOK.md` - Operations guide
- ⚙️ `docs/CONFIGURATION_GUIDE.md` - Configuration reference
- 🗺️ `ROADMAP.md` - Project roadmap
- 🏁 `README.md` - Project overview

---

## 🎯 Core Workflow Rules

### Autonomous Operation

**Execution**: Work autonomously. Stop only if genuinely blocked.

**Research Budget**:
- Small changes (<50 lines): 1-3 files, 1-2 searches, start coding within 2-5 min
- Medium changes: 5-10 files max before coding
- Large changes: Break into phases, code incrementally

**Fast Path**:
1. Check attachments → ONE search for pattern → Read ONE example → START CODING
2. Don't read 20+ files (analysis paralysis)

**Test Discipline**:
- Add debugging code BEFORE running tests repeatedly
- If you've run same test 3+ times without code changes, STOP and add debugging

### Communication

**Keep summaries brief**: 1-2 sentences for simple tasks, 1-2 short paragraphs (max) for complex work.

**Exception**: Complex multi-file problems warrant detailed reports with root cause, code analysis, architecture context, fix options.

**No mid-task confirmations**: Proceed autonomously unless critical details missing.

---

## 🚨 CRITICAL: Command Execution

**NEVER USE POWERSHELL COMMANDS THAT REQUIRE APPROVAL**

**Primary Rules**:
1. ✅ Use `replace_string_in_file` tool for file edits (95% of cases)
2. ✅ Use `read_file`, `grep_search`, `file_search` tools for analysis
3. ❌ NEVER use `Get-Content | Set-Content` pipelines
4. ❌ NEVER use complex regex, chaining (`;`), or `ForEach-Object`
5. ❌ NEVER run commands in terminals with background processes

**Configuration-Based Test Execution**:
```bash
# ✅ CORRECT: No approval needed
node tests/run-tests.js e2e
node tests/run-tests.js unit

# ❌ WRONG: Requires approval
cross-env E2E=1 npm test
```

**Complete Guide**: See `docs/COMMAND_EXECUTION_GUIDE.md` before running ANY commands

---

## 🧪 Testing Essentials

### ALWAYS Verify Exit Codes

**VS Code task messages are UNRELIABLE**. Tasks show "succeeded" even when tests fail.

```javascript
// After EVERY test run:
const lastCmd = await terminal_last_command();
// Check: "exit code: 0" = pass, "exit code: 1" = fail
```

### Check Logs BEFORE Running Tests

```bash
# Primary tool (5s, saves 30-60 min)
node tests/analyze-test-logs.js --summary

# Simple query tools (5s each, NO APPROVAL)
node tests/get-test-summary.js --compact
node tests/get-failing-tests.js
```

### Test Log Management

```bash
# Migration (legacy logs from root)
node tools/migrate-test-logs.js --execute

# Cleanup (keep testlogs/ organized)
node tools/cleanup-test-logs.js --execute
```

**Complete Guide**: See `docs/TESTING_QUICK_REFERENCE.md` before testing

---

## 🔌 Database Essentials

### Getting a DB Handle

```javascript
const { ensureDatabase } = require('../db/sqlite');

// Simple usage
const db = ensureDatabase('/path/to/db.sqlite');
const articles = db.prepare('SELECT * FROM articles WHERE host = ?').all('example.com');

// In tests: Use app's shared connection (REQUIRED for WAL mode)
const db = app.locals.backgroundTaskManager?.db || app.locals.getDb?.();
```

### Schema Tools (No Approval Dialogs)

```bash
node tools/db-schema.js tables              # List all tables
node tools/db-schema.js table analysis_runs # Show columns
node tools/db-query.js "SELECT * FROM articles LIMIT 5"
```

**Complete Guide**: See `docs/DATABASE_QUICK_REFERENCE.md` before DB work

---

## 🏗️ Project Structure

### Core Systems (CRITICAL Understanding)

**Two Distinct Systems** - See `docs/ARCHITECTURE_CRAWLS_VS_BACKGROUND_TASKS.md`:

1. **Crawls (Foreground)** - `src/crawler/`
   - Fetch content from external websites
   - Manager: `CrawlOrchestrationService` + `JobRegistry`
   - Duration: Minutes to hours
   - Tables: `crawl_jobs`, `queue_events`
   - API: `/api/crawl`, `/api/crawls/:id/*`

2. **Background Tasks (Background)** - `src/background/`
   - Process data already in database
   - Manager: `BackgroundTaskManager`
   - Duration: Hours to days
   - Tables: `background_tasks`
   - API: `/api/background-tasks`

**Key Rule**: Crawls acquire new data (network I/O). Background tasks process existing data (CPU/disk I/O).

### UI Module Pattern ⚠️

**ES6 Modules Only**: All UI code uses `import/export`

**Factory Pattern**: Modules export factory functions that MUST be called:
```javascript
// ✅ CORRECT: Import AND call with dependencies
import { createCrawlControls } from './crawlControls.js';
createCrawlControls({ elements, formElements, actions, formatters });

// ❌ WRONG: Import alone does nothing
import { createCrawlControls } from './crawlControls.js';
// Missing call - no handlers attached!
```

### Build Process

**Auto-Build on Server Start**: Components auto-rebuild if sources newer than outputs  
**Manual**: `node scripts/build-ui.js` (rebuilds index.js, chunks)  
**SASS**: `npm run sass:build` for styles

---

## 🔥 Common Pitfalls

### Initialization Order (server.js)

**Problem**: ReferenceError when accessing variables before they're defined

**Prevention**:
1. Search for dependencies BEFORE adding code (use `grep_search`)
2. Read 20-30 lines before/after insertion point
3. Verify all dependencies defined earlier in file
4. Add comments explaining placement

### WAL Mode Single Connection

**In Tests**: Always use app's shared DB handle. Multiple connections = isolation.

```javascript
// ✅ RIGHT
const db = app.locals.backgroundTaskManager.db;

// ❌ WRONG
const db = new Database(dbPath); // Separate connection!
```

### Async Without Await

**Only declare `async` if function uses `await`**:

```javascript
// ❌ WRONG: Returns Promise
async function getData() {
  return db.prepare('SELECT *').all();
}

// ✅ RIGHT: Remove unnecessary async
function getData() {
  return db.prepare('SELECT *').all();
}
```

---

## 📋 Anti-Patterns Checklist

❌ Reading 20+ files before coding (analysis paralysis)  
❌ CommonJS in UI code (use ES6 `import/export`)  
❌ Importing modules without calling initialization functions  
❌ Multiple DB connections in tests (WAL isolation)  
❌ Features without tests  
❌ Complex PowerShell requiring approval (use tools)  
❌ Status updates mid-work (work autonomously)  
❌ Referencing variables/functions before initialization  

✅ Check attachments FIRST → search → read example → CODE  
✅ Use app's shared DB connection in tests  
✅ Call factory functions after importing  
✅ Create tests alongside implementation  
✅ Use `replace_string_in_file` for file edits  
✅ Fix all failures, then report once  
✅ Check initialization order in server.js  

---

## 🎯 Current Focus (October 2025)

**Status**: ✅ Core infrastructure complete - active feature development  
**Phase**: Background tasks, UI improvements, optimizations

**Recent Completions**:
- ✅ Test log management tools (migration + cleanup)
- ✅ Database schema tools (inspection without approval dialogs)
- ✅ Documentation modularization (extracted specialized quick references)
- ✅ Background task integration (analysis runs + UI)

**Next Priorities**:
- Wire BackgroundTaskManager to populate analysis_runs fields
- Update SSE broadcasts with background task metadata
- Continue feature development and optimizations

---

## 📚 When to Read Which Docs

| If you need to... | Read this FIRST | Then read (if needed) |
|------------------|----------------|----------------------|
| Run terminal commands | `docs/COMMAND_EXECUTION_GUIDE.md` ⭐ | Test runner docs |
| Write/fix tests | `docs/TESTING_QUICK_REFERENCE.md` ⭐ | `TESTING_REVIEW_AND_IMPROVEMENT_GUIDE.md` |
| Database operations | `docs/DATABASE_QUICK_REFERENCE.md` ⭐ | Schema ERD, migration guide |
| Understand architecture | `ARCHITECTURE_CRAWLS_VS_BACKGROUND_TASKS.md` ⭐ | `COMPONENTS.md` |
| Work with services | `docs/SERVICE_LAYER_GUIDE.md` ⭐ | API reference |
| Fix failing tests | `docs/TESTING_REVIEW_AND_IMPROVEMENT_GUIDE.md` | Test log analyzer docs |
| Debug child processes | `DEBUGGING_CHILD_PROCESSES.md` | SSE logs, milestone events |
| Build UI components | `CLIENT_MODULARIZATION_PLAN.md` | HTML composition docs |
| Review/improve docs | `DOCUMENTATION_REVIEW_AND_IMPROVEMENT_GUIDE.md` | This file structure |

---

**This file should remain <500 lines. Extract implementation details, comprehensive guides, and reference material to specialized documents.**
