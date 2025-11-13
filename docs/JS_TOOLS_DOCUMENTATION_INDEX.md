# JS Tools Detailed Documentation Index

**Date:** November 11, 2025  
**Purpose:** Navigation guide linking brainstorm concepts to detailed supplementary documentation

This document helps you navigate between the high-level brainstorm ideas and the detailed technical guides that explain how to implement and use them.

---

## Quick Navigation

### For Each Brainstorm Section → Detailed Guide

| Brainstorm Section | Key Concepts | Detailed Guides |
|-------------------|--------------|-----------------|
| **Part 1: Multi-File Operations** | Move, extract, consolidate | [Multi-File Workflows Guide](#multifile-section) |
| **Part 2: Smart Search & Discovery** | Ripple analysis, patterns, visualization | [Ripple Analysis Guide](#ripple-section) + [AST Patterns Guide](#ast-section) |
| **Part 3: Workflow Acceleration** | Recipes, batch, health checks | [Recipe Specification](#recipe-section) + [Batch Operations](#batch-section) |
| **Part 4: CLI Ergonomics** | Interactive, templates, aggregation | [Batch Operations](#batch-section) (manifest/output section) |
| **Part 5: Performance** | Caching | [Batch Operations](#batch-section) (performance section) |
| **Part 6: Integration** | Pipes, replay | [Recipe Specification](#recipe-section) + [Batch Operations](#batch-section) |
| **Part 7: Safety** | Verification, rollback | [Batch Operations](#batch-section) (safety & rollback sections) |

---

## Detailed Documentation Files

<a name="ast-section"></a>

### 1. AST Pattern Matching Guide
**File:** `docs/JS_TOOLS_AST_PATTERNS_GUIDE.md`

**Covers:**
- What are AST patterns and why they matter
- Pattern syntax (node types, modifiers, operators)
- Common patterns (error handling, database access, state management)
- Advanced patterns (composition, negation, argument matching)
- Performance considerations
- Troubleshooting

**Use when:**
- Implementing **Section 2.2 (Cross-Module Search)** with pattern matching
- Understanding semantic code discovery beyond text search
- Writing queries like `async + call('db.') + ~try`
- Learning how to detect architectural issues (error handling gaps, over-coupling)

**Key sections:**
- **Pattern Syntax** (p. 2-3) — Master the DSL
- **Common Patterns** (p. 4-7) — Ready-to-use examples
- **Advanced Patterns** (p. 8-10) — Composition and complex queries
- **Performance Considerations** (p. 11-12) — Don't let queries get slow

**Example usage:**
```bash
node tools/dev/js-scan.js --pattern "async + call('db.') + ~try" \
  --cross-module --scope src/
# Uses AST pattern syntax from this guide
```

---

<a name="recipe-section"></a>

### 2. Recipe Format Specification & Guide
**File:** `docs/JS_TOOLS_RECIPE_SPECIFICATION.md`

**Covers:**
- Recipe structure (JSON/YAML format)
- Parameters and variable substitution
- Operation reference (js-scan, js-edit operations)
- Data flow between steps
- Conditional logic and loops
- Built-in recipes
- Advanced techniques (multi-phase, conditional extraction)
- Troubleshooting

**Use when:**
- Implementing **Section 3.1 (Refactor Recipe Mode)**
- Creating reusable refactoring workflows
- Chaining operations with variable passing
- Building complex multi-step refactors with error handling

**Key sections:**
- **Recipe Structure** (p. 2-4) — Understand JSON schema
- **Operation Reference** (p. 5-9) — All available operations
- **Data Flow & Variables** (p. 10-12) — How steps communicate
- **Conditional Logic** (p. 13-14) — Branching and loops
- **Examples** (p. 16-20) — Full end-to-end recipes

**Example usage:**
```bash
node tools/dev/js-edit.js --recipe recipes/move-and-consolidate.json \
  --param function="formatDate" \
  --param targetFile="src/utils/date.js" \
  --fix
```

---

<a name="ripple-section"></a>

### 3. Ripple Analysis & Dependency Tracing Guide
**File:** `docs/JS_TOOLS_RIPPLE_ANALYSIS_GUIDE.md`

**Covers:**
- Ripple analysis concept and value proposition
- How the dependency graph works (layers)
- Algorithm steps and call graph building
- Risk scoring and safety assertions
- Impact assessment (zones, circular dependencies)
- Command reference with options
- Interpreting results
- Practical scenarios
- Advanced usage (candidates for extraction, over-coupling detection)
- Combining with other tools

**Use when:**
- Implementing **Section 2.1 (Ripple Analysis)**
- Understanding impact before refactoring
- Making safe refactoring decisions
- Quantifying risk (should I rename? change signature? delete?)
- Finding architectural issues

**Key sections:**
- **How Ripple Analysis Works** (p. 3-6) — The algorithm
- **Risk Scoring** (p. 7-10) — How risk is calculated
- **Interpreting Results** (p. 14-17) — What outputs mean
- **Practical Scenarios** (p. 18-22) — Real decision-making examples

**Example usage:**
```bash
node tools/dev/js-scan.js --ripple-analysis "fetchUser" \
  --file src/api/user.js --scope src/ --json
# Returns risk assessment: can rename? safe to delete?
```

---

<a name="multifile-section"></a>

### 4. Multi-File Workflow Examples & Walkthroughs
**File:** `docs/JS_TOOLS_MULTIFILE_WORKFLOWS.md`

**Covers:**
- Multi-file extract & move (detailed walkthrough)
- Multi-file search & replace / global rename (detailed walkthrough)
- Multi-file import consolidation (detailed walkthrough)
- Extract to new module (detailed walkthrough)
- Complex scenarios with recipes
- Troubleshooting multi-file operations
- Tips for success

**Use when:**
- Implementing **Section 1.1-1.4 (Multi-File Operations)**
- Learning by example (step-by-step walkthroughs)
- Solving real refactoring problems
- Handling errors and recovery

**Key sections:**
- **Multi-File Extract & Move** (p. 2-8) — Move function to new file, update imports
- **Multi-File Search & Replace** (p. 9-15) — Rename globally (30+ files, 50+ call sites)
- **Multi-File Import Consolidation** (p. 16-20) — Normalize import paths
- **Extract to New Module** (p. 21-28) — Split large file into focused modules
- **Troubleshooting** (p. 29-32) — Common issues and recovery

**Example usage:**
```bash
# From the walkthrough: Move formatDate function
node tools/dev/js-edit.js --recipe recipes/move-date-utils.json \
  --dry-run --emit-diff
# Then: --fix
```

---

<a name="batch-section"></a>

### 5. Batch Operations Architecture & Guide
**File:** `docs/JS_TOOLS_BATCH_OPERATIONS.md`

**Covers:**
- Batch operations overview and use cases
- Batch mode architecture (execution pipeline)
- Transaction context and atomic semantics
- Manifest format (complete specification)
- Error handling strategies (atomic, best-effort, strict)
- Rollback mechanism (how it works, commands, storage)
- Command reference for all batch transformations
- Practical examples
- Performance optimization
- Troubleshooting

**Use when:**
- Implementing **Section 3.2 (Batch File Surgery)** and **Section 7.2 (Rollback Tracking)**
- Applying same transformation to many files
- Understanding safety mechanisms (rollback, atomic transactions)
- Optimizing performance for large-scale changes
- Handling errors across multiple files

**Key sections:**
- **Batch Mode Architecture** (p. 3-6) — Execution pipeline
- **Manifest Format** (p. 7-12) — What's recorded and how
- **Error Handling Strategy** (p. 13-18) — Atomic vs. best-effort
- **Rollback Mechanism** (p. 19-25) — Safety net for large operations
- **Command Reference** (p. 26-33) — All batch operations
- **Performance Optimization** (p. 40-48) — Tuning for speed

**Example usage:**
```bash
# From the guide: Add logger import to 20 handler files
js-edit --batch --pattern "src/**/*.handler.js" \
  --add-import "const { logger } = require('../log');" \
  --insert-after "^use strict" \
  --skip-if-exists \
  --enable-rollback \
  --fix --emit-summary
```

---

## Concept Cross-References

### Recipes Are Built On Batch Operations

```
Recipe (3.1)
  ↓
  Chains multiple operations
  ↓
  Each operation might use batch mode (3.2)
  ↓
  Each batch step uses error handling (7.1) and rollback (7.2)
```

### Ripple Analysis Informs Batch Safety

```
Ripple Analysis (2.1)
  ↓
  Tells you: "This function is used in 50 call sites"
  ↓
  Informs batch planning: Should we use atomic mode?
  ↓
  Batch Operations (3.2) with appropriate error handling
```

### AST Patterns Power Cross-Module Search

```
AST Patterns (from 2.2)
  ↓
  Enable semantic queries: "find all error handlers"
  ↓
  Can be used in js-scan patterns
  ↓
  Results feed into recipes or batch operations
```

### Multi-File Workflows Use Recipes and Batch

```
Multi-File Operations (1.1-1.4)
  ↓
  Can be implemented via:
  ├─ Recipes (3.1) — complex, reusable
  └─ Batch (3.2) — simple, uniform changes
```

---

## How to Use These Guides Together

### Scenario 1: "I need to move a function to a new file and update 30 call sites"

1. Read **Multi-File Workflows** (section 1.1) for step-by-step walkthrough
2. Reference **Recipe Specification** to understand operation syntax
3. Use **Ripple Analysis Guide** to assess impact first
4. Execute using recipe + batch operations

**Files needed:**
- `JS_TOOLS_MULTIFILE_WORKFLOWS.md` (main guide)
- `JS_TOOLS_RECIPE_SPECIFICATION.md` (for operation syntax)
- `JS_TOOLS_RIPPLE_ANALYSIS_GUIDE.md` (for impact assessment)

### Scenario 2: "I want to find all unprotected database calls (async without try/catch)"

1. Read **AST Patterns Guide** to learn pattern syntax
2. Reference **Ripple Analysis** to understand usage depth
3. Craft query: `pattern "async + call('db.') + ~try"`
4. Use js-scan cross-module search

**Files needed:**
- `JS_TOOLS_AST_PATTERNS_GUIDE.md` (main guide)
- `JS_TOOLS_RIPPLE_ANALYSIS_GUIDE.md` (optional, for understanding impact)

### Scenario 3: "I need to rename a class across 50+ files safely"

1. Run **Ripple Analysis** to understand scope and risk
2. Use **Batch Operations** guide for large-scale rename
3. Plan multi-phase approach if high risk
4. Use rollback capability for safety

**Files needed:**
- `JS_TOOLS_RIPPLE_ANALYSIS_GUIDE.md` (understand risk)
- `JS_TOOLS_BATCH_OPERATIONS.md` (execute rename safely)
- `JS_TOOLS_RECIPE_SPECIFICATION.md` (if creating reusable recipe)

### Scenario 4: "I want to automate a complex refactoring that other team members can reuse"

1. Study **Recipe Specification** for all available operations
2. Reference **Data Flow & Variables** section for chaining
3. Create multi-phase recipe with error handling
4. Document with examples
5. Test with dry-run before sharing

**Files needed:**
- `JS_TOOLS_RECIPE_SPECIFICATION.md` (main guide)
- `JS_TOOLS_MULTIFILE_WORKFLOWS.md` (for examples)
- `JS_TOOLS_BATCH_OPERATIONS.md` (for error handling/rollback in recipes)

---

## Learning Path

If you're new to these tools, we recommend this learning order:

1. **Start with Multi-File Workflows** (`JS_TOOLS_MULTIFILE_WORKFLOWS.md`)
   - Real-world examples
   - Step-by-step walkthroughs
   - Build intuition first

2. **Then learn Ripple Analysis** (`JS_TOOLS_RIPPLE_ANALYSIS_GUIDE.md`)
   - Understand impact and risk
   - Make better decisions
   - Builds on multi-file concepts

3. **Then learn AST Patterns** (`JS_TOOLS_AST_PATTERNS_GUIDE.md`)
   - For advanced discovery
   - Semantic code search
   - Optional for basic usage

4. **Then learn Recipes** (`JS_TOOLS_RECIPE_SPECIFICATION.md`)
   - For reusable workflows
   - Chaining operations
   - Conditional logic

5. **Finally learn Batch Operations** (`JS_TOOLS_BATCH_OPERATIONS.md`)
   - For large-scale changes
   - Safety and rollback
   - Performance optimization

---

## Quick Reference: Which Guide for What Task?

| Task | Primary Guide | Secondary Guides |
|------|--------------|------------------|
| Move a function to new file | Multi-File Workflows | Recipe Spec |
| Rename function globally | Batch Operations | Ripple Analysis |
| Find error handling gaps | AST Patterns | Ripple Analysis |
| Consolidate imports | Multi-File Workflows | Batch Operations |
| Extract functions to module | Multi-File Workflows | Recipe Spec |
| Assess refactoring risk | Ripple Analysis | Multi-File Workflows |
| Create reusable refactor workflow | Recipe Specification | Batch Operations |
| Apply same change to many files | Batch Operations | Recipe Spec |
| Understand what changed after refactor | Batch Operations (Manifest section) | Multi-File Workflows |
| Recover from failed refactor | Batch Operations (Rollback section) | Multi-File Workflows |

---

## Common Patterns Explained Across Guides

### Pattern: Error Handling in Batch Operations

**Where explained:**
- `JS_TOOLS_BATCH_OPERATIONS.md` → Error Handling Strategy (p. 13-18)
- `JS_TOOLS_RECIPE_SPECIFICATION.md` → Conditional Logic (p. 13-14)

**Concept:** Atomic (all-or-nothing) vs. best-effort (continue on error)

### Pattern: Risk Assessment

**Where explained:**
- `JS_TOOLS_RIPPLE_ANALYSIS_GUIDE.md` → Risk Scoring (p. 7-10)
- `JS_TOOLS_MULTIFILE_WORKFLOWS.md` → Step 1 sections

**Concept:** Understanding safety of changes before applying them

### Pattern: Chaining Operations

**Where explained:**
- `JS_TOOLS_RECIPE_SPECIFICATION.md` → Data Flow & Variables (p. 10-12)
- `JS_TOOLS_MULTIFILE_WORKFLOWS.md` → Recipe examples

**Concept:** Using output from one step as input to next step

### Pattern: Large-Scale Refactors

**Where explained:**
- `JS_TOOLS_BATCH_OPERATIONS.md` → Performance Optimization (p. 40-48)
- `JS_TOOLS_RECIPE_SPECIFICATION.md` → Multi-Phase Refactoring (p. 17-18)

**Concept:** Breaking refactors into manageable phases

---

## Document Maintenance Notes

### When to Update Which Guide

| Change | Update These |
|--------|-------------|
| New batch operation added | `JS_TOOLS_BATCH_OPERATIONS.md` (Command Reference) |
| New AST pattern node type | `JS_TOOLS_AST_PATTERNS_GUIDE.md` (Reference section) |
| Recipe operation added | `JS_TOOLS_RECIPE_SPECIFICATION.md` (Operation Reference) |
| New workflow discovered | `JS_TOOLS_MULTIFILE_WORKFLOWS.md` (Practical Examples) |
| Safety/rollback behavior changes | `JS_TOOLS_BATCH_OPERATIONS.md` (Rollback Mechanism) |

### Cross-Document Consistency

These guides should maintain consistency:
- Command syntax (always use `--hyphenated` flags)
- Example file paths (always use `src/`, `tests/`, etc.)
- JSON schema formatting
- Error message examples
- Performance baseline numbers

---

## Additional Resources

These guides reference or build upon:
- **Original Brainstorm:** `docs/JS_TOOLS_IMPROVEMENT_BRAINSTORM.md`
- **Existing README:** `tools/dev/README.md` (baseline CLI docs)
- **AGENTS.md:** Repository-wide guidance (see js-edit section)
- **CLI_REFACTORING_QUICK_START.md:** High-level workflow guide

---

## Feedback & Iteration

As these tools are implemented and used:

1. **Collect usage patterns** — Which guides do operators use most?
2. **Track confusion points** — Where do people get stuck?
3. **Refactor for clarity** — Reorganize based on real usage
4. **Add missing examples** — Fill gaps as they emerge
5. **Update for feature additions** — Keep guides current with implementation

These guides are **living documents** meant to evolve with the tools themselves.

