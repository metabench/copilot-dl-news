---
type: agent-guide
title: "How Agents Should Use Plans in Refactoring Workflows"
subtitle: "Practical workflows for Gap 2, Gap 3, and plan integration"
date: 2025-11-13
audience: "AI agents (Copilot, Claude, etc.)"
---

# Agent Refactoring Workflows: Using Plans Effectively

> **For AI Agents**: This guide shows you HOW to use the tools to accomplish real refactoring tasks. Think of it as your playbook for working with js-scan and js-edit.

---

## Quick Reference: The Three Essential Queries (Gap 2)

Once implemented, these queries replace tedious multi-step discovery:

### Query 1: "What imports this module?"

**Use Case**: Understand ripple effects before changing an API

```bash
# ❌ OLD: Had to search and manually trace
node js-scan.js --search "import.*validation" --json
# (manual process to find all importers)

# ✅ NEW: Direct relationship query
node js-scan.js --what-imports "src/services/validation.js" --json

# Output shows:
{
  "importerCount": 5,
  "importers": [
    { "file": "src/api/handler.js", "importLine": 12 },
    { "file": "crawl.js", "importLine": 8 },
    { "file": "src/db/adapter.js", "importLine": 3 },
    ...
  ],
  "riskLevel": "low"  # or "high" if many importers
}
```

**Time Saved**: 15-20 min → <1 min

---

### Query 2: "What calls this function?"

**Use Case**: Find all code paths before refactoring a function

```bash
# ❌ OLD: Had to manually search for function name
node js-scan.js --search "processData(" --json
# (then manually inspect each result)

# ✅ NEW: Transitive caller analysis
node js-scan.js --what-calls "processData" --recursive --depth 3 --json

# Output shows:
{
  "targetFunction": "processData",
  "directCallers": [
    "validateInput",
    "enrichData",
    "transformPayload"
  ],
  "transitiveCallers": [
    "handleRequest",
    "middleware.auth",
    "cron.hourly"
  ],
  "riskProfile": {
    "layer0": 3,      # Direct callers
    "layer1": 5,      # Callers of callers
    "layer2": 12      # And so on...
  }
}
```

**Time Saved**: 20-25 min → <2 min

---

### Query 3: "What does this module export and who uses it?"

**Use Case**: Understand if you can safely remove or rename an export

```bash
# ❌ OLD: Manual inspection of file + searches for each export
# Time: 15+ minutes

# ✅ NEW: Export usage analysis
node js-scan.js --export-usage "src/utils/helpers.js" --json

# Output shows:
{
  "file": "src/utils/helpers.js",
  "exports": ["formatDate", "parseJSON", "validateEmail", "unused_fn"],
  "usage": {
    "formatDate": {
      "usedBy": 12,
      "files": ["src/api/routes.js", "src/services/..."]
    },
    "parseJSON": {
      "usedBy": 5,
      "files": ["crawl.js", "src/db/..."]
    },
    "unused_fn": {
      "usedBy": 0,
      "canDelete": true
    }
  }
}
```

**Time Saved**: 15-20 min → <2 min

---

## Safe Batch Refactoring: The Dry-Run Workflow (Gap 3)

Never apply batch changes blindly. Always preview first.

### Step 1: Prepare Batch

You've discovered changes. Build JSON:

```json
[
  {
    "file": "src/api/handler.js",
    "startLine": 45,
    "endLine": 50,
    "replacement": "// New handler logic\nfunction handle(req, res) {\n  res.json({ ok: true });\n}"
  },
  {
    "file": "src/services/db.js",
    "startLine": 120,
    "endLine": 125,
    "replacement": "// Updated DB query\nreturn await db.query(sql);"
  },
  {
    "file": "src/utils/helpers.js",
    "startLine": 8,
    "endLine": 12,
    "replacement": "export const formatDate = (d) => d.toISOString();"
  }
]
```

### Step 2: DRY RUN (ALWAYS DO THIS FIRST!)

```bash
node js-edit.js --changes changes.json --dry-run --show-conflicts --json
```

**Expected output - SUCCESS**:
```json
{
  "success": true,
  "summary": {
    "total": 3,
    "valid": 3,
    "invalid": 0,
    "successRate": "100%"
  },
  "conflicts": [],
  "suggestions": []
}
```

**Expected output - CONFLICT DETECTED**:
```json
{
  "success": false,
  "summary": {
    "total": 3,
    "valid": 2,
    "invalid": 1,
    "successRate": "66.7%"
  },
  "results": [
    {
      "changeId": 2,
      "file": "src/services/db.js",
      "status": "invalid",
      "error": "Line 120 is now 116 (file changed since planning)"
    }
  ],
  "suggestions": [
    {
      "type": "offset-recalculation",
      "message": "Some line offsets have drifted. Try --recalculate-offsets"
    }
  ]
}
```

> **2025-11-16 Update**: `js-edit` now routes `--changes` payloads through `BatchDryRunner.loadChanges`, so dry-run, `--recalculate-offsets`, and future `--from-plan` workflows all share the same file-aware metadata. Each preview entry now lists the `filePath`, line span, and truncated snippet, and single-line replacements (`startLine === endLine`) no longer trigger validation errors.

### Step 3: Fix Conflicts (if any)

```bash
# Auto-fix line numbers
node js-edit.js --changes changes.json --recalculate-offsets --dry-run --json

# Run dry-run again to verify
node js-edit.js --changes changes.json --dry-run --json
```

### Step 4: Apply with Confidence

```bash
# All guards active, atomic mode (all succeed or all fail)
node js-edit.js --changes changes.json --atomic --fix

# Output:
{
  "success": true,
  "applied": 3,
  "failed": 0,
  "plansEmitted": [
    "tmp/plans/change-1-plan.json",
    "tmp/plans/change-2-plan.json",
    "tmp/plans/change-3-plan.json"
  ]
}
```

---

## Plans Workflow: Replayable, Verified Edits

Once a change is applied successfully, the plan contains all the information needed to replay it.

### The Plan Structure (What You Get Back)

```json
{
  "planId": "plan-abcd-1234",
  "file": "src/api/handler.js",
  "operation": "replace",
  "metadata": {
    "hash": "5KjF9Lm2",           // Content hash of target
    "span": { "start": 1250, "end": 1450 },  // Character positions
    "lineSpan": { "start": 45, "end": 50 },  // Line numbers
    "pathSignature": "src/api/handler.js#line-45"
  },
  "context": {
    "replacementLength": 140,
    "originalLength": 90,
    "linesDelta": 3
  }
}
```

### Using Plans in Follow-Up Operations

**Scenario**: You made changes, want to verify them with another operation

```bash
# Step 1: Initial change with plan emission
node js-edit.js --file src/app.js --locate "exports.foo" \
  --replace new_code.js --emit-plan tmp/initial.json --fix

# Step 2: Verify the change (using plan guards automatically)
node js-edit.js --from-plan tmp/initial.json --context-function --json

# Result: Shows exact code with guards active (can't get out of sync!)
{
  "file": "src/app.js",
  "hash": "5KjF9Lm2",
  "context": "function foo() { ... }",
  "verified": true
}

# Step 3: Make follow-up change based on previous one
node js-edit.js --from-plan tmp/initial.json \
  --follow-up "rename param x → param ctx" \
  --emit-plan tmp/followup.json --fix
```

**Benefit**: All subsequent operations stay "anchored" to the original change via plan guards.

---

## Complete Example: Rename Function Globally (All Gaps Working Together)

### Task: Rename `processData()` → `transformPayload()` everywhere

#### Step 1: Discover All Usage (Gap 2)

```bash
# Find all callers
node js-scan.js --what-calls "processData" --recursive --json > callers.json

# Find the definition
node js-scan.js --search "function processData" --json > definition.json

# Estimate ripple
cat callers.json | jq '.transitiveCallers | length'
# Output: "23" — ok, manageable
```

#### Step 2: Locate All Targets

```bash
# Create a list of all locations to change
cat > targets.json <<EOF
{
  "locations": [
    { "file": "src/services/data.js", "selector": "function processData", "type": "definition" },
    { "file": "src/api/handler.js", "selector": "processData(", "type": "call" },
    { "file": "crawl.js", "selector": "processData(", "type": "call" },
    { "file": "src/db/queries.js", "selector": "processData(", "type": "call" }
  ]
}
EOF

# Locate all targets with plans
node js-edit.js --batch-locate targets.json --emit-plans tmp/locations/ --json
# Output: Plans for each location
```

#### Step 3: Generate Batch Changes (With Plans)

```bash
# Using the plans, create batch edits
cat > batch.json <<EOF
[
  {
    "fromPlan": "tmp/locations/definition-plan.json",
    "replacement": "function transformPayload"
  },
  {
    "fromPlan": "tmp/locations/call-1-plan.json",
    "replacement": "transformPayload("
  },
  {
    "fromPlan": "tmp/locations/call-2-plan.json",
    "replacement": "transformPayload("
  },
  {
    "fromPlan": "tmp/locations/call-3-plan.json",
    "replacement": "transformPayload("
  }
]
EOF
```

#### Step 4: Dry-Run ALL Changes (Gap 3)

```bash
node js-edit.js --changes batch.json --dry-run --show-conflicts --json > dryrun.json

# Check result
cat dryrun.json | jq '.summary'
# {
#   "total": 4,
#   "valid": 4,
#   "invalid": 0,
#   "successRate": "100%"
# }
```

#### Step 5: Apply Atomically

```bash
node js-edit.js --changes batch.json --atomic --fix > results.json

# All 4 changes applied. Plans saved for each.
cat results.json | jq '.plansEmitted'
```

#### Step 6: Verify (Using Plans!)

```bash
# Verify each change is correctly applied
for plan in tmp/plans/*.json; do
  echo "Verifying $plan"
  node js-edit.js --from-plan "$plan" --context-function --json \
    | jq '.hash' # Should match original hash
done
```

**Total Time**: 10-15 minutes (vs. 60-90 minutes manually)

---

## Handling Ambiguity: Selector Suggestions

When a selector matches multiple targets, `js-edit` will fail to prevent accidental edits. Use `--suggest-selectors` to get precise options.

### Scenario: "Selector matched 2 targets"

```bash
# ❌ Fails: Ambiguous selector
node js-edit.js --file src/app.js --locate "init" --json
# Error: Selector "init" matched 2 targets (App > init, Component > init)

# ✅ Fix: Ask for suggestions
node js-edit.js --file src/app.js --locate "init" --suggest-selectors --json

# Output:
{
  "status": "multiple_matches",
  "suggestions": [
    {
      "name": "App > init",
      "selectors": ["path:...", "hash:..."]
    },
    {
      "name": "Component > init",
      "selectors": ["path:...", "hash:..."]
    }
  ]
}

# Retry with precise selector
node js-edit.js --file src/app.js --locate "path:..." --json
```

---

## Checklist: When to Use Which Tool

### Use `js-scan --what-*` (Gap 2) When You Need to:
- [ ] Understand who imports a module
- [ ] Find all callers of a function
- [ ] Check what's exported and where it's used
- [ ] Estimate ripple effects before changing something
- [ ] Find circular dependencies
- [ ] Include `.ts/.tsx` files by passing `--source-language typescript` (or `--码 ts` via Chinese aliases)
- [ ] Force terse payloads to carry selectors via `--view terse --fields location,name,selector,hash`

#### TypeScript scanning + selector-ready outputs

- **Parse TS explicitly**: `node tools/dev/js-scan.js --dir src --search alpha --source-language typescript` ensures `.ts/.tsx` files are parsed without relying on `TSNJS_SCAN_LANGUAGE`; switch back to extension-driven detection with `--source-language auto` when needed.
- **Emit canonical selectors**: append `--view terse --fields location,name,selector,hash --ai-mode --json` so every match carries a js-edit compatible selector and guard hash alongside continuation tokens for downstream tooling.

**Time Budget**: <2 minutes per query

---

### Use `js-edit --dry-run` (Gap 3) When You Need to:
- [ ] Apply 2+ changes to the same file
- [ ] Apply changes across multiple files
- [ ] Batch changes generated by any script
- [ ] Verify changes won't break syntax
- [ ] Recover from offset drift

**Process**:
1. Run `--dry-run` first
2. Fix any issues
3. Run `--dry-run` again
4. Apply with `--fix`

**Time Budget**: 2-3 minutes per batch

---

### Use `--from-plan` (Plans Integration) When You Need to:
- [ ] Follow up on a previous change (locate + context + modify)
- [ ] Chain multi-step refactorings
- [ ] Ensure changes stay "anchored" to original locations
- [ ] Enable replay/verification workflows

**Process**:
1. Initial operation with `--emit-plan`
2. Follow-up operations with `--from-plan`
3. Verification also uses `--from-plan`

**Time Budget**: <30 sec overhead per plan

---

## Common Pitfalls & How to Avoid Them

### Pitfall 1: Applying Batch Changes Without Dry-Run

❌ **Wrong**:
```bash
node js-edit.js --changes batch.json --fix
# Half fail, nothing applied, 20 minutes debugging
```

✅ **Right**:
```bash
node js-edit.js --changes batch.json --dry-run --json
# See all issues upfront, fix, then apply
```

---

### Pitfall 2: Line Numbers Drifting Between Operations

❌ **Wrong**:
```bash
# Change 1: Applied at line 45
# Meanwhile, other file changes, now has 2 extra lines
# Change 2: Try to apply at old line 50, but it's now at line 52
# Fails silently
```

✅ **Right**:
```bash
# Run with --recalculate-offsets before applying
node js-edit.js --changes batch.json --recalculate-offsets --dry-run --json
node js-edit.js --changes batch.json --fix
```

---

### Pitfall 3: Forgetting What Changed

❌ **Wrong**:
```bash
# Applied changes, no record of what was modified
# Later: "Wait, did I rename this function or not?"
```

✅ **Right**:
```bash
# Changes emit plans by default
node js-edit.js --changes batch.json --fix

# Now you have plans for every change:
ls tmp/plans/*.json
# Use plans for verification or follow-up operations
```

---

## Time Comparisons: Before vs. After

### Scenario 1: "Rename a utility function that's called in 15 places"

| Step | Before | After | Tool |
|------|--------|-------|------|
| Find all callers | 12 min | <1 min | `--what-calls` |
| Build change list | 8 min | 3 min | Manual prep |
| Verify each change | 15 min | 2 min | `--dry-run` |
| Apply changes | 3 min | 1 min | `--fix` |
| Verify success | 5 min | <1 min | `--from-plan` verify |
| **Total** | **43 min** | **7 min** | **85% faster** |

---

### Scenario 2: "Break apart a module into 3 smaller modules"

| Step | Before | After | Tool |
|------|--------|-------|------|
| Understand dependencies | 20 min | 3 min | `--what-imports` + `--export-usage` |
| Plan extractions | 15 min | 5 min | Manual |
| Generate batch edits | 10 min | 5 min | Scripts |
| Dry-run changes | Manual 15 min | 1 min | `--dry-run` |
| Apply + fix issues | 20 min | 2 min | Auto-recovery |
| Verify no regressions | 10 min | 2 min | Plans verify |
| **Total** | **90 min** | **18 min** | **80% faster** |

---

## Bonus: Recipe System (Multi-Step Workflows)

Coming soon: Recipes for common refactoring tasks.

```bash
# Define a recipe once:
# refactor-rename-global.json

# Run it anytime:
node js-edit.js --recipe refactor-rename-global.json \
  --param oldName=processData \
  --param newName=transformPayload \
  --fix --emit-plans tmp/recipe-plans/

# Returns plans from every step for verification/replay
```

---

## Summary

### Three Changes, Three Time Savings

| Gap | Tool | Time Before | Time After | Improvement |
|-----|------|-------------|------------|-------------|
| 2 | `--what-*` queries | 20-25 min | <2 min | **90%** |
| 3 | `--dry-run` batch | 15-20 min recovery | <2 min | **90%** |
| Plans | `--from-plan` | 5 min overhead | <30 sec | **90%** |
| **Total per refactor** | All three | 60-90 min | 10-15 min | **75-80%** |

**Use this workflow for safe, fast, verified refactoring.**

---

_Agent Refactoring Playbook v1.0 — Ready to copy into your process._
