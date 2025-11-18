---
description: 'Improves AI agent capabilities through strategic analysis and implementation.'
tools: ['edit', 'runNotebooks', 'search', 'new', 'runCommands', 'runTasks', 'microsoft/playwright-mcp/*', 'usages', 'vscodeAPI', 'problems', 'changes', 'testFailure', 'openSimpleBrowser', 'fetch', 'githubRepo', 'ms-python.python/getPythonEnvironmentInfo', 'ms-python.python/getPythonExecutableCommand', 'ms-python.python/installPythonPackage', 'ms-python.python/configurePythonEnvironment', 'extensions', 'todos', 'runSubagent', 'runTests']
---

## Binding Plugin Extensions within jsgui3

- Treat the binding plugin work in this repo as an **official jsgui3 extension set**. You have explicit freedom to evolve improved data-binding behaviors here (server or client) so long as they integrate via the plugin hooks and stay compatible with upstream jsgui3 packages.
- Prefer encapsulating enhancements inside reusable helpers/plugins so they can be upstreamed or shared with other jsgui3 apps later without blocking this project.
- Document any significant binding capability changes inside `docs/sessions/` plus the usual agent guides so future contributors understand how to re-use the plugin system at lower levels of the platform.

## Session Documentation Protocol

- **Create a session folder first.** Every session (planning, development, validation) must live inside `docs/sessions/<yyyy-mm-dd>-<short-slug>/`. Do **not** drop long-form notes in `tmp/`—promote them into the session folder immediately so they become part of the permanent record.
- **Treat session docs as memory layers.** The current session folder is your short/medium-term memory (roadmap, summary, follow-ups, agent guidance). Previous session folders act as long-term memory. Use them to avoid rediscovering prior decisions.
- **Use the docs hub.** Update `docs/sessions/SESSIONS_HUB.md` with links to the new folder and consult it before starting work so you inherit outstanding follow-ups.
- **Search before you write.** Prefer the repo tooling (`node tools/dev/md-scan.js --dir docs/sessions --search <term> --json`, `node tools/dev/js-scan.js --dir docs --find-pattern <pattern>`) to sweep current + past sessions. Aim to surface relevant context into your working window instead of rewriting it from scratch.

## Checking scripts live next to the feature

- Every time you introduce or modify a jsgui3 control, router view, or HTML helper, add a tiny Node-based "checking" script under a sibling `checks/` folder (e.g., `src/ui/controls/checks/ConfigMatrixControl.check.js`).
- Keep checks short: construct the control with realistic data, render it, and log/assert the bits that must never change. No global harness—just `node path/to/check`. Fixtures live beside the check so context stays local.
- Reference the check script in your plan/tests and mention it inside the session notes so other agents know how to replay the HTML verification without running the full Jest suite.

## Process Lifecycle & Cleanup

- **Ensure clean exits.** All scripts (especially verification tools, one-off checks, and CLI tools) must exit cleanly. Explicitly close database connections, clear intervals, and unref timers in a `finally` block.
- **No hanging processes.** Hanging processes block CI and confuse users. If a script doesn't exit, it's a bug.

## JavaScript Code Refactoring & Analysis Workflow

**CRITICAL: Before making any changes to JavaScript code, use the CLI tools below for discovery and safe application. Treat `js-scan` and `js-edit` as the default interface for understanding and editing code—open files manually only after the tools have mapped out the terrain.**

### CLI Discipline & Improvement Expectations

- **Run the tools first, then act.** Every investigation starts with `js-scan` (Gap 2) to inventory dependencies/usages and ends with `js-edit` (Gap 3) dry-runs before any patch lands.
- **Prefer scripted edits over manual ones.** When touching more than a trivial hunk, encode the change as a `js-edit` plan (JSON) so future agents can replay or extend it.
- **Continuously sharpen the tooling.** When you discover a missing flag, awkward workflow, or slow path, log it in `docs/sessions/<date>-strategic-analysis/WORKING_NOTES.md`, then either extend the CLI immediately or file a targeted follow-up (Gap 4 plans). Small improvements (new `--search-text`, better diagnostics, guardrails) should ship the same session.
- **Benchmark the tools themselves.** If a large refactor feels slow, capture timing before/after in `tmp/.ai-metrics/` and update `docs/TOOLING_IMPROVEMENTS_BEYOND_GAP_3.md` with the delta.

### Terse + Bilingual CLI I/O Expectations

- **Default to compact machine-readable output.** Run `js-scan`/`js-edit` with `--json --ai-mode` (or `--compact`) so discovery/apply steps stay terse enough for agent pipelines. Only fall back to verbose text when a human explicitly needs it.
- **Leverage bilingual aliases when scanning docs or code.** All Gap 2/3 CLIs honor the alias grid defined in `tools/dev/i18n/dialect.js`. Example: `node tools/dev/js-scan.js --搜 renderUrlTable --限 5 --json` mirrors `--search/--limit` but keeps headings bilingual so mixed-language teammates stay in sync.
- **Force locales intentionally.** Use `--lang zh`, `--lang en`, or `--lang bilingual` when mixing English + Chinese flags to prevent formatter confusion. Match this with doc updates referencing `docs/CLI_REFACTORING_QUICK_START.md` so future agents see the exact spellings.
- **Document the selected mode each session.** When you switch to terse/bilingual I/O, note the command variant inside the active `docs/sessions/<date>-<slug>/WORKING_NOTES.md` so the replay plan preserves locale, alias choices, and any continuation token you captured.

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

## Tooling Improvement Mandate

- **Default to contributing upstream.** When you extend `js-scan`/`js-edit`, add tests under `tests/tools/` and reference the change in `tools/dev/README.md`.
- **Document every enhancement.** Capture before/after behavior, commands, and any new flags in the current session folder plus `docs/AGENT_REFACTORING_PLAYBOOK.md` so future agents inherit the capability.
- **Escalate blockers quickly.** If the CLI lacks a feature you need within the current session, either add it or record an actionable follow-up (owner, path, CLI flag) before moving on—do not proceed with manual edits as a workaround.