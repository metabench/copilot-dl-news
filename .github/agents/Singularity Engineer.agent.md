---
description: 'Improves AI agent capabilities through strategic analysis and implementation.'
tools: ['edit', 'runNotebooks', 'search', 'new', 'runCommands', 'runTasks', 'microsoft/playwright-mcp/*', 'usages', 'vscodeAPI', 'problems', 'changes', 'testFailure', 'openSimpleBrowser', 'fetch', 'githubRepo', 'ms-python.python/getPythonEnvironmentInfo', 'ms-python.python/getPythonExecutableCommand', 'ms-python.python/installPythonPackage', 'ms-python.python/configurePythonEnvironment', 'extensions', 'todos', 'runSubagent', 'runTests']
---

## Session Documentation Protocol

- **Create a session folder first.** Every session (planning, development, validation) must live inside `docs/sessions/<yyyy-mm-dd>-<short-slug>/`. Do **not** drop long-form notes in `tmp/`—promote them into the session folder immediately so they become part of the permanent record.
- **Treat session docs as memory layers.** The current session folder is your short/medium-term memory (roadmap, summary, follow-ups, agent guidance). Previous session folders act as long-term memory. Use them to avoid rediscovering prior decisions.
- **Use the docs hub.** Update `docs/sessions/SESSIONS_HUB.md` with links to the new folder and consult it before starting work so you inherit outstanding follow-ups.
- **Search before you write.** Prefer the repo tooling (`node tools/dev/md-scan.js --dir docs/sessions --search <term> --json`, `node tools/dev/js-scan.js --dir docs --find-pattern <pattern>`) to sweep current + past sessions. Aim to surface relevant context into your working window instead of rewriting it from scratch.

## JavaScript Code Refactoring & Analysis Workflow

**CRITICAL: Before making any changes to JavaScript code, use the CLI tools below for discovery and safe application.**

### Tier 1 Tooling: Multi-File Discovery & Safe Batch Edits

When working with JavaScript code, ALWAYS use these tools for analysis and refactoring:

#### Gap 2: Semantic Relationship Queries (js-scan)
**Location**: `tools/dev/js-scan.js`
**Purpose**: Answer critical questions about code relationships before refactoring

**Key Operations**:
```bash
# Find all files importing a module/function
node tools/dev/js-scan.js --what-imports src/services/auth.js --json

# Find all functions called by a specific function  
node tools/dev/js-scan.js --what-calls processData --json

# Comprehensive usage analysis (imports + calls + re-exports)
node tools/dev/js-scan.js --export-usage targetExport --json
```

**Agent Workflow - Before Refactoring**:
1. **Discovery** (Gap 2 - 2 minutes max):
   - Use `--what-imports` to find all consumers before breaking changes
   - Use `--export-usage` to assess risk level (LOW/MEDIUM/HIGH)
   - Use `--what-calls` to find internal dependencies
2. **Plan** (off-line analysis):
   - Identify all files needing changes
   - Batch similar changes together
3. **Execute** (Gap 3 - see below)

**Risk Assessment Built-In**:
- LOW: <5 usages → safe to refactor independently
- MEDIUM: 5-20 usages → run full test suite after changes
- HIGH: >20 usages → refactor carefully, update all importers

#### Gap 3: Batch Dry-Run & Recovery (js-edit + BatchDryRunner)
**Location**: `tools/dev/js-edit.js` + `tools/dev/js-edit/BatchDryRunner.js`
**Purpose**: Preview and apply batch changes safely with automatic recovery

**Key Operations**:
```bash
# Preview all changes without modifying source
node tools/dev/js-edit.js --file src/app.js --dry-run --changes changes.json --json

# Recalculate offsets to handle cascading changes
node tools/dev/js-edit.js --file src/app.js --recalculate-offsets --json

# Apply verified changes and emit result plan for next workflow
node tools/dev/js-edit.js --file src/app.js --changes changes.json --fix --emit-plan --json
```

**Agent Workflow - Batch Application**:
1. **Prepare** changes in algorithmic format:
   ```json
   [
     { "file": "src/app.js", "startLine": 10, "endLine": 15, "replacement": "new code" },
     { "file": "src/utils.js", "startLine": 50, "endLine": 52, "replacement": "fixed" }
   ]
   ```
2. **Preview** with --dry-run before applying
3. **Apply** with --fix when confident
4. **Emit Plan** for continuity (Gap 4/Plans feature)

**Success Metrics**:
- Dry-run success rate: 95%+ (vs 60% currently)
- Recovery time: <2 minutes (vs 15-20 min manual)
- Supports 50+ changes per batch

#### Gap 4: Plans Integration (--from-plan)
**Purpose**: Multi-step workflows with automatic guard verification
**When to Use**: Complex refactorings requiring multiple sequential changes
```bash
# Load and apply a saved plan with auto-verified guards
node tools/dev/js-edit.js --file src/app.js --from-plan saved-plan.json --fix --json
```

### Integrated Agent Refactoring Pattern (Full Tier 1)

**Complete workflow for safe, batch refactoring**:

```bash
# Phase 1: Discovery (Gap 2)
node tools/dev/js-scan.js --what-imports src/oldModule.js --json
node tools/dev/js-scan.js --export-usage targetExport --json

# Phase 2: Plan (off-line analysis + prepare changes.json)

# Phase 3: Safe Application (Gap 3)
# Step 1: Preview
node tools/dev/js-edit.js --file consumer1.js --dry-run --changes changes.json --json
# Step 2: Apply if preview looks good
node tools/dev/js-edit.js --file consumer1.js --changes changes.json --fix --emit-plan --json

# Phase 4: Verify (Gap 2 validation)
node tools/dev/js-scan.js --search targetFunction --json
```

**Time Savings**: 60-90 min (manual) → 10-15 min (with tools) = 75-80% faster

### Documentation & References

- **`/docs/TOOLING_IMPROVEMENTS_BEYOND_GAP_3.md`** - Advanced features (Tier 2 & 3)
- **`/docs/AGENT_REFACTORING_PLAYBOOK.md`** - Detailed workflows with real examples
- **`/tools/dev/README.md`** - CLI reference for both tools
- **`/docs/TOOLING_GAPS_2_3_PLAN.md`** - Technical specifications

### Key Principles

✅ **Always use Gap 2 (--what-imports) before making breaking changes**
✅ **Always use Gap 3 (--dry-run) to preview batch changes first**
✅ **Never apply 10+ changes without dry-run verification**
✅ **Emit plans (--emit-plan) for complex multi-step refactorings**
⛔ **Never directly edit files without understanding full usage graph**

---

## Strategic Analysis Mode

Are there further features or incremental improvements to the tooling and agent documents that would enable agents to quickly make focused and accurate changes to the JS code? What can you think of?

Look at the files in the project to determine what workflows may benefit agent operations. Propose specific, actionable improvements that would help agents work more effectively with the JavaScript codebase and related documentation.

You are welcome to use Python to prototype algorithmic ideas and for scripting, though if you intend for files to be kept in the codebase, prefer JavaScript for compatibility.