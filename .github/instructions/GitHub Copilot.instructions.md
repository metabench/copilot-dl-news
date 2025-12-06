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

## ⚠️ SESSION FIRST — MANDATORY FOR ALL NON-TRIVIAL WORK

**Create a session BEFORE writing ANY code** unless the task is:
- A single command (e.g., `Stop-Process -Name node -Force`)
- A one-file edit under ~30 lines with zero risk of side effects
- A direct question requiring no code changes

**For EVERYTHING else — create a session first:**

```bash
node tools/dev/session-init.js --slug "<short-name>" --type "<category>" --title "<Title>" --objective "<one-liner>"
```

This creates `docs/sessions/YYYY-MM-DD-<slug>/` with PLAN.md, WORKING_NOTES.md, SESSION_SUMMARY.md.

**Why sessions matter:**
- 🧠 **Memory**: Sessions are the AI agent's persistent memory across conversations
- 🔍 **Discoverability**: Future agents can search and learn from past sessions
- 📊 **Progress tracking**: Plans show what's done, what's blocked, what's next
- 🛡️ **Risk reduction**: Forces you to think before coding; catches scope creep early

**When in doubt, create a session.** The 30 seconds it takes will save hours of context reconstruction later.

## 🔗 LINKED MODULE EDITS — ELEVATED REQUIREMENTS

**If npm link is active**, editing files in `node_modules/` may modify SHARED LIBRARY SOURCE CODE that affects multiple projects.

### Before ANY Linked Module Edit

1. **SESSION IS MANDATORY** — No exceptions, no "quick fixes"
   ```bash
   node tools/dev/session-init.js --slug "jsgui3-<change>" --type "linked-module" --title "<Title>" --objective "<goal>"
   ```

2. **Verify link status first**:
   ```powershell
   Get-Item node_modules/jsgui3-html | Select-Object LinkType
   # If LinkType is empty → normal npm install (safe to ignore)
   # If LinkType is "SymbolicLink" → YOU ARE EDITING SHARED SOURCE
   ```

3. **DISCUSS before creating branches** — Do NOT create git branches in linked repos without explicit user approval. Direct edits to main are acceptable for safe, well-documented changes.

4. **Document everything in session**:
   - What file(s) you're changing
   - Why the change is needed
   - Test results before/after
   - Both repos' test results

5. **Run BOTH test suites** (when available):
   - Linked module's own tests
   - This repo's integration tests

### Why This Matters

Linked module changes:
- ❌ Cannot be easily reverted with `git checkout`
- ❌ Affect every project using that module
- ❌ Are invisible to `git status` in this repo
- ✅ Must be tracked via session documentation

**See**: `docs/designs/NPM_LINK_DEVELOPMENT_NEXUS.md` for full workflow.

**Common mistakes to avoid:**
- ❌ Creating plans in `docs/plans/` instead of session directory
- ❌ Putting notes in `tmp/` (not searchable, not persistent)
- ❌ Starting code before the session directory exists
- ❌ Skipping sessions for "quick" multi-file changes (they're never quick)
- ❌ Thinking "this is too small for a session" when touching >1 file

Sessions are the **memory system** for AI agents. See `docs/sessions/SESSIONS_HUB.md`.

---

**CRITICAL CHANGE (October 2025)**: AGENTS.md has been modularized. It's now a navigation hub (~1200 lines, target ~800) that delegates to specialized quick references:
- `docs/COMMAND_EXECUTION_GUIDE.md` - Before ANY terminal operations
- `docs/TESTING_QUICK_REFERENCE.md` - Before running/writing tests  
- `docs/DATABASE_QUICK_REFERENCE.md` - Before database operations

Read AGENTS.md Topic Index FIRST to understand available docs, then jump to relevant specialized references.

- ✅ **Accept the role**: Identify yourself as GitHub Copilot, assume full autonomy, and only stop when the task is complete or genuinely blocked.
- ✅ **Continuous execution mandate**: Once you start a plan, keep advancing through its tasks without waiting for permission or pausing after partial progress. Deliver summaries only when the plan is exhausted or every remaining item is truly blocked.
- ✅ **Single-phase careful refactors**: When engaged in a careful refactor workflow, enumerate every task at the outset and treat the entire effort as one phase. Use sub-phases (deep discovery, planning, implementation, validation) internally, record the active sub-phase in the tracker, and progress autonomously until the full task list is complete or blocked.
- ✅ **Knowledge-First Protocol**: When methodology isn't totally clear, output `[KNOWLEDGE GAP] Topic: <what you need>` to console, scan docs with `node tools/dev/md-scan.js --dir docs --search "<topic>" --json`, read relevant docs, then proceed. If you figure something out that wasn't documented, **update docs immediately before continuing**.
- ✅ **Deep discovery first**: Before coding, inventory relevant docs (use `AGENTS.md` Topic Index and linked references) and catalogue existing CLI tooling. Decide which analyzers to run, where to extend tooling, and capture findings in the tracker prior to implementation.
- ✅ **Read first (right-sized)**: For multi-file or novel work, check AGENTS.md Topic Index (30 seconds), then read relevant quick reference (2-5 min). For single-file changes under ~50 lines, rely on immediate context.
- ✅ **Analysis triage**: Default to minimum reconnaissance—check quick references first, expand to complete guides only when needed.
- ✅ **STOP RESEARCHING EARLY**: If you've read >3 docs or searched >3 times without starting, you're in analysis paralysis. Start coding with what you know.
- ✅ **Attachments are gold**: User-provided attachments contain exact context. Don't re-read from disk. Check them FIRST.
- ✅ **One search, one read, start coding**: For UI features, one search + one example = enough to start. Don't map entire codebase.
- ✅ **Simple first, refine later**: Implement simplest version, test, then iterate. Don't design perfect solution before coding.
- ✅ **Trivial commands, no plan**: When a request is clearly solved by a single, low-risk shell/Node command (e.g., `Stop-Process -Name node -Force`), run it immediately without spinning up a todo list or multi-step plan—just execute and report the outcome.
- ✅ **Clean exits**: Ensure scripts (especially verification/test scripts) close all resources (DBs, timers) and exit with code 0/1. Don't leave processes hanging.
- 🚨 **NEVER run servers without --check**: Servers are long-running processes that block forever. ALWAYS use `node server.js --check` to verify startup, or use `isBackground: true` if you need the server running. Running `node server.js` directly will hang the terminal indefinitely. See `docs/COMMAND_EXECUTION_GUIDE.md` for details.
- ✅ **Adhere to "no mid-task confirmation" rule**: Proceed without pausing unless critical details missing. Summaries: 1–2 sentences max.
- ✅ **Documentation alignment**: When rules change, update specialized docs (not AGENTS.md unless navigation-related). Keep AGENTS.md <500 lines.
- ✅ **No standalone documents**: Always integrate into existing docs, never create new standalone guides
- ✅ **OS Awareness**: Always maintain awareness that this repository runs on **Windows** with **PowerShell**. However, prefer cross-platform Node.js commands (`node <script>`) over PowerShell-specific syntax when possible. When PowerShell is required, set UTF-8 encoding (`[Console]::OutputEncoding = [System.Text.Encoding]::UTF8`) before running tools with Unicode output, and avoid Unix-style pipes that may cause encoding issues.
- ✅ **Automate tricky filesystem work**: If shell commands struggle with paths containing emojis, leading spaces, or other quoting landmines, pause and write a tiny throwaway Node script (drop it under `tmp/`) to do the rename/copy/move. Running the helper via `node tmp/<script>.js` is faster than fighting PowerShell quoting, and you can delete it afterward.
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

### Schema Synchronization (Database Changes)

**After ANY database schema change** (migrations, ALTER TABLE, new tables), sync the schema definitions:

```bash
npm run schema:sync     # Regenerate schema-definitions.js
npm run schema:check    # Verify no drift (CI gate)
npm run schema:stats    # Regenerate with table statistics
```

**Workflow integration**:
1. **After running migrations**: Always run `npm run schema:sync`
2. **Before PR merge**: Run `npm run schema:check` to verify sync
3. **In DB adapter work**: Consult `src/db/sqlite/v1/schema-definitions.js` for current schema

**Files affected**:
- `src/db/sqlite/v1/schema-definitions.js` - Canonical schema definitions (auto-generated)
- `docs/database/_artifacts/news_db_stats.json` - Table statistics

See `tools/schema-sync.js --help` for all options.

## Facts vs Classifications (Critical Distinction)

**When working on classification, article detection, or data analysis code, understand this foundational distinction:**

| Concept | Facts | Classifications |
|---------|-------|------------------|
| **Nature** | Objective observations | Subjective judgments |
| **Question** | "Does it have X?" | "What is it?" |
| **Example** | "URL contains /2024/01/15/" | "This is a news article" |

**Key Principles:**

1. **Facts are NEUTRAL** — They observe structure without judging good/bad or positive/negative
2. **Facts are OBJECTIVE** — Verifiable, reproducible, no interpretation
3. **Classifications CONSUME facts** — Boolean logic (AND/OR/NOT) combines facts into decisions
4. **No weighted signals** — Pure boolean TRUE/FALSE at the fact layer

**Wrong approach:**
```javascript
// ❌ Treating structural observations as "negative signals"
if (hasPagination) score -= 10;  // Pagination isn't inherently bad!
```

**Right approach:**
```javascript
// ✅ Facts are neutral observations
const facts = {
  'url.hasPaginationPattern': true,  // Just an observation
  'url.hasDateSegment': false,
  'schema.hasArticleType': false
};
// Classification rules decide what combinations mean
```

See `docs/designs/FACT_BASED_CLASSIFICATION_SYSTEM.md` for architecture.
See `src/facts/` for implementation (`FactBase`, `UrlFact`, `HasDateSegment`, etc.).

### Documentation References
- `docs/AGENT_REFACTORING_PLAYBOOK.md` - Detailed agent workflows using both tools
- `tools/dev/README.md` - Complete CLI documentation and examples
- `AGENTS.md` - Core agent patterns and decision workflows

## jsgui3 UI Component Rules

When building UI components with jsgui3, follow these mandatory patterns:

### Workflow-First Requirement

- Before editing any jsgui3 surface, skim the current workflows with `node tools/dev/md-scan.js --dir docs --search "jsgui3 workflow" --json` (or a narrower term such as `control registration`).
- Note the sections you will rely on in your session notes; if the workflow is missing details, you must update `docs/guides/JSGUI3_UI_ARCHITECTURE_GUIDE.md` (or the relevant workflow doc) before shipping.
- When you discover another activation/registration path, append it to the workflow doc and drop a pointer here so future agents can find it via md-scan.

### Control Extraction (Non-Negotiable)

**Rule**: Any UI component that could be reused, has its own state, or handles user interaction **MUST** be a separate jsgui3 Control class.

| Signal | Action |
|--------|--------|
| Interactive (click, keyboard) | Extract to control with `activate()` |
| Reusable across views | Extract to `src/ui/controls/` |
| Has state (open/closed, selected) | Extract with state in constructor |
| >30 lines inline in `_build*` | Extract to dedicated control |

**❌ Anti-pattern**: Context menu as inline JS/CSS
```javascript
// WRONG - scattered event handlers, untestable
function showContextMenu(x, y) { ... }
function hideContextMenu() { ... }
```

**✅ Pattern**: Dedicated control class
```javascript
// RIGHT - testable, reusable, discoverable
class ContextMenuControl extends jsgui.Control { ... }
```

### Emoji Icons for Visual Discoverability (Required)

Use emoji icons for instant visual recognition in UI elements:

| Action | Emoji | Action | Emoji |
|--------|-------|--------|-------|
| Search | 🔍 | Settings | ⚙️ |
| Add | ➕ | Delete | 🗑️ |
| Edit | ✏️ | Refresh | 🔄 |
| Sort ↑ | ▲ | Sort ↓ | ▼ |
| Menu | ☰ | More | ⋮ |
| Close | ✕ | Success | ✅ |
| Error | ❌ | Warning | ⚠️ |
| Folder | 📁 | File | 📄 |

**Example**:
```javascript
// Search input with magnifying glass
const icon = new jsgui.Control({ context: this.context, tagName: "span" });
icon.add("🔍");
searchWrapper.add(icon);
```

See `docs/guides/JSGUI3_UI_ARCHITECTURE_GUIDE.md` for complete patterns.

### jsgui3 Performance (Critical)

**Control count is THE dominant performance factor in jsgui3.**

Each Control creates multiple objects and string operations. This compounds:
- 100 items × 10 controls each = 1,000 control objects
- 850 items × 10 controls each = 8,500 control objects → **883ms render time**

**Performance Decision Matrix:**

| Dataset Size | Pattern | Example |
|--------------|---------|---------|
| <50 items | Render all | Simple lists, small menus |
| 50-200 items | Conditional complexity | Use simpler controls for non-critical items |
| 200-1000 items | **Lazy rendering** | Load children on demand |
| 1000+ items | Virtual scrolling | Only render visible viewport |

**Lazy Rendering Pattern (Validated - 55% faster):**

```javascript
// Server-side: Only render expanded/visible content
compose() {
  this.items.forEach(item => {
    if (this._shouldRenderNow(item)) {
      this.add(new ItemControl({ context: this.context, item }));
    } else {
      // Placeholder for lazy loading
      const placeholder = new jsgui.Control({ context: this.context, tagName: 'div' });
      placeholder.dom.attributes['data-lazy-id'] = item.id;
      this.add(placeholder);
    }
  });
}

// API endpoint for lazy loading
app.get('/api/lazy/:id', (req, res) => {
  const ctrl = new ItemControl({ context, item: findById(req.params.id) });
  res.send(ctrl.all_html_render());
});

// Client-side: Load on demand
async function loadLazy(el) {
  const html = await fetch(`/api/lazy/${el.dataset.lazyId}`).then(r => r.text());
  el.outerHTML = html;
}
```

**Before optimizing, ALWAYS measure:**
```javascript
// Create diagnostic script first
const start = performance.now();
const page = buildPage(data);
console.log(`Tree: ${performance.now() - start}ms`);
const html = page.all_html_render();
console.log(`HTML: ${(html.length / 1024).toFixed(0)}KB`);
```

**Real-world result**: Docs viewer 850 files: 1256ms → 565ms (55% faster), 1489KB → 382KB HTML (74% smaller).

## SVG Diagram Creation (MANDATORY Validation)

When creating SVG diagrams, **you cannot "see" the output**. You must use tooling to verify layout correctness.

### The Problem

AI agents reason about SVG coordinates mathematically, but:
- Nested `transform="translate(x,y)"` makes absolute positions non-obvious
- Text length in pixels is hard to estimate
- Visual overlaps are invisible without rendering

**Without validation, you WILL deliver broken diagrams.**

### The Solution: Always Run Collision Detection

```bash
# MANDATORY before declaring any SVG complete:
node tools/dev/svg-collisions.js your-diagram.svg --strict
```

### Pass Criteria

| Severity | Requirement |
|----------|-------------|
| 🔴 HIGH | **Zero** (text overlaps, unreadable content) |
| 🟡 LOW | Review individually (intentional overlaps OK) |

### If Issues Are Found

1. Read the collision report (gives element types and pixel overlap)
2. Fix the SVG: adjust positions, shorten text, expand containers
3. Re-run validation until zero HIGH issues

### Methodology Reference

See `docs/guides/SVG_CREATION_METHODOLOGY.md` for:
- Complete 6-stage workflow
- Theme colors and typography
- Component library patterns
- Layout algorithms

**Never skip validation.** The tool is your eyes.

# GitHub Copilot — GPT-5 Codex playbook (Pointer)

This file now defers to AGENTS.md for all authoritative instructions. Follow the same process as any agent (session first, plan, verify, document). Use the specialized guides for detail:

- Primary playbook: [AGENTS.md](AGENTS.md)
- Command execution: [docs/COMMAND_EXECUTION_GUIDE.md](docs/COMMAND_EXECUTION_GUIDE.md)
- Testing quick reference: [docs/TESTING_QUICK_REFERENCE.md](docs/TESTING_QUICK_REFERENCE.md)
- Database quick reference: [docs/DATABASE_QUICK_REFERENCE.md](docs/DATABASE_QUICK_REFERENCE.md)

No additional Copilot-only rules remain; stay aligned with AGENTS.md and the linked guides.
### ⚠️ MANDATORY: Framework/Library Discovery Documentation


