---
description: "Directive set for GitHub Copilot when paired with GPT-5 Codex models"
applyTo: "**"
---

# GitHub Copilot — GPT-5 Codex playbook

**When to Read**: This document contains critical, repository-specific instructions for the GitHub Copilot agent. It should be reviewed by the agent at the beginning of any complex task to ensure its behavior aligns with project standards and best practices.

**Primary Documentation**: **`AGENTS.md`** is the main document for all AI agents working in this repository. It contains core patterns, workflows, and project structure that apply to all AI assistants.

**This Document's Purpose**: These Copilot-specific instructions supplement AGENTS.md with:
1. **Command Execution Rules** - How to avoid VS Code approval dialogs in PowerShell
2. **Documentation Index** - Quick navigation to specialized guides for specific tasks
3. **Copilot-Specific Workflows** - Patterns optimized for GitHub Copilot's capabilities

These instructions apply when GitHub Copilot is running with the **GPT-5-Codex** or **GPT-5-Codex (Preview)** models inside this repository. Treat them as additional constraints on top of the workspace-wide guidance in `AGENTS.md`.

**CRITICAL CHANGE (October 2025)**: AGENTS.md has been modularized. It's now a navigation hub (~1200 lines, target ~800) that delegates to specialized quick references:
- `docs/COMMAND_EXECUTION_GUIDE.md` - Before ANY terminal operations
- `docs/TESTING_QUICK_REFERENCE.md` - Before running/writing tests  
- `docs/DATABASE_QUICK_REFERENCE.md` - Before database operations

Read AGENTS.md Topic Index FIRST to understand available docs, then jump to relevant specialized references.

- ✅ **Accept the role**: Identify yourself as GitHub Copilot, assume full autonomy, and only stop when the task is complete or genuinely blocked.
- ✅ **Continuous execution mandate**: Once you start a plan, keep advancing through its tasks without waiting for permission or pausing after partial progress. Deliver summaries only when the plan is exhausted or every remaining item is truly blocked.
- ✅ **Single-phase careful refactors**: When engaged in a careful refactor workflow, enumerate every task at the outset and treat the entire effort as one phase. Use sub-phases (deep discovery, planning, implementation, validation) internally, record the active sub-phase in the tracker, and progress autonomously until the full task list is complete or blocked.
- ✅ **Deep discovery first**: Before coding, inventory relevant docs (use `AGENTS.md` Topic Index and linked references) and catalogue existing CLI tooling. Decide which analyzers to run, where to extend tooling, and capture findings in the tracker prior to implementation.
- ✅ **Read first (right-sized)**: For multi-file or novel work, check AGENTS.md Topic Index (30 seconds), then read relevant quick reference (2-5 min). For single-file changes under ~50 lines, rely on immediate context.
- ✅ **Analysis triage**: Default to minimum reconnaissance—check quick references first, expand to complete guides only when needed.
- ✅ **STOP RESEARCHING EARLY**: If you've read >3 docs or searched >3 times without starting, you're in analysis paralysis. Start coding with what you know.
- ✅ **Attachments are gold**: User-provided attachments contain exact context. Don't re-read from disk. Check them FIRST.
- ✅ **One search, one read, start coding**: For UI features, one search + one example = enough to start. Don't map entire codebase.
- ✅ **Simple first, refine later**: Implement simplest version, test, then iterate. Don't design perfect solution before coding.
- ✅ **Trivial commands, no plan**: When a request is clearly solved by a single, low-risk shell/Node command (e.g., `Stop-Process -Name node -Force`), run it immediately without spinning up a todo list or multi-step plan—just execute and report the outcome.
- ✅ **Adhere to "no mid-task confirmation" rule**: Proceed without pausing unless critical details missing. Summaries: 1–2 sentences max.
- ✅ **Documentation alignment**: When rules change, update specialized docs (not AGENTS.md unless navigation-related). Keep AGENTS.md <500 lines.
- ✅ **No standalone documents**: Always integrate into existing docs, never create new standalone guides
- ✅ **OS Awareness**: Always maintain awareness that this repository runs on **Windows** with **PowerShell**. However, prefer cross-platform Node.js commands (`node <script>`) over PowerShell-specific syntax when possible. When PowerShell is required, set UTF-8 encoding (`[Console]::OutputEncoding = [System.Text.Encoding]::UTF8`) before running tools with Unicode output, and avoid Unix-style pipes that may cause encoding issues.
- ⛔ **No Python invocations**: Do not run `python`, `python3`, or inline Python snippets. Prefer Node.js tooling or PowerShell-native commands when scripts or quick data processing is required.

## JavaScript Code Editing Tools (Tier 1 Tooling Strategy)

**Critical**: When making changes to JavaScript code, reference and use the specialized CLI tools available:

### js-scan: Discovery & Analysis Tool
**Location**: `tools/dev/js-scan.js`
**Purpose**: Multi-file JavaScript discovery for code analysis and relationship queries

**Key Operations** (use with `node tools/dev/js-scan.js`):
- `--search <term>` - Search functions by name/pattern
- `--what-imports <target>` - Find all files that import this module/function (Gap 2)
- `--what-calls <function>` - Find all functions called by this target (Gap 2)
- `--export-usage <target>` - Comprehensive usage analysis (imports + calls + re-exports) (Gap 2)
- `--deps-of <file>` - Trace dependency graph
- `--ripple-analysis <file>` - Analyze refactoring impact
- `--build-index` - Build complete module index

**Agent Workflow for Refactoring**:
1. **Discovery**: Use `--what-imports src/old-module.js --json` to find all consumers before refactoring
2. **Risk Assessment**: Use `--export-usage targetFunction --json` to assess change risk (LOW/MEDIUM/HIGH)
3. **Dependency Mapping**: Use `--what-calls targetFunction --json` to find internal call sites
4. **Plan**: Batch changes based on discovered usage patterns

**Example**: Find all places importing a service before breaking changes
```bash
node tools/dev/js-scan.js --what-imports src/services/auth.js --json
```

**Risk Levels**:
- LOW: <5 usages → safe to refactor independently
- MEDIUM: 5-20 usages → run full test suite after changes
- HIGH: >20 usages → refactor carefully, update all importers simultaneously

### js-edit: Batch Code Modification Tool  
**Location**: `tools/dev/js-edit.js`
**Purpose**: Safe, verified code transformations with batch operations and atomic guards

**Key Operations** (use with `node tools/dev/js-edit.js`):
- `--file <path>` - Target source file (required for most operations)
- `--list-functions` - List all functions in target file
- `--search-text <substring>` - Search code snippets
- `--replace <selector>` - Specify what to replace
- `--with <source>` - Provide replacement code
- `--dry-run` - Preview changes without modifying (Gap 3)
- `--recalculate-offsets` - Recompute positions after batch changes (Gap 3)
- `--from-plan <file>` - Load and apply saved operation plan with guards (Plans)
- `--emit-plan` - Save operation guards for multi-step workflows (Plans)
- `--fix` - Apply changes after preview/verification
- `--json` - Structured output for agent consumption

**Agent Workflow for Safe Batch Edits** (Gap 3):
1. **Prepare**: Define changes in JSON format:
   ```json
   [
     { "file": "src/app.js", "startLine": 10, "endLine": 15, "replacement": "new code" },
     { "file": "src/utils.js", "startLine": 50, "endLine": 52, "replacement": "fixed logic" }
   ]
   ```
2. **Preview**: Use `--dry-run` to preview all changes without applying
3. **Check**: Review output for conflicts or issues
4. **Recalculate**: Use `--recalculate-offsets` if batch contains many changes
5. **Apply**: Use `--fix` only after dry-run confirmation
6. **Emit**: Use `--emit-plan` to save guards for continuity

**Example**: Safe refactoring with preview
```bash
# Step 1: Preview changes
node tools/dev/js-edit.js --file src/app.js --dry-run --changes changes.json --json

# Step 2: Apply if preview looks good  
node tools/dev/js-edit.js --file src/app.js --changes changes.json --fix --emit-plan --json
```

**Success Metrics**:
- Dry-run success: 95%+ (vs 60% manual)
- Batch size: Supports 50+ changes per batch
- Recovery time: <2 minutes (vs 15-20 min manual)

### Integrated Agent Refactoring Pattern (Full Tier 1)
**Recommended for complex, multi-file refactorings**:

```bash
# Phase 1: Discovery (Gap 2 - 2 minutes)
node tools/dev/js-scan.js --what-imports src/oldModule.js --json > importers.json
node tools/dev/js-scan.js --export-usage targetExport --json > usage.json
node tools/dev/js-scan.js --what-calls targetFunction --json > callsites.json

# Phase 2: Plan (offline analysis)
# Analyze results, identify all files needing changes, batch by similarity

# Phase 3: Safe Application (Gap 3 - 3 minutes)
# Create changes.json from analysis
node tools/dev/js-edit.js --file src/app.js --dry-run --changes changes.json --json
node tools/dev/js-edit.js --file src/app.js --changes changes.json --fix --emit-plan --json

# Phase 4: Verify (Gap 2 - 2 minutes)
node tools/dev/js-scan.js --search targetFunction --json  # Confirm changes applied
```

**Time Savings**: 60-90 min (manual) → 10-15 min (with tools) = 75-80% faster

### Documentation References
- `docs/AGENT_REFACTORING_PLAYBOOK.md` - Detailed agent workflows using both tools
- `tools/dev/README.md` - Complete CLI documentation and examples
- `AGENTS.md` - Core agent patterns and decision workflows

> **Never stop mid-plan**: When a task list exists, continue executing items back-to-back. Record blockers, then immediately pivot to the next actionable task instead of waiting for new instructions.

If an instruction here conflicts with a newer directive in `AGENTS.md`, defer to the latest `AGENTS.md` guidance and note the discrepancy in your summary.

