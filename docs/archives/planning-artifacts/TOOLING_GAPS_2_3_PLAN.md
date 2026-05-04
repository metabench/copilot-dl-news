---
type: implementation-plan
title: "Critical Tooling Gaps: Relationship Queries & Batch Dry-Run"
subtitle: "Gap 2 & Gap 3 Strategic Implementation with Plans Integration"
date: 2025-11-13
priority: "high"
complexity: "intermediate"
estimated-effort: "10-14 hours"
---

# Critical Tooling Gaps: Gap 2 & Gap 3 + Plans Integration

## Executive Summary

Two critical gaps limit agent efficiency:

1. **Gap 2: Semantic Relationship Queries** — Agents can't efficiently ask "what imports this?" or "what calls this?"
2. **Gap 3: Batch Dry-Run + Recovery** — Batch operations fail silently; agents need upfront visibility

**Strategic Insight**: Fix these gaps + integrate plans into agent workflows = 60-80% time savings on code discovery and refactoring.

---

## Gap 2: Semantic Relationship Queries (6-8 hours)

### Current State

`js-scan` can find code but requires multiple searches to understand relationships:

```bash
# Current workflow to understand "what uses this module?":
node js-scan.js --search "processData" --view terse

# Agent must manually read results, then search for each caller:
node js-scan.js --search "caller1" --json
node js-scan.js --search "caller2" --json
# Time: 15-25 minutes
```

### What We Need

Structured relationship queries:

```bash
# Direct importers (immediate dependents)
node js-scan.js --what-imports "src/services/validation.js" --json

# Transitive callers (all code paths leading here)
node js-scan.js --what-calls "processData" --recursive --json

# Cross-module reverse dependencies
node js-scan.js --reverse-deps "src/db/adapter.js" --depth 2 --json

# Export graph (what this module exports + their usage)
node js-scan.js --export-usage "src/utils/helpers.js" --json
```

### Implementation Plan: 6-8 Hours

#### Phase 1: Build Relationship Index (2-3 hours)
**File**: `tools/dev/js-scan/operations/relationships.js` (new)

```javascript
/**
 * Relationship analysis — semantic queries on import/export graphs
 */

class RelationshipAnalyzer {
  constructor(importGraph, workspaceRoot) {
    this.graph = importGraph;      // From existing scanner
    this.workspace = workspaceRoot;
    this.cache = new Map();
  }

  /**
   * What files import/require this file?
   * Direct importers only (immediate dependents)
   */
  getWhatImports(targetFile) {
    const normalized = this._normalize(targetFile);
    const importers = [];

    // Walk all files, find those that import normalized
    for (const [file, imports] of this.graph.entries()) {
      if (imports.some(imp => this._normalize(imp) === normalized)) {
        importers.push({
          file,
          importType: this._detectImportType(file, normalized),
          importLine: this._findImportLine(file, normalized)
        });
      }
    }

    return {
      target: targetFile,
      importerCount: importers.length,
      importers,
      riskLevel: importers.length > 5 ? 'high' : 'low'
    };
  }

  /**
   * What functions/variables does this code call?
   * Recursive traversal of call graph
   */
  getWhatCalls(targetFunction, options = {}) {
    const { recursive = false, maxDepth = 3, depth = 0 } = options;

    if (depth > maxDepth) {
      return [];
    }

    const callers = this._findDirectCallers(targetFunction);

    if (!recursive) {
      return callers;
    }

    // Recursive: find who calls the callers
    const allCallers = new Set(callers);
    for (const caller of callers) {
      const transitiveCallers = this.getWhatCalls(caller, {
        recursive: true,
        maxDepth,
        depth: depth + 1
      });
      transitiveCallers.forEach(tc => allCallers.add(tc));
    }

    return Array.from(allCallers);
  }

  /**
   * What modules depend on this one (transitive)?
   */
  getReverseDeps(targetFile, options = {}) {
    const { depth = 1 } = options;
    const normalized = this._normalize(targetFile);
    const deps = new Map(); // depth -> [files]

    for (let d = 0; d <= depth; d++) {
      if (d === 0) {
        deps.set(0, [normalized]);
      } else {
        const prevLevel = deps.get(d - 1);
        const nextLevel = new Set();

        for (const file of prevLevel) {
          const importers = this.getWhatImports(file).importers;
          importers.forEach(imp => nextLevel.add(imp.file));
        }

        deps.set(d, Array.from(nextLevel));
      }
    }

    return {
      target: targetFile,
      layers: deps,
      totalDependents: Array.from(deps.values()).reduce((sum, arr) => sum + arr.length, 0),
      riskProfile: this._assessRiskProfile(deps)
    };
  }

  /**
   * What do other modules use from this export?
   */
  getExportUsage(targetFile) {
    const exports = this._listExports(targetFile);
    const usage = {};

    for (const exp of exports) {
      usage[exp] = {
        exportName: exp,
        usedBy: this._findUsageOfExport(targetFile, exp),
        usageCount: this._countUsage(targetFile, exp)
      };
    }

    return {
      file: targetFile,
      exports,
      usage,
      unused: exports.filter(e => usage[e].usageCount === 0)
    };
  }

  // ===== Private Helpers =====

  _normalize(filePath) {
    // Normalize path format for comparison
    return path.resolve(filePath).toLowerCase();
  }

  _detectImportType(file, target) {
    // ESM, CommonJS, dynamic import, etc.
  }

  _findImportLine(file, target) {
    // Return line number where import occurs
  }

  _findDirectCallers(functionName) {
    // Use AST to find who calls this function
  }

  _assessRiskProfile(depLayers) {
    // Score risk based on # of dependents at each layer
  }

  _listExports(file) {
    // List all exports from file
  }

  _findUsageOfExport(file, exportName) {
    // Find all places exportName is used
  }

  _countUsage(file, exportName) {
    // Count usage occurrences
  }
}

module.exports = RelationshipAnalyzer;
```

#### Phase 2: CLI Integration (2 hours)
**Modify**: `tools/dev/js-scan.js` (add new operations)

```bash
# Add flags:
# --what-imports <path>
# --what-calls <name>
# --reverse-deps <path> [--depth N]
# --export-usage <path>
```

Example integration:
```javascript
// In js-scan.js main execution:

if (args['what-imports']) {
  const analyzer = new RelationshipAnalyzer(importGraph, workspace);
  const result = analyzer.getWhatImports(args['what-imports']);
  outputJson(result);
  process.exit(0);
}

if (args['what-calls']) {
  const analyzer = new RelationshipAnalyzer(importGraph, workspace);
  const result = analyzer.getWhatCalls(
    args['what-calls'],
    { recursive: args['recursive'], maxDepth: args['depth'] || 3 }
  );
  outputJson(result);
  process.exit(0);
}
```

#### Phase 3: Tests + Documentation (2 hours)
- Unit tests for each query type
- Example workflows showing time savings
- Integration with ripple analysis

### Gap 2 Impact: Concrete Example

**Before** (current - 25-30 minutes):
```bash
# 1. Search for usage of processData
node js-scan.js --search "processData"
# Result: Found in 3 files
# Time: 3 minutes

# 2. Agent must manually read each and understand relationships
# Time: 10 minutes reading

# 3. Search for each file's importers
node js-scan.js --search "import.*validation.js"
# (doesn't actually work - text search, not semantic)
# Time: 12+ minutes trying different patterns
```

**After** (with Gap 2 fix - 5-8 minutes):
```bash
# Direct semantic query
node js-scan.js --what-imports "src/services/validation.js" --json

# Returns:
{
  "importerCount": 5,
  "importers": [
    { "file": "src/api/handler.js", "importType": "esm" },
    { "file": "crawl.js", "importType": "commonjs" },
    ...
  ],
  "riskLevel": "low"
}
# Time: <30 seconds
```

---

## Gap 3: Batch Dry-Run + Recovery (4-6 hours)

### Current State

Batch operations are risky:

```bash
# Agents prepare JSON batch:
cat > changes.json <<EOF
[
  { "file": "src/app.js", "startLine": 10, "endLine": 15, "replacement": "..." },
  { "file": "src/services/db.js", "startLine": 50, "endLine": 52, "replacement": "..." }
]
EOF

# Apply atomically:
node js-edit.js --changes changes.json --atomic --json

# If even one fails:
# - All fail (atomic)
# - Error message is terse
# - Agent must debug manually
# - Time wasted: 15-20 minutes per failure
```

### What We Need

Dry-run with detailed feedback:

```bash
# Step 1: Preview before applying
node js-edit.js --changes changes.json --dry-run --show-conflicts --json

# Returns detailed report:
{
  "summary": {
    "total": 5,
    "valid": 4,
    "invalid": 1,
    "estimatedDuration": "150ms"
  },
  "results": [
    {
      "changeId": 1,
      "file": "src/app.js",
      "status": "valid",
      "preview": "...",
      "offset_impact": "+3 lines"
    },
    {
      "changeId": 3,
      "file": "src/services/db.js",
      "status": "invalid",
      "error": "Line 50 is now 46 (file changed)",
      "suggestion": "Try --recalculate-offsets to auto-fix",
      "recovery": {
        "autoFix": true,
        "originalLines": "50-52",
        "suggestedLines": "46-48"
      }
    }
  ]
}

# Step 2: Fix + rerun
node js-edit.js --changes changes.json --recalculate-offsets --dry-run --json

# Step 3: Apply with confidence
node js-edit.js --changes changes.json --fix
```

### Implementation Plan: 4-6 Hours

#### Phase 1: Dry-Run Infrastructure (2-3 hours)
**File**: `tools/dev/js-edit/operations/batch-dryrun.js` (new)

```javascript
/**
 * Batch dry-run — Preview all changes before applying
 * Identify conflicts, offset drift, syntax errors upfront
 */

class BatchDryRunner {
  constructor(changes, fileMap) {
    this.changes = changes;      // Array of { file, startLine, endLine, replacement }
    this.fileMap = fileMap;      // Map of loaded files
    this.results = [];
    this.offsetMap = new Map();  // Track offset changes per file
  }

  /**
   * Run dry-run on all changes, report conflicts
   */
  async runDryRun() {
    const startTime = Date.now();

    for (let i = 0; i < this.changes.length; i++) {
      const change = this.changes[i];
      const result = this._validateChange(change, i);
      this.results.push(result);
    }

    const summary = this._generateSummary();
    const duration = Date.now() - startTime;

    return {
      success: summary.invalid === 0,
      summary: {
        ...summary,
        estimatedDuration: duration
      },
      results: this.results,
      conflicts: this._detectConflicts(),
      suggestions: this._generateSuggestions()
    };
  }

  /**
   * Validate single change without modifying file
   */
  _validateChange(change, changeId) {
    const { file, startLine, endLine, replacement } = change;

    if (!this.fileMap.has(file)) {
      return {
        changeId,
        file,
        status: 'invalid',
        error: `File not found: ${file}`
      };
    }

    const fileContent = this.fileMap.get(file);
    const lines = fileContent.split('\n');

    // Check offset validity
    if (startLine < 1 || endLine > lines.length) {
      return {
        changeId,
        file,
        status: 'invalid',
        error: `Line range invalid: ${startLine}-${endLine} (file has ${lines.length} lines)`,
        suggestion: `Try adjusting range to 1-${lines.length}`
      };
    }

    // Simulate replacement
    const beforeLines = lines.slice(0, startLine - 1);
    const afterLines = lines.slice(endLine);
    const replacementLines = replacement.split('\n');
    const newContent = [...beforeLines, ...replacementLines, ...afterLines].join('\n');

    // Try to parse to catch syntax errors
    try {
      const parser = require('../../lib/swcAst');
      parser.parseModule(newContent);
    } catch (err) {
      return {
        changeId,
        file,
        status: 'invalid',
        error: `Syntax error after replacement: ${err.message}`,
        recovery: {
          suggestion: 'Check replacement snippet for syntax'
        }
      };
    }

    // Track offset impact for subsequent changes in same file
    const linesDelta = replacementLines.length - (endLine - startLine + 1);
    if (!this.offsetMap.has(file)) {
      this.offsetMap.set(file, 0);
    }
    this.offsetMap.set(file, this.offsetMap.get(file) + linesDelta);

    return {
      changeId,
      file,
      status: 'valid',
      preview: newContent.slice(0, 240) + (newContent.length > 240 ? '...' : ''),
      linesDelta,
      offsetImpact: linesDelta > 0 ? `+${linesDelta} lines` : `${linesDelta} lines`
    };
  }

  /**
   * Detect conflicts between changes in same file
   */
  _detectConflicts() {
    const fileChanges = new Map();

    for (const change of this.changes) {
      if (!fileChanges.has(change.file)) {
        fileChanges.set(change.file, []);
      }
      fileChanges.get(change.file).push(change);
    }

    const conflicts = [];

    for (const [file, changes] of fileChanges.entries()) {
      // Check for overlapping ranges
      for (let i = 0; i < changes.length; i++) {
        for (let j = i + 1; j < changes.length; j++) {
          const a = changes[i];
          const b = changes[j];

          // Check if ranges overlap
          if (!(a.endLine < b.startLine || b.endLine < a.startLine)) {
            conflicts.push({
              changeIds: [i, j],
              file,
              error: `Overlapping ranges: ${a.startLine}-${a.endLine} and ${b.startLine}-${b.endLine}`
            });
          }
        }
      }
    }

    return conflicts;
  }

  /**
   * Generate suggestions for fixing issues
   */
  _generateSuggestions() {
    const suggestions = [];

    // If there are offset mismatches, suggest recalculation
    if (this.results.some(r => r.status === 'invalid' && r.error.includes('Line'))) {
      suggestions.push({
        type: 'offset-recalculation',
        message: 'Some line offsets may have drifted. Try --recalculate-offsets',
        impact: 'Automatically adjusts line numbers based on content hash matching'
      });
    }

    // If there are syntax errors, suggest review
    if (this.results.some(r => r.status === 'invalid' && r.error.includes('Syntax'))) {
      suggestions.push({
        type: 'syntax-review',
        message: 'Some replacements contain syntax errors',
        impact: 'Review replacement snippets before applying'
      });
    }

    // If there are conflicts, suggest reordering
    if (this._detectConflicts().length > 0) {
      suggestions.push({
        type: 'change-ordering',
        message: 'Overlapping changes detected. Consider applying sequentially instead of atomically',
        impact: '--atomic mode may fail; try --sequential'
      });
    }

    return suggestions;
  }

  _generateSummary() {
    const total = this.results.length;
    const valid = this.results.filter(r => r.status === 'valid').length;
    const invalid = total - valid;

    return {
      total,
      valid,
      invalid,
      successRate: ((valid / total) * 100).toFixed(1) + '%'
    };
  }
}

module.exports = BatchDryRunner;
```

#### Phase 2: CLI Integration (1-2 hours)
**Modify**: `tools/dev/js-edit.js`

```javascript
// Add --dry-run and related flags:
// --dry-run                   Preview all changes
// --show-conflicts            Highlight overlapping edits
// --recalculate-offsets       Auto-fix line number drift
// --sequential                Apply changes one at a time (not atomic)
// --recovery-suggestions      Show how to fix failed changes

if (args['dry-run']) {
  const dryRunner = new BatchDryRunner(changes, loadedFiles);
  const result = await dryRunner.runDryRun();
  
  if (!result.success) {
    fmt.warning(`Dry-run detected ${result.summary.invalid} issues:`);
    result.results
      .filter(r => r.status === 'invalid')
      .forEach(r => {
        console.log(`  [Change ${r.changeId}] ${r.file}: ${r.error}`);
        if (r.suggestion) console.log(`    Suggestion: ${r.suggestion}`);
      });
  }
  
  outputJson(result);
  process.exit(result.success ? 0 : 1);
}
```

#### Phase 3: Recovery System (1-2 hours)
```javascript
// When a batch partially fails, provide recovery:

class BatchRecovery {
  static async suggestRecovery(failedResults) {
    // For each failure, suggest:
    // 1. Skip this change (and continue with others)
    // 2. Adjust line numbers automatically
    // 3. Apply this change separately/manually
    
    return failedResults.map(result => ({
      changeId: result.changeId,
      options: [
        { action: 'skip', rationale: 'Continue without this change' },
        { action: 'adjust', rationale: 'Auto-fix line numbers and retry' },
        { action: 'separate', rationale: 'Apply this change in isolation' }
      ]
    }));
  }
}
```

### Gap 3 Impact: Concrete Example

**Before** (current - 15-20 minutes per failure):
```bash
node js-edit.js --changes batch.json --atomic --fix

# Error: "Batch failed. 1 of 5 changes could not be applied."
# Agent must:
# 1. Manually inspect batch.json
# 2. Read each file to find line numbers
# 3. Guess which change failed
# 4. Manually fix line numbers
# 5. Retry

# Time: 15-20 minutes
```

**After** (with Gap 3 fix - 2-3 minutes):
```bash
node js-edit.js --changes batch.json --dry-run --show-conflicts --json

# Returns:
{
  "summary": { "total": 5, "valid": 4, "invalid": 1 },
  "results": [
    { "changeId": 3, "status": "invalid", "error": "Line 50 is now 46" }
  ],
  "suggestions": [
    { "type": "offset-recalculation", "message": "Try --recalculate-offsets" }
  ]
}

# Agent runs:
node js-edit.js --changes batch.json --recalculate-offsets --fix

# Done. Time: <1 minute
```

---

## Plans Integration: Embedding Plans in Agent Workflows (2-3 hours)

### Current State

Plans exist but aren't integrated into agent decision-making:

```bash
# Agent creates a plan (good):
node js-edit.js --file src/app.js --locate "exports.foo" --emit-plan tmp/plan.json

# Plan contains guards. But agent must:
# 1. Read the plan
# 2. Manually extract hash/span values
# 3. Pass them to next command

# Time: 5 minutes overhead per operation
```

### What We Need

**Plans as First-Class Citizens in Agent Workflows**:

```bash
# Scenario 1: Discover → Context → Replace workflow

# Step 1: Locate target
node js-edit.js --file src/app.js --locate "exports.processData" \
  --emit-plan tmp/locate.json --json

# Step 2: Get context using plan automatically
node js-edit.js --from-plan tmp/locate.json --context-function --json

# Step 3: Apply replacement using plan
node js-edit.js --from-plan tmp/locate.json --with newContent.js --fix

# Agent experience: Seamless workflow, all guards automatic
# Time overhead: <10 seconds total
```

### Implementation: 2-3 Hours

#### Phase 1: Plan Format Standardization (45 min)

**Standardized Plan Structure** (already mostly done, just formalize):

```json
{
  "planId": "plan-uuid-123",
  "timestamp": "2025-11-13T10:30:00Z",
  "file": "src/app.js",
  "operation": "locate",
  "selector": "exports.processData",
  "metadata": {
    "hash": "TsFu9ZSc",
    "span": { "start": 150, "end": 250 },
    "charSpan": { "start": 145, "end": 248 },
    "pathSignature": "src/app.js#exports.processData",
    "kind": "function",
    "isAsync": false
  },
  "context": {
    "operation": "locate",
    "matchCount": 1,
    "allowMultiple": false
  }
}
```

#### Phase 2: `--from-plan` Flag (1 hour)

**Modify js-edit.js**:

```javascript
// New flag: --from-plan <path>
// Loads plan JSON and auto-populates guards

if (args['from-plan']) {
  const planFile = args['from-plan'];
  const plan = JSON.parse(fs.readFileSync(planFile, 'utf-8'));
  
  // Auto-populate derived from plan:
  args.file = args.file || plan.file;
  args['expect-hash'] = args['expect-hash'] || plan.metadata.hash;
  args['expect-span'] = args['expect-span'] || 
    `${plan.metadata.span.start}:${plan.metadata.span.end}`;
  
  // If next operation is implied, execute it:
  if (args['context-function']) {
    args.locate = plan.selector;
    // Run context operation
  }
  
  if (args.replace || args.fix) {
    args.locate = plan.selector;
    args['expect-hash'] = plan.metadata.hash;
    // Run replace operation with guards
  }
}
```

#### Phase 3: Agent Guide for Plan Workflows (1 hour)

**Create: `/docs/PLANS_IN_AGENT_WORKFLOWS.md`**

```markdown
# Using Plans in Agent Workflows

## Pattern 1: Locate → Dry-Run → Fix

Agent discovers a function, previews change, applies it:

\`\`\`bash
# 1. Locate and emit plan
node js-edit.js --file src/app.js --locate "exports.foo" \
  --emit-plan tmp/plan.json

# 2. Preview using plan (guards automatic)
node js-edit.js --from-plan tmp/plan.json \
  --with new-content.js --preview-edit --json

# 3. Apply using plan
node js-edit.js --from-plan tmp/plan.json \
  --with new-content.js --fix
\`\`\`

## Pattern 2: Batch Discover → Dry-Run → Apply

Multiple changes, all verified before applying:

\`\`\`bash
# 1. Generate batch of plans
node js-scan.js --search "processData" --json | \
  jq '.results | map({file, hash})' > targets.json

# 2. Dry-run all changes
node js-edit.js --batch-from-plans targets.json \
  --dry-run --show-conflicts --json

# 3. Apply all atomically
node js-edit.js --batch-from-plans targets.json --fix
\`\`\`

## Pattern 3: Recipe with Plans

Multi-step workflow using plans:

\`\`\`bash
node js-edit.js --recipe refactor.json --emit-plans tmp/recipe-plans/ --fix
\`\`\`

Recipe returns plans from each step so agent can replay/verify.
```

---

## Integration Summary: How These Fit Together

### Gap 2 + Gap 3 + Plans = Powerful Agent Workflows

**Time Breakdown (Before vs. After)**:

| Task | Before | After | Savings |
|------|--------|-------|---------|
| Discover related code | 15-25 min | 3-5 min | 80% |
| Prepare batch changes | 10-15 min | 3-5 min | 70% |
| Dry-run batch | Manual check 10-15 min | Automated 30 sec | 95% |
| Fix failures | 15-20 min | Auto-recover 1-2 min | 90% |
| **Total per refactor** | **50-75 min** | **10-20 min** | **75-80%** |

### Concrete Workflow Example: "Rename function globally"

**Current (75 minutes)**:
```
1. Search for "processData" usage → 3 min
2. Manually identify callers → 8 min
3. Create batch edits → 10 min
4. Apply batch → 3 min fails
5. Debug failures → 15 min
6. Fix offsets manually → 10 min
7. Retry → 5 min
8. Verify no regressions → 20 min
Total: 74 minutes
```

**After improvements (12 minutes)**:
```
1. Query: "what-calls processData" → <1 min
2. Get all callers semantically → <1 min
3. Locate all targets with plans → 2 min
4. Batch dry-run → 30 sec
5. Batch apply with auto-recovery → 2 min
6. Verify (from plan guards) → <1 min
Total: 6-8 minutes + 4 min safety verification = 12 minutes
```

---

## Implementation Roadmap

### Week 1: Gap 2 (Relationship Queries)
- Mon: Build RelationshipAnalyzer class
- Tue-Wed: CLI integration (`--what-imports`, `--what-calls`, etc.)
- Thu: Tests + documentation
- Fri: Demo + integrate with ripple analysis

**Deliverable**: Agents can ask "what imports this?" in <1 minute

### Week 2: Gap 3 (Batch Dry-Run)
- Mon: Build BatchDryRunner class
- Tue: CLI integration (`--dry-run`, `--show-conflicts`)
- Wed: Recovery system
- Thu-Fri: Tests + documentation

**Deliverable**: Agents can preview batch changes upfront, catch errors before applying

### Week 3: Plans Integration
- Mon: Plan format standardization
- Tue: `--from-plan` flag implementation
- Wed: Agent workflow documentation
- Thu-Fri: Examples + testing

**Deliverable**: Agent workflows are streamlined; plans are first-class

---

## Success Metrics

### Gap 2 (Relationship Queries)
- **Before**: 25-30 min discovery per refactor
- **After**: 5-8 min
- **Metric**: Track time from "need to understand relationships" to "ready to plan changes"

### Gap 3 (Batch Dry-Run)
- **Before**: 40% batch failure rate, 15-20 min recovery per failure
- **After**: <5% failure rate, <2 min recovery
- **Metric**: Track batch operation success rate + recovery time

### Plans Integration
- **Before**: 5 min overhead per plan-driven workflow
- **After**: <30 sec overhead
- **Metric**: Track time from plan emission to final verification

### Combined Annual Impact
- **Before**: 650+ hours wasted on discovery/refactoring
- **After**: 150-200 hours (70% reduction)
- **Net Savings**: 450-500 hours annually for 4-6 agent team

---

## Risk Assessment

### Low Risk
- **Relationship queries**: Read-only operations, no file modifications
- **Dry-run**: Non-destructive preview, all existing functionality unchanged
- **Plans**: Already partially implemented, just standardizing + integrating

### Medium Risk
- **Recovery system**: New complexity, but with fallback to skip/manual modes
- **Integration**: Must ensure plans work correctly with all operations

### Testing Strategy
1. Unit tests for each analyzer/dry-runner class
2. Integration tests for CLI flags
3. End-to-end tests with real agent workflows
4. Performance benchmarks for relationship queries

---

## Why This Approach?

1. **Respects existing strengths**:
   - Repeated analysis avoids drift ✓
   - Dry-run prevents silent failures ✓
   - Plans already exist, just need integration ✓

2. **Fixes critical gaps**:
   - Relationship queries (Gap 2) enable efficient discovery
   - Batch dry-run (Gap 3) enables safe refactoring
   - Plans integration reduces overhead

3. **Minimal disruption**:
   - All changes are additive (new flags, new operations)
   - Backward compatible
   - Can roll out incrementally

4. **High ROI**:
   - 10-14 hours implementation
   - 450-500 hours annual savings
   - 30:1 ROI minimum

---

_Ready for team review and implementation scheduling._
