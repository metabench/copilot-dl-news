# Ripple Analysis & Dependency Tracing Guide

**Date:** November 11, 2025  
**Purpose:** Detailed explanation of ripple analysis—tracing impact across the codebase when code changes

This guide explains how ripple analysis works, what it tells you, and how to use it for safe refactoring decisions.

---

## Table of Contents

1. [Concept Overview](#concept-overview)
2. [How Ripple Analysis Works](#how-ripple-analysis-works)
3. [Risk Scoring](#risk-scoring)
4. [Impact Assessment](#impact-assessment)
5. [Command Reference](#command-reference)
6. [Interpreting Results](#interpreting-results)
7. [Practical Scenarios](#practical-scenarios)
8. [Advanced Usage](#advanced-usage)

---

## Concept Overview

### What Is Ripple Analysis?

Ripple analysis traces the consequences of modifying a function throughout your codebase. It answers questions like:

- **Who imports this function?** (direct consumers)
- **Who calls code that calls this function?** (indirect consumers, depth 2+)
- **How is it tested?** (test coverage)
- **Is it exported?** (is it part of the public API?)
- **Is it safe to modify?** (will changes break things?)
- **Is it safe to delete?** (does anything depend on it?)

### Why It Matters

```javascript
// Without ripple analysis:
// "Should I rename fetchUser to getUser?"
// Manual answer: Check imports, search for calls, look for tests...
// Time: 10-20 minutes, error-prone

// With ripple analysis:
node tools/dev/js-scan.js --ripple-analysis "fetchUser" \
  --file src/api/user.js --scope src/
// Instant answer with:
// - 47 direct call sites
// - 12 files that import it
// - 8 tests covering it
// - Risk: MEDIUM (exported, widely used)
// - Safe to rename? YES (no breaking changes)
```

---

## How Ripple Analysis Works

### The Dependency Graph

Ripple analysis builds a dependency graph with three layers:

```
Layer 0 (the function being analyzed):
  fetchUser() in src/api/user.js

Layer 1 (direct importers):
  - src/services/UserService.js (imports fetchUser)
  - src/handlers/user.handler.js (imports fetchUser)
  - tests/api/user.test.js (imports fetchUser)

Layer 2 (direct callers in layer 1):
  - UserService.getUserProfile() calls fetchUser()
  - user.handler POST /users calls fetchUser()
  - test "should fetch user" calls fetchUser()

Layer 3+ (indirect callers):
  - ApiController.getProfile() calls UserService.getUserProfile()
  - Express route /api/profile calls ApiController.getProfile()
  - Integration test calls Express route
```

### Algorithm Steps

1. **Parse and index** all files in scope
2. **Locate target** function (by name/hash in starting file)
3. **Find direct importers** (static import analysis)
4. **Find direct callers** in those importers
5. **Recursively find callers** of callers (configurable depth)
6. **Analyze test coverage** (find test files that import target)
7. **Compute risk metrics** based on the graph
8. **Generate report** with findings

### Call Graph Example

For `fetchUser` in `src/api/user.js`:

```
fetchUser (exported, public)
  ├─ UserService.getProfile() [src/services/UserService.js]
  │   ├─ ApiController.listUsers() [src/api/controllers/users.js]
  │   │   └─ Express route GET /users [src/api/routes/users.js]
  │   │       └─ Web request
  │   └─ backgroundJob.syncUsers() [src/jobs/sync.js]
  │       └─ Scheduled task runner
  │
  ├─ user.handler.createUser() [src/handlers/user.handler.js]
  │   └─ Express route POST /users [src/api/routes/users.js]
  │       └─ Web request
  │
  └─ Tests:
      ├─ tests/api/user.test.js (5 test cases)
      ├─ tests/services/UserService.test.js (3 test cases)
      └─ tests/integration/api.test.js (2 test cases)
```

---

## Risk Scoring

### Risk Metrics

Ripple analysis calculates risk based on several factors:

| Factor | Low Risk | Medium Risk | High Risk |
|--------|----------|-------------|-----------|
| **Export Status** | Internal only | Re-exported | Part of public API |
| **Usage Depth** | 1-2 levels | 3-5 levels | 6+ levels, circular |
| **Call Site Count** | 1-3 | 4-10 | 10+ |
| **Test Coverage** | 70%+ | 30-70% | <30% |
| **Call Pattern** | Direct only | Some indirect | Many indirect |
| **External Use** | None | Imported elsewhere | Public package |

### Risk Calculation

```javascript
riskScore = (
  exportStatusWeight * exportRisk +
  usageDepthWeight * depthRisk +
  callSiteWeight * callSiteRisk +
  testCoverageWeight * testRisk +
  circularDepWeight * circularRisk
) / totalWeight

// Result: 0-100
// 0-30 = LOW (safe to modify/delete)
// 30-70 = MEDIUM (proceed carefully)
// 70-100 = HIGH (risky, coordinate changes)
```

### Safety Assertions

Based on risk score, the analysis determines:

**Can safely rename?**
- If no external consumers (exported to users) → Yes
- If all callers are in same team's code → Likely
- If heavily tested → More likely

**Can safely change signature?**
- If no call sites outside immediate module → Yes
- If all callers are auto-updateable → Yes (can apply recipe)
- If breaking many tests → No

**Can safely delete?**
- If unused (0 callers) → Yes
- If only tests import it → Yes (deprecated)
- If used in public API → No

---

## Impact Assessment

### Impact Zones

The analysis identifies "impact zones"—areas where changes would ripple:

```javascript
// Direct impact (Layer 1):
// - src/services/UserService.js (will need update)
// - src/handlers/user.handler.js (will need update)

// Secondary impact (Layer 2):
// - src/api/routes/users.js (may need changes in calling code)
// - src/jobs/sync.js (may need changes)

// Tertiary impact (Layer 3+):
// - Tests that depend on Layer 2 (may fail if Layer 2 changes)
// - Any package/bundle that exports these modules

// Test impact:
// - tests/api/user.test.js (10 test cases may fail)
// - tests/services/UserService.test.js (5 test cases)
// - tests/integration/api.test.js (2 test cases)
```

### Circular Dependency Detection

If modification creates circular imports, analysis flags it:

```javascript
// ALERT: Circular dependency detected!
// src/api/user.js → src/services/UserService.js → src/api/user.js
// Moving function could break both modules
```

---

## Command Reference

### Basic Ripple Analysis

```bash
node tools/dev/js-scan.js --ripple-analysis "functionName" \
  --file src/path/to/file.js \
  --scope src/
```

**Output:** ASCII tree showing all layers, counts, and risk assessment.

### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `--ripple-analysis` | string | required | Function to analyze |
| `--file` | path | required | File containing the function |
| `--scope` | path | src/ | Directory to search for consumers |
| `--max-depth` | number | 10 | Maximum call graph depth |
| `--include-tests` | bool | true | Include test files |
| `--find-tests` | bool | true | Locate test files covering function |
| `--highlight-exports` | bool | false | Highlight exported functions in output |
| `--unused-only` | bool | false | Only show if truly unused |
| `--show-last-use` | bool | false | Show timestamp of last usage (from git) |
| `--json` | bool | false | Output as JSON |
| `--emit-diff` | bool | false | Show potential impact diffs |

### With JSON Output

```bash
node tools/dev/js-scan.js --ripple-analysis "fetchUser" \
  --file src/api/user.js \
  --scope src/ \
  --json > tmp/ripple-report.json
```

**JSON structure:**
```json
{
  "target": {
    "name": "fetchUser",
    "file": "src/api/user.js",
    "hash": "abc123",
    "exported": true,
    "line": 10
  },
  "layers": [
    {
      "depth": 1,
      "type": "importers",
      "items": [
        { "file": "src/services/UserService.js", "count": 2 },
        { "file": "src/handlers/user.handler.js", "count": 1 }
      ]
    },
    {
      "depth": 2,
      "type": "callers",
      "items": [
        { "file": "src/api/routes/users.js", "count": 1 }
      ]
    }
  ],
  "testCoverage": {
    "files": ["tests/api/user.test.js", "tests/services/UserService.test.js"],
    "cases": 8,
    "estimatedCoverage": 0.75
  },
  "circularDependencies": [],
  "riskAssessment": {
    "score": 45,
    "level": "MEDIUM",
    "canRename": true,
    "canChangeSignature": false,
    "canDelete": false
  },
  "recommendations": [
    "Safe to rename (local use only)",
    "Coordinate signature changes with UserService maintainer",
    "Cannot delete (8 tests depend on it)"
  ]
}
```

---

## Interpreting Results

### Output Example

```
RIPPLE ANALYSIS: fetchUser in src/api/user.js

Target: fetchUser() [exported]
  Hash: abc123def456
  Lines: 10-45
  Exported: YES (re-exported in src/api/index.js)
  
Layer 1 (Direct Importers) - 2 files:
  ├─ src/services/UserService.js (2 call sites)
  │   └─ getUserProfile()
  │   └─ getUserData()
  └─ src/handlers/user.handler.js (1 call site)
      └─ handler.createUser()

Layer 2 (Indirect Callers) - 3 modules:
  ├─ src/api/routes/users.js
  │   └─ GET /api/users
  │   └─ POST /api/users
  ├─ src/jobs/sync.js
  │   └─ syncUsers()
  └─ tests/services/UserService.test.js
      └─ 3 test cases

Layer 3+ - 5+ additional modules
  └─ Express app, web clients, etc.

Test Coverage:
  Direct tests: tests/api/user.test.js (5 cases)
  Indirect tests: tests/services/UserService.test.js (3 cases)
  Integration tests: tests/integration/api.test.js (2 cases)
  Total: 10 test cases
  Coverage: HIGH (71%)

RISK ASSESSMENT:
  Export Status: PUBLIC API (re-exported)
  Usage Depth: 3 (moderate)
  Call Sites: 6
  Test Coverage: 71%
  Circular Deps: None
  
  Overall Risk: MEDIUM (45/100)
  
  Safety Recommendations:
    ✓ SAFE TO RENAME: No breaking changes expected
    ✗ UNSAFE TO CHANGE SIGNATURE: 6 call sites would break
    ✗ UNSAFE TO DELETE: 10 tests depend on it
    
  Impact Zones (files to test if modified):
    - src/api/routes/users.js (API endpoints)
    - src/services/UserService.js (service layer)
    - 10+ test files
```

### Interpreting Risk Levels

**LOW RISK (0-30)**
- Internal use only
- 1-2 levels deep
- Good test coverage
- Safe to rename, change, or delete
- **Action:** Proceed confidently

**MEDIUM RISK (30-70)**
- Used in multiple places
- 3-5 levels deep
- Moderate test coverage
- Safe to rename, risky to change signature
- **Action:** Use recipes, coordinate changes, run full test suite

**HIGH RISK (70-100)**
- Public API or widely exported
- 6+ levels deep
- Limited test coverage
- Risky to modify
- **Action:** RFC (Request for Comments), plan major version bump, extensive testing

---

## Practical Scenarios

### Scenario 1: Safe Rename

```bash
node tools/dev/js-scan.js --ripple-analysis "oldHelper" \
  --file src/utils/helpers.js \
  --scope src/

# Output shows:
# - Risk: LOW (15/100)
# - Can rename: YES
# - Call sites: 2 (same module)
# - Tests: 1
```

**Decision:** Safe to rename globally using recipe:
```bash
node tools/dev/js-edit.js --rename-global "oldHelper" --to "newHelper" \
  --search-scope src/ --fix
```

### Scenario 2: Risky Signature Change

```bash
node tools/dev/js-scan.js --ripple-analysis "processPayment" \
  --file src/payment/processor.js \
  --scope src/

# Output shows:
# - Risk: HIGH (78/100)
# - Can rename: YES
# - Can change signature: NO (23 call sites)
# - Tests: 50+ cases (good coverage)
# - Is exported: YES (public API)
```

**Decision:** Signature change needs coordination:
1. Create wrapper function maintaining old signature
2. Refactor internal calls to new signature
3. Deprecate old signature in next minor version
4. Remove old signature in next major version

### Scenario 3: Safe Deletion

```bash
node tools/dev/js-scan.js --ripple-analysis "legacyFormat" \
  --file src/old/deprecated.js \
  --scope src/ \
  --unused-only

# Output shows:
# - Risk: LOW (5/100)
# - Can delete: YES
# - Call sites: 0
# - Tests: 0
```

**Decision:** Safe to delete:
```bash
node tools/dev/js-edit.js --replace "legacyFormat" \
  --with-code "" --fix  # Remove the function
```

---

## Advanced Usage

### Finding Candidates for Extraction

```bash
node tools/dev/js-scan.js --ripple-analysis "largeFunctionName" \
  --file src/large-module.js \
  --scope src/ \
  --json | jq '.layers[1].items | length'

# If only 1-2 importers and LOW risk:
# Safe to move to dedicated module
```

### Detecting Over-Coupled Code

```bash
# Find functions with HIGH usage depth (6+ levels):
node tools/dev/js-scan.js --ripple-analysis "someFn" \
  --scope src/ \
  --json | jq 'select(.layers | length > 6)'

# Candidates for extraction/refactoring
```

### Impact Simulation

Before applying a recipe that modifies deeply-used functions:

```bash
# Generate report showing all impact zones
node tools/dev/js-scan.js --ripple-analysis "targetFn" \
  --file src/target.js \
  --scope src/ \
  --emit-diff > tmp/impact-simulation.txt

# Review before applying changes
cat tmp/impact-simulation.txt
```

### Test Impact Assessment

```bash
node tools/dev/js-scan.js --ripple-analysis "functionName" \
  --file src/function.js \
  --scope src/ \
  --find-tests --json | jq '.testCoverage'

# Output:
# {
#   "files": ["tests/..."],
#   "cases": 15,
#   "estimatedCoverage": 0.82
# }

# Decision: Coverage looks good, can proceed with confidence
```

---

## Combining With Other Tools

### Ripple Analysis + Recipe Execution

```bash
# Step 1: Analyze impact
node tools/dev/js-scan.js --ripple-analysis "fetchUser" \
  --file src/api/user.js \
  --scope src/ \
  --json > tmp/ripple.json

# Step 2: If safe, execute recipe
node tools/dev/js-edit.js --recipe recipes/rename.json \
  --param oldName="fetchUser" \
  --param newName="getUser" \
  --dry-run --emit-diff

# Step 3: Review diffs
# Step 4: Apply with --fix
```

### Ripple Analysis + Batch Operations

```bash
# Identify all usage patterns
node tools/dev/js-scan.js --ripple-analysis "authenticate" \
  --file src/auth.js \
  --scope src/ \
  --json > tmp/auth-usage.json

# Apply consistent fixes across all call sites
node tools/dev/js-edit.js --batch \
  --pattern "src/**/*.js" \
  --update-calls "authenticate" \
  --to "await authenticate" \
  --fix
```

---

## Tips & Best Practices

1. **Always run ripple analysis before large refactors**
   - Takes seconds, saves hours of debugging
   
2. **Start with LOW-risk modifications**
   - Build confidence with easy wins
   - Use results to guide approach

3. **Use JSON output for automation**
   - Parse results in scripts
   - Build dashboards or reports
   - Integrate with CI/CD

4. **Pay attention to circular dependencies**
   - They signal architectural issues
   - May need broader refactoring

5. **Test coverage insights**
   - Low coverage functions are risky to change
   - Investment in testing pays off in refactoring speed

6. **Export status matters**
   - Internal-only functions are easier to modify
   - Public API changes need coordination

