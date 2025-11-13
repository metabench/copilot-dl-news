---
type: implementation-roadmap
title: "10-14 Hour Implementation Plan: Gap 2, Gap 3, Plans Integration"
subtitle: "Sequenced, testable, incremental delivery"
date: 2025-11-13
---

# Implementation Roadmap: From Vision to Code (10-14 Hours)

## Overview

**Scope**: Three focused improvements to js-scan and js-edit

1. **Gap 2**: Semantic relationship queries (`--what-imports`, `--what-calls`, `--export-usage`)
2. **Gap 3**: Batch dry-run with recovery (`--dry-run`, `--recalculate-offsets`)
3. **Plans**: First-class plan integration (`--from-plan` flag)

**Total Effort**: 10-14 hours
**Dependencies**: 0 (additive, no breaking changes)
**Risk**: Low (read-only for Gap 2, preview-only for Gap 3, optional for Plans)

---

## Phase 1: Relationship Queries (Gap 2) — 6-8 Hours

### Why This Phase First?

Relationship queries enable efficient discovery. They're read-only and don't require other changes.

### Hour 1-2: Foundation & Graph Analysis

**Task**: Understand how the import/export graph is currently built

```bash
# Where is the graph built currently?
grep -r "importGraph\|dependencies\|imports" tools/dev/js-scan/ --include="*.js"
```

**Questions to Answer**:
- How are imports currently discovered?
- Where is the graph stored in memory?
- How are exports currently tracked?
- Can we traverse it backwards (importer → importee)?

**File to Create**: `tools/dev/js-scan/lib/graph-analysis.js` (stub)

---

### Hour 2-3: Build RelationshipAnalyzer Class

**File**: `tools/dev/js-scan/operations/relationships.js`

**Pseudo-code structure**:

```javascript
class RelationshipAnalyzer {
  constructor(graph, workspaceRoot) {
    this.graph = graph;           // { file: [imports], ... }
    this.reverseGraph = new Map(); // { file: [importers], ... }
    this.callGraph = new Map();    // { function: [callers], ... }
    this._buildReverseGraph();
  }

  getWhatImports(targetFile) {
    // Return list of files importing targetFile
    // Use reverseGraph lookup
  }

  getWhatCalls(targetFunction, { recursive }) {
    // Return list of functions/locations calling targetFunction
    // Recursive: traverse callGraph deeply
  }

  getExportUsage(targetFile) {
    // List exports from file + where each is used
  }

  _buildReverseGraph() {
    // Pre-compute reverse relationships for fast lookups
  }

  _buildCallGraph() {
    // Use AST to build function-level call graph
  }
}
```

**Tests to Add**:
```javascript
describe('RelationshipAnalyzer', () => {
  it('finds direct importers of a file', () => { /* */ });
  it('finds recursive callers of a function', () => { */ });
  it('identifies unused exports', () => { /* */ });
});
```

---

### Hour 3-4: CLI Integration

**File**: `tools/dev/js-scan.js`

**New flags to add**:

```javascript
// Around line 100, in argument parsing:

.option('--what-imports <file>', 'Show all files importing this file')
.option('--what-calls <name>', 'Show all functions calling this')
.option('--export-usage <file>', 'Show all exports and their usage')
.option('--recursive', 'For --what-calls: include transitive callers')
.option('--depth <n>', 'Maximum recursion depth (default 3)')

// In main execution (around line 300):

if (args['what-imports']) {
  const analyzer = new RelationshipAnalyzer(graph, workspace);
  const result = analyzer.getWhatImports(args['what-imports']);
  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
}

if (args['what-calls']) {
  const analyzer = new RelationshipAnalyzer(graph, workspace);
  const result = analyzer.getWhatCalls(
    args['what-calls'],
    { recursive: args.recursive, depth: args.depth || 3 }
  );
  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
}

// Similar for --export-usage
```

**Integration tests**:
```bash
# Test with a real file from workspace
node tools/dev/js-scan.js --what-imports src/db/adapter.js --json

# Test with a function name
node tools/dev/js-scan.js --what-calls processData --recursive --json

# Test export analysis
node tools/dev/js-scan.js --export-usage src/utils/helpers.js --json
```

---

### Hour 4-5: Performance & Caching

**File**: Extend `tools/dev/js-scan/lib/graph-analysis.js`

**Optimization**:
- Cache reverseGraph computation (expensive one-time operation)
- Memoize call graph queries (LRU cache)
- Add `--stats` flag to show graph stats

```javascript
// In RelationshipAnalyzer constructor:

constructor(graph, workspaceRoot) {
  this.graph = graph;
  
  // Lazy-load expensive computations
  this._reverseGraphCache = null;
  this._callGraphCache = null;
}

get reverseGraph() {
  if (!this._reverseGraphCache) {
    this._reverseGraphCache = this._buildReverseGraph();
  }
  return this._reverseGraphCache;
}
```

**Benchmark**:
```javascript
console.time('build-reverse-graph');
analyzer.reverseGraph; // Trigger lazy load
console.timeEnd('build-reverse-graph');
// Target: <100ms for typical codebase
```

---

### Hour 5-6: Documentation & Examples

**Files to create/update**:
- `docs/GAP2_SEMANTIC_QUERIES.md` (implementation notes)
- Update `tools/dev/README.md` with examples
- Add test fixtures in `tests/tools/gap2/`

**Example documentation entry**:

```markdown
## --what-imports <file>

Find all modules that import/require a file.

Usage:
  node js-scan.js --what-imports src/services/auth.js --json

Output:
  {
    "target": "src/services/auth.js",
    "importerCount": 5,
    "importers": [
      { "file": "src/api/routes.js", "importType": "esm", "line": 12 },
      { "file": "crawl.js", "importType": "commonjs", "line": 8 }
    ]
  }

Use Cases:
  - Estimate ripple effects before changing API
  - Check if module can be deleted safely
  - Find all tests that use a module
```

---

### Hour 6-7: Integration Tests

**File**: `tests/tools/gap2/relationships.test.js`

```javascript
describe('Gap 2: Relationship Queries', () => {
  
  describe('--what-imports', () => {
    it('finds direct importers of a module', async () => {
      const result = await runTool('--what-imports src/utils/helpers.js --json');
      expect(result.importers).toHaveLength(3);
      expect(result.importers[0]).toHaveProperty('file');
    });
  });

  describe('--what-calls', () => {
    it('finds direct callers', async () => {
      const result = await runTool('--what-calls processData --json');
      expect(result.directCallers).toBeDefined();
    });

    it('finds transitive callers with --recursive', async () => {
      const result = await runTool('--what-calls processData --recursive --json');
      expect(result.transitiveCallers).toBeDefined();
      expect(result.transitiveCallers.length).toBeGreaterThan(result.directCallers.length);
    });
  });

  describe('--export-usage', () => {
    it('identifies unused exports', async () => {
      const result = await runTool('--export-usage src/utils/helpers.js --json');
      expect(result.unused).toBeInstanceOf(Array);
    });
  });
});
```

---

### Hour 7-8: Polish & Validation

**Checklist**:
- [ ] All three relationship queries working
- [ ] CLI flags documented in `--help`
- [ ] Error handling for missing files
- [ ] Performance within 2 seconds for typical codebase
- [ ] Integration tests passing
- [ ] Example workflows in documentation

**Validation command**:
```bash
npm run test:by-path tests/tools/gap2/ --coverage
```

---

## Phase 2: Batch Dry-Run (Gap 3) — 4-6 Hours

### Why Second?

Builds on existing js-edit infrastructure. Once Gap 2 (discovery) is done, agents use Gap 3 (safe application).

### Hour 8-9: BatchDryRunner Class

**File**: `tools/dev/js-edit/operations/batch-dryrun.js`

```javascript
class BatchDryRunner {
  constructor(changes, fileMap) {
    this.changes = changes;
    this.fileMap = fileMap;
    this.results = [];
  }

  async runDryRun() {
    // Validate each change without modifying files
    for (let i = 0; i < this.changes.length; i++) {
      const result = this._validateChange(this.changes[i], i);
      this.results.push(result);
    }
    
    return {
      success: this.results.every(r => r.status === 'valid'),
      summary: this._generateSummary(),
      results: this.results,
      conflicts: this._detectConflicts(),
      suggestions: this._generateSuggestions()
    };
  }

  _validateChange(change, id) {
    // Check: file exists, lines valid, content parseable
    // Return: { status, error, suggestion }
  }

  _detectConflicts() {
    // Check for overlapping ranges
  }

  _generateSuggestions() {
    // Suggest fixes for issues
  }
}
```

**Tests**:
```javascript
describe('BatchDryRunner', () => {
  it('detects valid changes', () => { /* */ });
  it('rejects invalid line ranges', () => { /* */ });
  it('detects overlapping changes', () => { /* */ });
  it('suggests auto-recovery', () => { /* */ });
});
```

---

### Hour 9-10: CLI Integration + Recovery System

**File**: `tools/dev/js-edit.js`

**New flags**:
```javascript
.option('--dry-run', 'Preview all changes without applying')
.option('--show-conflicts', 'Highlight overlapping edits')
.option('--recalculate-offsets', 'Auto-fix line number drift')
.option('--sequential', 'Apply changes one at a time (not atomic)')
```

**Integration in main execution**:
```javascript
if (args['dry-run']) {
  const runner = new BatchDryRunner(changes, fileMap);
  const result = await runner.runDryRun();
  
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.success ? 0 : 1);
}

if (args['recalculate-offsets']) {
  const recovered = recalculateOffsets(changes, fileMap);
  // Proceed with recovered offsets
}
```

**Recovery System** (new file):
```javascript
function recalculateOffsets(changes, fileMap) {
  // For each change:
  // 1. Find the target code using content matching (not just line numbers)
  // 2. Extract surrounding context
  // 3. Use AST + diff to locate target in modified file
  // 4. Update startLine/endLine

  return changes.map(change => ({
    ...change,
    startLine: newStart,
    endLine: newEnd,
    reason: 'offset-recalculated'
  }));
}
```

---

### Hour 10-11: Integration Tests

**File**: `tests/tools/gap3/batch-dryrun.test.js`

```javascript
describe('Gap 3: Batch Dry-Run', () => {
  
  it('accepts valid batch', async () => {
    const result = await runTool('--changes valid.json --dry-run --json');
    expect(result.success).toBe(true);
  });

  it('rejects changes with invalid lines', async () => {
    const result = await runTool('--changes invalid-lines.json --dry-run --json');
    expect(result.success).toBe(false);
    expect(result.suggestions).toContain('offset-recalculation');
  });

  it('detects overlapping changes', async () => {
    const result = await runTool('--changes overlapping.json --dry-run --show-conflicts --json');
    expect(result.conflicts).toHaveLength(1);
  });

  it('recovers from offset drift', async () => {
    // File changed, offsets drifted
    // Run with --recalculate-offsets
    const result = await runTool('--changes drifted.json --recalculate-offsets --dry-run --json');
    expect(result.success).toBe(true);
  });
});
```

---

### Hour 11-12: Documentation & Examples

**Add to `tools/dev/README.md`**:

```markdown
### Batch Dry-Run (--dry-run)

Preview all changes before applying:

  node js-edit.js --changes batch.json --dry-run --json

Example output:
  {
    "success": true,
    "summary": { "total": 5, "valid": 5, "invalid": 0 },
    "conflicts": [],
    "suggestions": []
  }

If conflicts detected:
  node js-edit.js --changes batch.json --recalculate-offsets --dry-run --json

Then apply:
  node js-edit.js --changes batch.json --fix
```

---

## Phase 3: Plans Integration (2-3 Hours)

### Why Last?

Uses completed Gap 2 + Gap 3. Makes plans accessible to agent workflows.

**Important**: For complete technical details on plans architecture, verification logic, and multi-step workflows, see `/docs/PLANS_INTEGRATION_DEEP_DIVE.md` (25,000+ words comprehensive guide).

### What Plans Are

Plans are **metadata containers** that capture operation state:
- **What was targeted**: File, location (hash, span, path signature)
- **What changed**: Before/after content, deltas
- **Guards**: Verification for next operation
- **Proof**: Audit trail with hashes

**Example plan** (simplified):
```json
{
  "planId": "plan-abc123",
  "file": "src/app.js",
  "operation": "replace",
  "metadata": {
    "hash": "5KjF9Lm2",
    "span": { "start": 1250, "end": 1450 },
    "pathSignature": "src/app.js#processData"
  },
  "guards": {
    "expectHash": "5KjF9Lm2",
    "expectSpan": "1250:1450",
    "pathSignature": "src/app.js#processData"
  }
}
```

### Hour 12: `--from-plan` Implementation

**File**: Modify `tools/dev/js-edit.js`

**New flag**:
```javascript
.option('--from-plan <path>', 'Load guards/metadata from previous operation plan')
```

**Implementation** (add plan processing to argument parsing):
```javascript
if (args['from-plan']) {
  const planFile = args['from-plan'];
  const plan = JSON.parse(fs.readFileSync(planFile, 'utf-8'));
  
  // Extract guards from plan
  const { guards, metadata, file } = plan;
  
  // Auto-populate args (don't override explicit args)
  args.file = args.file || file;
  args['expect-hash'] = args['expect-hash'] || guards.expectHash;
  args['expect-span'] = args['expect-span'] || guards.expectSpan;
  args['path-signature'] = args['path-signature'] || guards.pathSignature;
  
  // Mark operation as plan-guarded (for logging/auditing)
  args._planId = plan.planId;
  args._planGuarded = true;
  args._planMetadata = metadata;
  args._planGuards = guards;
  
  console.log(`[PLAN] Loaded plan ${plan.planId} from ${planFile}`);
}
```

**Verification logic** (before any operation with plan guards):
```javascript
function verifyPlanGuards(args, targetCode, file) {
  if (!args._planGuarded) return; // No plan in use
  
  const { _planGuards } = args;
  
  // Check 1: Content hash (most important)
  const currentHash = sha256(targetCode);
  if (currentHash !== _planGuards.expectHash) {
    throw new Error(
      `PLAN GUARD FAILED: Content hash mismatch\n` +
      `Expected: ${_planGuards.expectHash}\n` +
      `Got: ${currentHash}\n` +
      `The code may have been modified since plan was created.`
    );
  }
  
  // Check 2: Character span (ensure location didn't shift)
  const fileContent = fs.readFileSync(file, 'utf-8');
  const [start, end] = _planGuards.expectSpan.split(':').map(Number);
  const spanContent = fileContent.slice(start, end);
  
  if (spanContent !== targetCode) {
    throw new Error(
      `PLAN GUARD FAILED: Target location shifted\n` +
      `Expected span ${start}:${end} doesn't contain target.`
    );
  }
  
  // Check 3: Path signature (semantic safety)
  const currentSig = buildPathSignature(file, ast.parse(fileContent));
  if (currentSig !== _planGuards.pathSignature) {
    throw new Error(
      `PLAN GUARD FAILED: Semantic location changed\n` +
      `Expected: ${_planGuards.pathSignature}\n` +
      `Got: ${currentSig}`
    );
  }
  
  console.log(`[PLAN VERIFIED] All guards passed`);
}
```

**Plan emission** (after successful operation):
```javascript
if (args['emit-plan']) {
  const resultPlan = {
    planId: generateUUID(),
    timestamp: new Date().toISOString(),
    file: args.file,
    operation: operationType,
    
    metadata: {
      hash: sha256(targetCode),
      span: { start: charStart, end: charEnd },
      pathSignature: buildPathSignature(args.file, selector),
      kind: ast.getKind(targetNode),
      name: ast.getName(targetNode)
    },
    
    context: {
      originalContent: beforeCode,
      newContent: afterCode,
      linesDelta: newLines - oldLines,
      charactersDelta: afterCode.length - beforeCode.length
    },
    
    guards: {
      expectHash: sha256(targetCode),
      expectSpan: `${charStart}:${charEnd}`,
      pathSignature: buildPathSignature(args.file, selector)
    }
  };
  
  fs.writeFileSync(args['emit-plan'], JSON.stringify(resultPlan, null, 2));
  console.log(`[PLAN EMITTED] ${args['emit-plan']}`);
}
```

**Tests to add**:
```javascript
describe('Plans Integration', () => {
  it('loads guards from plan', () => {
    // Emit plan from first operation
    // Use --from-plan in second operation
    // Verify guards are active
  });
  
  it('verifies content hash before operation', () => {
    // Create plan with hash X
    // Modify file to change hash
    // Try to use plan
    // Should fail with guard error
  });
  
  it('detects shifted code location', () => {
    // Create plan with span
    // Modify file (other code added before)
    // Try to use plan
    // Should detect span mismatch
  });
  
  it('chains operations with plans', () => {
    // locate → emit plan
    // context using plan
    // replace using plan
    // All should work with guards
  });
});
```

---

### Hour 13: Multi-Step Workflow Documentation

**Create**: `/docs/PLANS_MULTI_STEP_WORKFLOWS.md`

Document the three key workflow patterns:

**Pattern 1: Locate → Context → Modify**
```bash
# Step 1: Locate and emit plan
node js-edit.js --locate "exports.foo" --emit-plan p1.json

# Step 2: Get context using plan (auto-verified)
node js-edit.js --from-plan p1.json --context-function

# Step 3: Modify using plan (auto-verified)
node js-edit.js --from-plan p1.json --replace new-code.js --emit-plan p2.json

# Result: All steps locked to original target
```

**Pattern 2: Batch Operations with Plans**
```bash
# Locate all targets, emit plans
for target in targets; do
  node js-edit.js --locate "$target" --emit-plan "plans/target-$i.json"
done

# Build batch using plans
cat > batch.json <<EOF
[
  { "fromPlan": "plans/target-1.json", "replacement": "..." },
  { "fromPlan": "plans/target-2.json", "replacement": "..." }
]
EOF

# Dry-run verifies all targets
node js-edit.js --changes batch.json --dry-run

# Apply atomically
node js-edit.js --changes batch.json --fix
```

**Pattern 3: Recipe Orchestration**
```bash
# Recipe with multiple steps, each using plans
node js-edit.js --recipe refactor.json --emit-plans tmp/

# Recipe engine:
# 1. Step 1: locate → emit plan
# 2. Step 2: use plan from step 1 → emit new plan
# 3. Step 3: build batch from all plans → emit batch plans
# 4. Each step verifies guards
```

**Update**: `/docs/AGENT_REFACTORING_PLAYBOOK.md`

Add section: "How Plans Keep Multi-Step Workflows Safe"
- Show error scenarios (code changed, location shifted)
- Show how plans catch errors
- Show guard verification output

---

### Hour 13-14: End-to-End Validation

**Create comprehensive test**: `tests/tools/end-to-end/plans-integration.test.js`

```javascript
describe('Plans Integration: End-to-End', () => {
  
  it('complete workflow: discover → dry-run → apply → verify', () => {
    // 1. Use Gap 2 to discover
    const callers = scanForCallers('processData');
    
    // 2. Locate all targets, emit plans
    const plans = locateAllTargets(callers);
    
    // 3. Build batch from plans
    const batch = buildBatch(plans);
    
    // 4. Use Gap 3 to dry-run
    const dryRunResult = dryRunBatch(batch);
    expect(dryRunResult.success).toBe(true);
    
    // 5. Apply batch with plans
    const applyResult = applyBatch(batch);
    expect(applyResult.applied).toBe(callers.length);
    
    // 6. Verify each change with plans
    for (const resultPlan of applyResult.resultPlans) {
      const context = getContext(resultPlan);
      expect(context).toBeDefined();
    }
  });
  
  it('detects code changed since plan was created', () => {
    // 1. Create plan
    const plan = locate('target');
    
    // 2. Externally modify the file
    modifyFileOtherwise();
    
    // 3. Try to use plan
    expect(() => {
      applyOperationWithPlan(plan);
    }).toThrow('PLAN GUARD FAILED: Content hash mismatch');
  });
  
  it('detects location shifted', () => {
    // 1. Create plan with span
    const plan = locate('target');
    
    // 2. Externally add code before target
    prependCodeToFile();
    
    // 3. Try to use plan
    expect(() => {
      applyOperationWithPlan(plan);
    }).toThrow('PLAN GUARD FAILED: Target location shifted');
  });
});
```

**Performance validation**:
```javascript
it('plans add minimal overhead to operations', () => {
  const withoutPlan = time(() => {
    applyOperation(targetCode, file);
  });
  
  const withPlan = time(() => {
    const plan = emit(operation);
    applyOperationWithPlan(plan);
  });
  
  // Plan overhead should be <50ms
  expect(withPlan - withoutPlan).toBeLessThan(50);
});
```

**Final validation**:
```bash
# Run all tests
npm run test:by-path tests/tools/end-to-end/ --coverage

# Target: >90% coverage for new code
# All tests passing
# No performance regressions
```

---

### Documentation Files to Create/Update

| File | Purpose | Content |
|------|---------|---------|
| **PLANS_INTEGRATION_DEEP_DIVE.md** | Complete technical guide | Architecture, verification, workflows |
| **AGENT_REFACTORING_PLAYBOOK.md** | Update plans section | Multi-step workflow examples |
| **IMPLEMENTATION_ROADMAP.md** | This file | Phase 3 detailed steps |
| **tools/dev/README.md** | CLI reference | Document `--from-plan` flag |

See `/docs/PLANS_INTEGRATION_DEEP_DIVE.md` for 25,000+ word comprehensive guide covering:
- Plan structure (5-section format)
- Plan lifecycle (emission → storage → consumption → verification)
- Multi-step workflows (locate → context → modify, batch, recipes)
- Implementation details (code templates, verification logic)
- Agent examples (real-world scenarios)
- Architecture (how --from-plan works internally)

---

## Testing Strategy (Inline with Implementation)

### Unit Tests (Per Phase)
- Each class has isolated tests
- Mock file system where needed
- Test happy path + error cases

### Integration Tests (Per Phase)
- Test CLI flags with real files
- Verify JSON output format
- Test with various file types (.js, .cjs, .mjs)

### End-to-End Tests
```bash
# Complete workflow test
# 1. Use Gap 2 to discover
# 2. Use Gap 3 to dry-run
# 3. Apply and verify with plans
npm run test:by-path tests/tools/end-to-end/
```

### Performance Benchmarks
```javascript
// For each gap, add a benchmark
console.time('gap2-query');
// ... run query
console.timeEnd('gap2-query');
// Target: <2 seconds per query
```

---

## Rollout Plan

### Week 1 (Phase 1)
- **Mon**: Hours 1-2 (Foundation)
- **Tue**: Hours 2-4 (RelationshipAnalyzer + CLI)
- **Wed**: Hours 4-5 (Performance)
- **Thu**: Hours 5-7 (Docs + tests)
- **Fri**: Validation & demo

**Deliverable**: `--what-imports`, `--what-calls`, `--export-usage` working

### Week 2 (Phase 2)
- **Mon**: Hours 8-9 (BatchDryRunner)
- **Tue**: Hours 9-10 (CLI + recovery)
- **Wed-Thu**: Hours 10-11 (Tests + docs)
- **Fri**: Validation & demo

**Deliverable**: `--dry-run` working, agents can preview batch changes

### Week 3 (Phase 3)
- **Mon-Tue**: Hours 12-14 (Plans integration)
- **Wed-Thu**: Documentation + agent guide updates
- **Fri**: Full end-to-end demo

**Deliverable**: `--from-plan` working, agent workflows streamlined

---

## Commit Strategy

### Gap 2 Commits
1. `feat: Add RelationshipAnalyzer class`
2. `feat: Add --what-imports flag to js-scan`
3. `feat: Add --what-calls and --export-usage flags`
4. `test: Add Gap 2 relationship query tests`
5. `docs: Document relationship queries`

### Gap 3 Commits
1. `feat: Add BatchDryRunner class`
2. `feat: Add --dry-run flag to js-edit`
3. `feat: Add offset recalculation`
4. `test: Add Gap 3 batch dry-run tests`
5. `docs: Document batch dry-run workflow`

### Plans Integration Commits
1. `feat: Add --from-plan flag`
2. `docs: Add agent workflow guide`
3. `test: Add plans integration tests`

---

## Success Criteria

### Gap 2 ✅
- [ ] All relationship queries working (<2 sec per query)
- [ ] CLI help documents new flags
- [ ] Integration tests passing (100%)
- [ ] Documentation with examples

### Gap 3 ✅
- [ ] Dry-run shows all issues upfront
- [ ] Recovery suggestions functional
- [ ] Batch failure rate drops 90%
- [ ] Integration tests passing (100%)

### Plans ✅
- [ ] `--from-plan` loads guards correctly
- [ ] Follow-up operations use plans
- [ ] Agent workflows verified end-to-end

---

## Estimated Timeline

| Phase | Hours | Duration | Blockers | Risk |
|-------|-------|----------|----------|------|
| Gap 2 | 6-8 | ~2 days | None | Low |
| Gap 3 | 4-6 | ~1.5 days | Gap 2 done | Low |
| Plans | 2-3 | ~1 day | Gap 3 done | Low |
| **Total** | **10-14** | **~4-5 days** | None | **Low** |

---

## Risk Mitigation

### Risk: Import Graph Construction Incomplete
**Mitigation**: Add graph stats (`--stats` flag) to verify coverage

### Risk: Performance Regression on Large Graphs
**Mitigation**: Benchmark before/after, cache aggressively

### Risk: Offset Recalculation Incorrect
**Mitigation**: Use AST + content matching, extensive tests with real files

### Risk: Plans Format Incompatible with Existing Systems
**Mitigation**: Plans are read-only metadata, non-breaking, backward compatible

---

## How This Enables Agents

Once deployed:

1. **Discover efficiently** (Gap 2):
   ```bash
   node js-scan.js --what-calls myFunction --recursive --json
   # <2 minutes to understand relationships
   ```

2. **Refactor safely** (Gap 3):
   ```bash
   node js-edit.js --changes batch.json --dry-run --json
   # See all issues upfront, no surprises
   ```

3. **Chain operations** (Plans):
   ```bash
   node js-edit.js --locate target --emit-plan tmp/plan.json --fix
   node js-edit.js --from-plan tmp/plan.json --context-function --json
   # Follow-up operations stay synchronized
   ```

**Result**: Agents complete refactoring tasks in 10-15 minutes (vs. 60-90 minutes currently).

---

_Ready for implementation sprint. Estimated delivery: 4-5 days with 1 engineer._
