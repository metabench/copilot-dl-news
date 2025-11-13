---
type: technical-deep-dive
title: "Plans Integration: Complete Technical Guide"
subtitle: "How Plans Enable Replayable, Synchronized, Multi-Step Workflows"
date: 2025-11-13
---

# Plans Integration: Complete Technical Deep-Dive

## Executive Summary

Plans are **metadata containers** that capture operation state, enabling:
1. **Replayability**: Run the same operation again with identical guards
2. **Synchronization**: Chain operations while staying locked to original locations
3. **Verification**: Prove changes match expectations without re-reading files
4. **Recovery**: Undo or replay operations deterministically

This guide explains what plans are, how they work, and how to integrate them into agent workflows.

---

## Part 1: What Are Plans?

### Core Concept

A **plan** is a JSON file containing:
- **What was targeted**: File path, line numbers, content hash
- **What changed**: Original vs. new, delta metrics
- **Guards**: Hash verification, span tracking, path signatures
- **Metadata**: Timing, operation type, status

### Example Plan (Real Structure)

```json
{
  "planId": "plan-uuid-abc123",
  "timestamp": "2025-11-13T14:30:00Z",
  "file": "src/services/data.js",
  "operation": "replace",
  
  "metadata": {
    "hash": "5KjF9Lm2",
    "span": { "start": 1250, "end": 1450 },
    "charSpan": { "start": 1245, "end": 1448 },
    "pathSignature": "src/services/data.js#processData#line-45",
    "kind": "function",
    "isAsync": false,
    "name": "processData"
  },
  
  "context": {
    "operation": "replace",
    "originalContent": "function processData(input) {\n  return process(input);\n}",
    "newContent": "async function processData(input) {\n  return await process(input);\n}",
    "lineSpan": { "start": 45, "end": 47 },
    "linesDelta": 0,
    "charactersDelta": 6,
    "replacementLength": 127,
    "originalLength": 121
  },
  
  "verification": {
    "beforeHash": "abc123def456",
    "afterHash": "xyz789uvw012",
    "status": "applied",
    "timestamp": "2025-11-13T14:30:05Z"
  },
  
  "guards": {
    "expectHash": "5KjF9Lm2",
    "expectSpan": "1250:1450",
    "pathSignature": "src/services/data.js#processData#line-45",
    "allowMultiple": false,
    "requiresExactMatch": true
  }
}
```

### Plan Anatomy: Five Sections

#### 1. **Identity** (planId, timestamp)
```json
{
  "planId": "plan-uuid-abc123",
  "timestamp": "2025-11-13T14:30:00Z"
}
```
- Uniquely identifies this plan
- Enables audit trail and replay
- Used for plan lookup in caches

#### 2. **Target Location** (file, operation, pathSignature)
```json
{
  "file": "src/services/data.js",
  "operation": "replace",
  "metadata": {
    "pathSignature": "src/services/data.js#processData#line-45",
    "kind": "function",
    "name": "processData"
  }
}
```
- **What** was changed and **where**
- Path signature: semantic location (file#symbol#line)
- Kind: type of entity (function, class, variable, statement)

#### 3. **Guards** (hash, span, pathSignature)
```json
{
  "guards": {
    "expectHash": "5KjF9Lm2",           // Content hash of target
    "expectSpan": "1250:1450",          // Character positions
    "pathSignature": "src/services/...", // Semantic location
    "allowMultiple": false,              // Don't match multiple
    "requiresExactMatch": true           // Strict verification
  }
}
```
- **Verify target hasn't changed**: Check hash before next operation
- **Locate target precisely**: Use character span even if lines shifted
- **Semantic safety**: Path signature ensures you're in right function
- **Prevents accidents**: allowMultiple/requiresExactMatch prevent ambiguity

#### 4. **Context** (before/after content, deltas)
```json
{
  "context": {
    "originalContent": "function processData(input) { ... }",
    "newContent": "async function processData(input) { ... }",
    "lineSpan": { "start": 45, "end": 47 },
    "linesDelta": 0,                    // No net lines added/removed
    "charactersDelta": 6,               // 6 more chars
    "replacementLength": 127,
    "originalLength": 121
  }
}
```
- **What changed**: Before/after content
- **How much changed**: Deltas for impact assessment
- **Where exactly**: Line and character positions
- Used for: Verification, preview, impact analysis

#### 5. **Verification** (beforeHash, afterHash, status)
```json
{
  "verification": {
    "beforeHash": "abc123def456",
    "afterHash": "xyz789uvw012",
    "status": "applied",
    "timestamp": "2025-11-13T14:30:05Z"
  }
}
```
- **Proof of operation**: Hash before and after
- **Operation status**: Did it succeed?
- **Audit trail**: When did it happen?

---

## Part 2: Plan Lifecycle

### Stage 1: Plan Emission (After First Operation)

**When**: Any js-edit operation completes  
**Triggered by**: `--emit-plan <path>` flag  
**Output**: JSON plan file

```bash
# Agent runs initial operation with plan emission
node js-edit.js \
  --file src/services/data.js \
  --locate "exports.processData" \
  --emit-plan tmp/locate-plan.json \
  --json

# js-edit internally:
# 1. Locates the target
# 2. Captures metadata (hash, span, pathSignature)
# 3. Generates plan JSON
# 4. Writes to tmp/locate-plan.json
```

**What's Captured**:
- Target location (file, line numbers, character positions)
- Content hash (for verification)
- Semantic information (function name, kind, etc.)
- Operation metadata (what was done)

**Internal Flow**:
```javascript
// In js-edit.js, after successful operation:

if (args['emit-plan']) {
  const plan = {
    planId: generateUUID(),
    timestamp: new Date().toISOString(),
    file: args.file,
    operation: operationType,
    
    metadata: {
      hash: contentHash(targetCode),
      span: { start: charStart, end: charEnd },
      charSpan: { start: charStart, end: charEnd },
      pathSignature: buildPathSignature(file, selector),
      kind: ast.getKind(targetNode),
      name: ast.getName(targetNode)
    },
    
    context: {
      operation: operationType,
      originalContent: beforeCode,
      newContent: afterCode,
      lineSpan: { start: lineStart, end: lineEnd },
      linesDelta: newLineCount - oldLineCount,
      charactersDelta: afterCode.length - beforeCode.length,
      replacementLength: afterCode.length,
      originalLength: beforeCode.length
    },
    
    verification: {
      beforeHash: contentHash(fileContentBefore),
      afterHash: contentHash(fileContentAfter),
      status: 'applied',
      timestamp: new Date().toISOString()
    },
    
    guards: {
      expectHash: contentHash(targetCode),
      expectSpan: `${charStart}:${charEnd}`,
      pathSignature: buildPathSignature(file, selector),
      allowMultiple: false,
      requiresExactMatch: true
    }
  };
  
  fs.writeFileSync(args['emit-plan'], JSON.stringify(plan, null, 2));
}
```

---

### Stage 2: Plan Storage (Caching for Reuse)

**Default Behavior**: Plans stored in `tmp/plans/` directory  
**Naming**: `<operation>-<number>-plan.json`  
**TTL**: 1 hour (auto-cleanup)

```
tmp/plans/
├── locate-1-plan.json      (from: locate operation)
├── replace-2-plan.json     (from: replace operation)
├── extract-3-plan.json     (from: extract operation)
└── [auto-cleaned after 1 hour]
```

**Manual Storage**: Use `--emit-plan <custom-path>` to store explicitly

```bash
# Store in custom location for multi-step workflow
node js-edit.js --locate target --emit-plan tmp/workflow-step-1.json --fix
node js-edit.js --from-plan tmp/workflow-step-1.json --next-operation --fix
```

---

### Stage 3: Plan Consumption (`--from-plan` Flag)

**When**: Subsequent operations use previous plan  
**Triggered by**: `--from-plan <path>` flag  
**Effect**: Automatically loads guards from plan

```bash
# Step 1: Locate and emit plan
node js-edit.js --file src/app.js --locate "exports.foo" \
  --emit-plan tmp/plan1.json --json

# Step 2: Use plan from step 1 automatically
node js-edit.js --from-plan tmp/plan1.json \
  --context-function --json
# All guards from plan1.json automatically applied!
```

**Internal Flow** (`--from-plan` implementation):

```javascript
// In js-edit.js, argument processing:

if (args['from-plan']) {
  const planPath = args['from-plan'];
  
  // Load plan
  const plan = JSON.parse(fs.readFileSync(planPath, 'utf-8'));
  
  // Extract guards from plan
  const { guards } = plan;
  
  // Auto-populate args from plan
  args.file = args.file || plan.file;
  args['expect-hash'] = args['expect-hash'] || guards.expectHash;
  args['expect-span'] = args['expect-span'] || guards.expectSpan;
  args['path-signature'] = args['path-signature'] || guards.pathSignature;
  
  // Mark that plan is active (for logging, auditing)
  args._planId = plan.planId;
  args._planGuarded = true;
  
  // Proceed with operation using plan guards
  // All subsequent operations use these guards for verification
}
```

---

### Stage 4: Guard Verification (Verifying Target Still Matches)

**Purpose**: Ensure target hasn't changed since plan was created  
**Triggered**: Before any operation using plan guards  
**Action**: Fail fast if target has changed

**Verification Flow**:

```javascript
// Before applying operation with plan guards:

function verifyPlanGuards(plan, file, targetCode) {
  const { guards, metadata } = plan;
  
  // Check 1: Content hash (most important)
  const currentHash = contentHash(targetCode);
  if (currentHash !== guards.expectHash) {
    throw new Error(
      `Target hash mismatch!\n` +
      `Expected: ${guards.expectHash}\n` +
      `Got: ${currentHash}\n` +
      `The code may have been modified since this plan was created.`
    );
  }
  
  // Check 2: Character span (ensure location didn't shift too much)
  const { start, end } = guards.expectSpan;
  const fileContent = fs.readFileSync(file, 'utf-8');
  const spanContent = fileContent.slice(start, end);
  
  if (spanContent !== targetCode) {
    throw new Error(
      `Target location shifted!\n` +
      `Expected span ${start}:${end} doesn't contain target code.\n` +
      `Code may have been modified elsewhere in the file.`
    );
  }
  
  // Check 3: Path signature (semantic safety)
  const currentPathSig = buildPathSignature(file, ast.parse(fileContent));
  if (currentPathSig !== guards.pathSignature) {
    throw new Error(
      `Target location changed!\n` +
      `Expected location: ${guards.pathSignature}\n` +
      `Current location: ${currentPathSig}\n` +
      `The function/class structure may have changed.`
    );
  }
  
  // All checks passed
  return true;
}
```

**What Each Guard Catches**:

| Guard | Detects | Action |
|-------|---------|--------|
| **expectHash** | Code changed | Fail with error |
| **expectSpan** | Location shifted | Fail with error |
| **pathSignature** | Structure changed | Fail with error |
| **allowMultiple** | Multiple matches | Fail (if false) |
| **requiresExactMatch** | Partial match | Fail (if true) |

---

## Part 3: Multi-Step Workflows with Plans

### Pattern 1: Locate → Context → Modify (Basic Workflow)

**Goal**: Understand code before modifying it

**Step 1: Locate Target**
```bash
node js-edit.js --file src/app.js \
  --locate "exports.processData" \
  --emit-plan tmp/step1.json \
  --json
```

**What happens**:
- Finds the function
- Captures location (hash, span, signature)
- Emits plan to `tmp/step1.json`
- Returns success

**Plan contains**:
```json
{
  "metadata": {
    "hash": "abc123",
    "span": { "start": 500, "end": 650 },
    "pathSignature": "src/app.js#exports.processData"
  },
  "guards": {
    "expectHash": "abc123",
    "expectSpan": "500:650",
    "pathSignature": "src/app.js#exports.processData"
  }
}
```

**Step 2: Get Context (Using Plan)**
```bash
node js-edit.js --from-plan tmp/step1.json \
  --context-function \
  --json
```

**What happens**:
1. Loads plan from `tmp/step1.json`
2. Verifies target hash still matches (catch: "Code changed since plan")
3. Verifies span still contains target (catch: "Code shifted")
4. Reads context around target
5. Returns surrounding code

**Why plan helps**:
- Don't have to specify file/location again
- Automatic verification target unchanged
- Proof target is what we think it is

**Step 3: Modify (Using Plan)**
```bash
node js-edit.js --from-plan tmp/step1.json \
  --replace new-code.js \
  --emit-plan tmp/step3.json \
  --fix
```

**What happens**:
1. Loads plan from `tmp/step1.json`
2. Verifies target hash and location (same as step 2)
3. Applies replacement (with all guards active)
4. Emits new plan to `tmp/step3.json` (for follow-ups)
5. Writes changes to file

**Result**: Entire workflow stayed locked to original target via plans

---

### Pattern 2: Batch Operations (Multiple Targets)

**Goal**: Modify multiple functions, all verified

**Setup: Discover All Targets**
```bash
node js-scan.js --what-calls "processData" --recursive --json \
  > callers.json

# Process results into location list
cat > targets.json <<EOF
[
  { "file": "src/services/data.js", "selector": "function processData" },
  { "file": "src/api/routes.js", "selector": "processData(" },
  { "file": "crawl.js", "selector": "processData(" }
]
EOF
```

**Step 1: Locate All Targets**
```bash
# For each target, emit a plan
node js-edit.js --file src/services/data.js \
  --locate "function processData" \
  --emit-plan tmp/plans/target-1.json --json

node js-edit.js --file src/api/routes.js \
  --locate "processData(" \
  --emit-plan tmp/plans/target-2.json --json

node js-edit.js --file crawl.js \
  --locate "processData(" \
  --emit-plan tmp/plans/target-3.json --json
```

**Result**: Three plans in `tmp/plans/`
- Each plan verifies its specific target
- Each plan has different pathSignature
- All locked to original locations

**Step 2: Build Batch Changes (Using Plans)**
```bash
cat > batch.json <<EOF
[
  {
    "fromPlan": "tmp/plans/target-1.json",
    "replacement": "async function processData"
  },
  {
    "fromPlan": "tmp/plans/target-2.json",
    "replacement": "await processData("
  },
  {
    "fromPlan": "tmp/plans/target-3.json",
    "replacement": "await processData("
  }
]
EOF
```

**Step 3: Dry-Run (With Plans)**
```bash
node js-edit.js --changes batch.json --dry-run --json
```

**What happens**:
1. For each change with `fromPlan`:
   - Load plan
   - Verify target hash (all 3 targets unchanged)
   - Verify spans (all 3 locations valid)
2. Return dry-run report:
   - All 3 valid → success
   - Any failed → show which ones and why

**Step 4: Apply (With Plans)**
```bash
node js-edit.js --changes batch.json --fix
```

**What happens**:
1. For each change:
   - Load plan
   - Verify target (as in dry-run)
   - Apply change (using plan guards)
   - Emit result plan
2. All succeed or all fail (atomic)

**Result**: Batch with verification
- Three separate plans, three separate verifications
- If any target changed, batch fails
- All changes succeeded, so plans emitted for follow-ups

---

### Pattern 3: Recipe Workflow (Multi-Step Orchestration)

**Goal**: Complex refactoring with plan threading

**Recipe Definition** (`refactor-rename.json`):
```json
{
  "name": "refactor-rename",
  "version": "1.0.0",
  "parameters": {
    "oldName": { "type": "string", "description": "Old function name" },
    "newName": { "type": "string", "description": "New function name" },
    "strategy": { "type": "string", "enum": ["definition-first", "callers-first"] }
  },
  
  "steps": [
    {
      "id": "locate-definition",
      "operation": "locate",
      "params": {
        "file": "${parameters.file}",
        "selector": "function ${parameters.oldName}"
      },
      "emitPlan": "tmp/plans/${parameters.oldName}-definition.json"
    },
    
    {
      "id": "rename-definition",
      "operation": "replace",
      "params": {
        "fromPlan": "tmp/plans/${parameters.oldName}-definition.json",
        "replacement": "function ${parameters.newName}"
      },
      "emitPlan": "tmp/plans/${parameters.oldName}-to-${parameters.newName}-def.json"
    },
    
    {
      "id": "find-callers",
      "operation": "scan",
      "params": {
        "what-calls": "${parameters.oldName}",
        "recursive": true
      },
      "output": "callers"
    },
    
    {
      "id": "build-caller-batch",
      "operation": "script",
      "script": "tools/scripts/build-caller-batch.js",
      "input": "${steps.find-callers.output}",
      "params": {
        "oldName": "${parameters.oldName}",
        "newName": "${parameters.newName}"
      },
      "output": "caller-batch.json"
    },
    
    {
      "id": "dry-run-callers",
      "operation": "batch-dry-run",
      "params": {
        "changes": "${steps.build-caller-batch.output}",
        "show-conflicts": true
      }
    },
    
    {
      "id": "apply-callers",
      "operation": "batch-apply",
      "params": {
        "changes": "${steps.build-caller-batch.output}",
        "atomic": true
      },
      "emitPlans": "tmp/plans/caller-updates/"
    }
  ]
}
```

**Execution**:
```bash
node js-edit.js --recipe refactor-rename.json \
  --param oldName=processData \
  --param newName=transformPayload \
  --param file=src/services/data.js \
  --strategy=definition-first \
  --fix \
  --emit-plans tmp/recipe-results/
```

**What Happens (Step by Step)**:

1. **Step 1**: Locate definition
   - Finds `function processData` in src/services/data.js
   - Emits plan to `tmp/plans/processData-definition.json`

2. **Step 2**: Rename definition (using plan from step 1)
   - Loads plan
   - Verifies target unchanged
   - Replaces with `function transformPayload`
   - Emits new plan

3. **Step 3**: Find all callers
   - Uses `--what-calls processData --recursive`
   - Gets list of 15 callers

4. **Step 4**: Build batch for all callers
   - Creates batch.json with 15 changes
   - Each change targets one caller location

5. **Step 5**: Dry-run all caller changes
   - Each change uses a plan (if available)
   - Shows all 15 will succeed

6. **Step 6**: Apply all caller changes
   - Atomic: all 15 succeed or none
   - Emits plan for each change to `tmp/recipe-results/`

**Plans Flow**:
```
processData-definition.json
        ↓ (rename definition)
processData-to-transformPayload-def.json
        ↓ (find callers)
caller-1.json
caller-2.json
caller-3.json
... (15 total)
```

**Result**: Complete refactoring traced through plans
- Every operation verified
- All changes locked to original locations
- Can replay any step
- Audit trail of what changed

---

## Part 4: Plans Integration Architecture

### How `--from-plan` Works (Implementation Details)

```javascript
/**
 * Load and apply guards from previous operation plan
 */
function processPlanFlag(args) {
  if (!args['from-plan']) {
    return; // No plan flag
  }
  
  const planPath = args['from-plan'];
  
  // Step 1: Load plan
  const planContent = fs.readFileSync(planPath, 'utf-8');
  const plan = JSON.parse(planContent);
  
  // Step 2: Validate plan format
  validatePlanSchema(plan);
  
  // Step 3: Extract guards
  const { guards, metadata, file } = plan;
  
  // Step 4: Auto-populate args (but don't override explicit args)
  if (!args.file) {
    args.file = file;
  }
  
  if (!args['expect-hash']) {
    args['expect-hash'] = guards.expectHash;
  }
  
  if (!args['expect-span']) {
    const { start, end } = guards.expectSpan.split(':');
    args['expect-span'] = `${start}:${end}`;
  }
  
  if (!args['path-signature']) {
    args['path-signature'] = guards.pathSignature;
  }
  
  // Step 5: Mark operation as plan-guarded (for logging/auditing)
  args._planId = plan.planId;
  args._planGuarded = true;
  
  // Step 6: Store metadata for verification phase
  args._planMetadata = metadata;
  args._planGuards = guards;
  
  // Step 7: Log that plan was loaded
  console.log(`[PLAN] Loaded plan ${plan.planId} from ${planPath}`);
  console.log(`[PLAN] Guards active: hash=${guards.expectHash}, span=${guards.expectSpan}`);
}

/**
 * Before any operation with plan guards, verify target hasn't changed
 */
function verifyPlanGuards(args, targetCode, file) {
  if (!args._planGuarded) {
    return; // No plan in use
  }
  
  const { _planGuards, _planMetadata } = args;
  
  // Verification 1: Content hash
  const currentHash = sha256(targetCode);
  if (currentHash !== _planGuards.expectHash) {
    throw new Error(
      `PLAN GUARD FAILED: Content hash mismatch\n` +
      `  Expected hash: ${_planGuards.expectHash}\n` +
      `  Current hash:  ${currentHash}\n` +
      `  Reason: Target code has been modified since plan was created\n` +
      `  File: ${file}\n` +
      `  Plan: ${args._planId}`
    );
  }
  
  // Verification 2: Character span
  const fileContent = fs.readFileSync(file, 'utf-8');
  const [start, end] = _planGuards.expectSpan.split(':').map(Number);
  const spanContent = fileContent.slice(start, end);
  
  if (spanContent !== targetCode) {
    throw new Error(
      `PLAN GUARD FAILED: Span location changed\n` +
      `  Expected span: ${start}:${end}\n` +
      `  Expected content: ${targetCode.slice(0, 50)}...\n` +
      `  Current content at span: ${spanContent.slice(0, 50)}...\n` +
      `  Reason: Code may have shifted (other changes in file)\n` +
      `  File: ${file}\n` +
      `  Plan: ${args._planId}`
    );
  }
  
  // Verification 3: Path signature (semantic location)
  const currentPathSig = buildPathSignature(file, _planMetadata.name);
  if (currentPathSig !== _planGuards.pathSignature) {
    throw new Error(
      `PLAN GUARD FAILED: Semantic location changed\n` +
      `  Expected location: ${_planGuards.pathSignature}\n` +
      `  Current location:  ${currentPathSig}\n` +
      `  Reason: Function/class structure may have changed\n` +
      `  File: ${file}\n` +
      `  Plan: ${args._planId}`
    );
  }
  
  console.log(`[PLAN VERIFIED] All guards passed for plan ${args._planId}`);
}

/**
 * After operation completes, emit new plan for follow-ups
 */
function emitResultPlan(args, operation, result) {
  if (!args['emit-plan']) {
    return; // No plan output requested
  }
  
  const planPath = args['emit-plan'];
  
  const resultPlan = {
    planId: generateUUID(),
    timestamp: new Date().toISOString(),
    file: args.file,
    operation: operation,
    
    metadata: {
      hash: sha256(result.newContent || result.targetCode),
      span: result.charSpan || { start: result.start, end: result.end },
      charSpan: result.charSpan,
      pathSignature: result.pathSignature,
      kind: result.kind,
      name: result.name
    },
    
    context: {
      operation: operation,
      originalContent: result.originalContent,
      newContent: result.newContent,
      lineSpan: result.lineSpan,
      linesDelta: result.linesDelta || 0,
      charactersDelta: result.charactersDelta || 0
    },
    
    verification: {
      beforeHash: result.beforeHash,
      afterHash: result.afterHash,
      status: 'applied',
      timestamp: new Date().toISOString()
    },
    
    guards: {
      expectHash: sha256(result.newContent || result.targetCode),
      expectSpan: `${result.charSpan.start}:${result.charSpan.end}`,
      pathSignature: result.pathSignature,
      allowMultiple: args['allow-multiple'] ? true : false,
      requiresExactMatch: args['require-exact'] ? true : false
    }
  };
  
  fs.writeFileSync(planPath, JSON.stringify(resultPlan, null, 2));
  console.log(`[PLAN EMITTED] ${planPath}`);
}
```

---

## Part 5: Plans Enable Agent Reliability

### Problem: Operations Can Drift

**Scenario**: Multi-step refactoring without plans

```bash
# Step 1: Locate function
node js-edit.js --file src/app.js --locate "processData" --json
# Output: lines 45-50

# [Agent does other work, file changes]

# Step 2: Replace at stored location
node js-edit.js --file src/app.js --replace-span 45-50 --with "new code"
# ERROR: Lines 45-50 now contain different code (file changed)
# Agent has no way to know
```

### Solution: Plans Keep Operations Locked

```bash
# Step 1: Locate function
node js-edit.js --file src/app.js --locate "processData" \
  --emit-plan tmp/plan.json --json
# Emits plan with hash="abc123", span="500:650"

# [File changes in between]

# Step 2: Replace using plan
node js-edit.js --from-plan tmp/plan.json --replace "new code" --fix
# BEFORE: Tries to replace
#   1. Loads plan
#   2. Verifies hash (catches: "Code changed")
#   3. Fails with error, doesn't modify file
# Agent sees error, can recover
```

### What Plans Guarantee

| Guarantee | Without Plans | With Plans |
|-----------|---|---|
| **Target unchanged** | ❌ Unknown | ✅ Verified |
| **Location still valid** | ❌ Unknown | ✅ Verified |
| **Semantic match** | ❌ Unknown | ✅ Verified |
| **Operation replayable** | ❌ Risky | ✅ Safe |
| **Multi-step safe** | ❌ Risky | ✅ Verified at each step |
| **Error visibility** | ❌ Silent fails | ✅ Explicit errors |

---

## Part 6: Plans Integration Roadmap

### Hour 12: `--from-plan` Implementation

**What to build**:
```javascript
// In js-edit.js argument processing

if (args['from-plan']) {
  const plan = loadPlan(args['from-plan']);
  args.file = args.file || plan.file;
  args['expect-hash'] = args['expect-hash'] || plan.guards.expectHash;
  args['expect-span'] = args['expect-span'] || plan.guards.expectSpan;
  args._planGuarded = true;
  args._planId = plan.planId;
}

// In operation verification phase

if (args._planGuarded) {
  verifyPlanGuards(args, targetCode, file);
}

// After successful operation

if (args['emit-plan']) {
  emitResultPlan(args, operationType, result);
}
```

**Files modified**:
- `tools/dev/js-edit.js` (add plan processing)
- `tools/dev/js-edit/operations/plan-utils.js` (new - helper functions)

**Tests to add**:
- Load plan successfully
- Verify guards work (catch code changes)
- Emit plan after operation
- Chain operations with plans

### Hour 13: Documentation & Examples

**Documentation to create**:
- `/docs/PLANS_IN_AGENT_WORKFLOWS.md` (workflows)
- Plan format specification
- Plan verification logic
- Examples of multi-step workflows

**Examples to provide**:
```bash
# Example 1: Locate → Replace → Verify
node js-edit.js --locate target --emit-plan p1.json
node js-edit.js --from-plan p1.json --replace code --emit-plan p2.json
node js-edit.js --from-plan p2.json --context-function

# Example 2: Batch with plans
node js-edit.js --changes batch.json --dry-run
node js-edit.js --changes batch.json --fix

# Example 3: Recipe workflow
node js-edit.js --recipe refactor.json --emit-plans tmp/
```

### Hour 14: Validation

**Integration tests**:
- Plan loading and verification
- Multi-step workflows (locate → modify → verify)
- Batch operations with plans
- Error cases (code changed, span invalid, etc.)

**End-to-end test**:
```bash
# Discover with Gap 2
node js-scan.js --what-calls myFunc

# Batch dry-run with Gap 3
node js-edit.js --changes batch.json --dry-run

# Apply with plans
node js-edit.js --changes batch.json --fix

# Verify with plans
for plan in tmp/plans/*.json; do
  node js-edit.js --from-plan $plan --context-function
done
```

---

## Part 7: Agent Workflow Examples

### Example 1: Safe Function Rename

```bash
# Discovery (Gap 2)
node js-scan.js --what-calls "processData" --recursive --json \
  | tee discover.json

# Create batch
cat discover.json | jq '.transitiveCallers[] | 
  {file: .file, selector: .selector}' > targets.json

# Locate all targets, emit plans
for target in $(cat targets.json | jq -r '.[] | @base64'); do
  _jq() { echo ${target} | base64 --decode | jq -r ${1}; }
  file=$(_jq '.file')
  selector=$(_jq '.selector')
  
  node js-edit.js --file "$file" --locate "$selector" \
    --emit-plan "tmp/target-$(uuidgen).json" --json
done

# Build batch from plans
cat > batch.json <<EOF
$(ls tmp/target-*.json | jq -R '
  {
    "fromPlan": .
  }
')
EOF

# Dry-run (Gap 3)
node js-edit.js --changes batch.json --dry-run --show-conflicts

# Apply
node js-edit.js --changes batch.json --fix

# Verify (Plans)
for plan in tmp/plans/*.json; do
  node js-edit.js --from-plan "$plan" --context-function --json
done
```

### Example 2: API Refactoring (Multiple Files)

```bash
# Step 1: Locate all API handlers
node js-edit.js --file src/api/handlers.js \
  --locate "exports.handler1" \
  --emit-plan tmp/handler-1.json

node js-edit.js --file src/api/handlers.js \
  --locate "exports.handler2" \
  --emit-plan tmp/handler-2.json

# Step 2: Modify each (using plans)
node js-edit.js --from-plan tmp/handler-1.json \
  --replace new-code-1.js --emit-plan tmp/handler-1-updated.json --fix

node js-edit.js --from-plan tmp/handler-2.json \
  --replace new-code-2.js --emit-plan tmp/handler-2-updated.json --fix

# Step 3: Verify each change is correct
node js-edit.js --from-plan tmp/handler-1-updated.json \
  --context-function --json | jq '.context'

node js-edit.js --from-plan tmp/handler-2-updated.json \
  --context-function --json | jq '.context'
```

---

## Summary: Why Plans Matter

### For Agents
- **Safety**: Verify target before every operation
- **Chaining**: Multi-step workflows stay locked to original locations
- **Recovery**: Know exactly what changed and why
- **Speed**: No manual location re-specification

### For Reliability
- **Audit trail**: Every change recorded
- **Reproducibility**: Can replay operations exactly
- **Error catching**: Detects changes between steps
- **Verification**: Proof changes match expectations

### For Integration
- **Batch operations**: Verify all before applying any
- **Multi-step recipes**: Each step verified
- **Agent workflows**: Seamless operation chaining
- **Plans become first-class**: Central to all workflows

---

_Plans Integration Complete Technical Guide._

This deep-dive shows:
- What plans are (5-section structure)
- How they work (lifecycle, verification, emission)
- Multi-step workflows (locate → context → modify, batch, recipes)
- Implementation details (code, verification logic)
- Agent examples (real-world workflows)

Plans transform agent refactoring from **risky and manual** to **safe and verified**.
