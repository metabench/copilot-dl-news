# Strategic Enhancements for Agent Code Modification Tooling

**Analysis Date**: November 13, 2025  
**Scope**: Identifying high-impact features for focused, accurate agent code changes  
**Status**: Strategic recommendations (ready for prioritization)

---

## Executive Summary

The current tooling (`js-scan`, `js-edit`, `md-scan`, `md-edit`) provides **excellent discovery and editing capabilities**, but we can enable agents to make **faster, more focused changes** with 5-6 strategic enhancements that require minimal implementation effort relative to their impact.

**Key Insight**: Most improvements involve **adding output metadata** (what exists) rather than new parsing logic.

---

## Current Tooling Strengths

✅ **js-scan**: Multi-file discovery with 19+ filtering options  
✅ **js-edit**: Precise AST-based editing with guards and dry-run  
✅ **md-scan**: Markdown section discovery  
✅ **md-edit**: Markdown section replacement  
✅ **Token System**: Compact continuation tokens for multi-step workflows  
✅ **Bilingual Support**: Chinese aliases and auto-detection  
✅ **Batch Operations**: Infrastructure exists for multi-file changes  

---

## Top 5 Strategic Enhancements (High Impact, Low Effort)

### 1. **Hash Index for Direct Function Access** 🎯
**Problem**: Agents must first discover → then reference. Could be more direct.

**Current Flow**:
```bash
# Step 1: Discover
node js-scan.js --search myFunction --json > results.json
# Returns: hash=abc123, location=src/app.js:line 42

# Step 2: Reference (requires 2 lookups)
node js-edit.js --file src/app.js --locate --select hash:abc123
```

**Proposed Solution**: Add `--hash-index` flag to js-scan
```bash
# Step 1 + 2 Combined: Pre-computed hash index
node js-scan.js --build-hash-index --output hashes.json
# Returns: { "abc123": { file, line, kind, name }, ... }
# Reuse daily (1 hour TTL cache in tmp/.ai-cache/hash-index-YYYY-MM-DD.json)

# Step 2: Direct access (NO discovery needed)
node js-edit.js --file src/app.js --hash abc123
# or via cache
node js-edit.js --use-hash-cache --hash abc123  # lookup from cache
```

**Implementation**:
- Add `--build-hash-index` to js-scan (outputs JSON map)
- Add `--use-hash-cache` and `--hash <value>` to js-edit
- Cache in tmp/.ai-cache/hash-index-*.json (1 hour TTL)
- Fallback to old flow if cache misses

**Impact**: ⚡ **Eliminates discovery step** for known hashes  
**Effort**: 🟢 **Low** - reuse existing hash computation, add caching layer  
**Agent Benefit**: Direct editing via hash without search

---

### 2. **Edit Plan Validation Before Execution** 📋
**Problem**: Agents can't pre-validate edits without executing them. Guard plans exist but aren't integrated into the edit flow.

**Current State**:
- `--emit-plan` shows plan
- `--expect-hash` guards after execution
- No "validate, then edit" workflow

**Proposed Solution**: Add `--validate-plan` + `--apply-validated-plan`
```bash
# Step 1: Validate without touching disk
node js-edit.js --file src/app.js \
  --replace myFunction \
  --with-code "new code..." \
  --validate-plan \
  --json > plan.json
# Returns: { status: "valid", guards: { hash: "...", span: "..." }, ... }

# Step 2: Apply only if validation passed
if (plan.json.status == "valid") {
  node js-edit.js --file src/app.js \
    --replace myFunction \
    --with-code "new code..." \
    --apply-validated-plan plan.json \
    --fix
}
```

**Implementation**:
- Parse args, compute hash/span, but don't write
- Return validation result with computed guards
- Option `--apply-validated-plan <file>` to read pre-computed guards
- Compares computed vs. stored, proceeds only if match

**Impact**: ⚡ **Multi-step safety** - validate then execute  
**Effort**: 🟢 **Low** - extract existing guard computation into separate function  
**Agent Benefit**: Fail-safe edit workflow, detect conflicts before touching files

---

### 3. **Batch Context for Multi-file Changes** 🔗
**Problem**: Multi-file edits require separate `js-edit` invocations. No way to batch-load context.

**Current State**:
```bash
# 3 separate calls - lots of parsing overhead
node js-edit.js --file src/a.js --locate myFunc --json
node js-edit.js --file src/b.js --locate myFunc --json
node js-edit.js --file src/c.js --extract myFunc --json
```

**Proposed Solution**: Add `--batch-mode` + input file list
```bash
# Single call, batch processing
cat > batch.json <<EOF
[
  { file: "src/a.js", op: "locate", selector: "myFunc" },
  { file: "src/b.js", op: "locate", selector: "myFunc" },
  { file: "src/c.js", op: "extract", selector: "myFunc" }
]
EOF

node js-edit.js --batch-mode batch.json --json
# Returns:
# [
#   { file: "src/a.js", result: {...} },
#   { file: "src/b.js", result: {...} },
#   { file: "src/c.js", result: {...} }
# ]
```

**Implementation**:
- New input format: JSON array with `{ file, op, selector, args }`
- Parse each file once, execute multiple operations
- Batch output in same array order
- Dramatically reduces CLI overhead (3 calls → 1)

**Impact**: ⚡ **5-10x faster** multi-file analysis  
**Effort**: 🟢 **Low** - wrap existing operations in loop  
**Agent Benefit**: Quick context gathering for multi-file refactors

---

### 4. **Dependency Graph Export for Planning** 🗺️
**Problem**: Agents can analyze dependencies but can't export the full graph for planning.

**Current State**:
```bash
# Shows deps but no machine-readable export
node js-scan.js --deps-of src/app.js --json
```

**Proposed Solution**: Add `--emit-dependency-graph` flag
```bash
# Export full dependency graph as structured data
node js-scan.js --dir src \
  --emit-dependency-graph graph.json \
  --include-external-links  # Include node_modules refs
# Returns:
# {
#   "src/app.js": {
#     imports: ["./utils.js", "../db/index.js"],
#     exportedSymbols: ["handler", "middleware"],
#     dependents: ["src/server.js", "tests/app.test.js"]
#   },
#   ...
# }

# Then agents can use for impact analysis
node -e "
  const graph = require('./graph.json');
  const impacted = graph['src/app.js'].dependents;
  console.log('Files to retest:', impacted);
"
```

**Implementation**:
- Walk AST, collect import/export edges
- Build bidirectional graph structure
- Emit as JSON (nodes + edges)
- Optional: emit as DOT format for visualization

**Impact**: ⚡ **Enables impact analysis** without separate tool  
**Effort**: 🟢 **Low** - use existing dependency analysis, structure output  
**Agent Benefit**: Plan refactors without blind spots

---

### 5. **Selector Suggestions for Ambiguous Matches** 💡
**Problem**: Agents hit "multiple matches" and can't easily disambiguate without trial-and-error.

**Current State**:
```bash
node js-edit.js --file src/app.js --locate myFunc
# Error: Multiple matches found (5 total)
# Suggestion: Use --select 1 or --select 2 or ... (no detail)
```

**Proposed Solution**: Add `--suggest-selectors` flag
```bash
node js-edit.js --file src/app.js --locate myFunc --suggest-selectors --json
# Returns:
# {
#   status: "multiple_matches",
#   matches: [
#     { index: 1, name: "myFunc", kind: "function", line: 42, context: "exports.myFunc = ..." },
#     { index: 2, name: "myFunc", kind: "method", line: 128, context: "class Utils { myFunc(...) }" },
#     { index: 3, name: "myFunc", kind: "arrow", line: 200, context: "const myFunc = () => ..." }
#   ],
#   selectors: [
#     "name:/exports/myFunc (exported function at line 42)",
#     "path:/class/method/myFunc (class method at line 128)",
#     "path:/const/arrow/myFunc (arrow function at line 200)"
#   ]
# }
```

**Implementation**:
- Collect all matches
- For each: compute canonical selector (path/name/hash)
- Include snippet context
- Return with helpful descriptions

**Impact**: ⚡ **Eliminates trial-and-error** on ambiguous matches  
**Effort**: 🟢 **Low** - format existing match data with suggestions  
**Agent Benefit**: Clear path forward on ambiguity

---

### 6. **Change Summary Report for Verification** ✅
**Problem**: After multi-step edits, agents can't easily verify what changed across the codebase.

**Current State**:
- Individual edits work fine
- No aggregate reporting
- Agents must manually verify each file

**Proposed Solution**: Add `--emit-change-summary` to js-edit
```bash
# Track all edits in session
node js-edit.js --file src/a.js --replace funcA --with-code "..." --fix --emit-change-id a1
node js-edit.js --file src/b.js --replace funcB --with-code "..." --fix --emit-change-id b1
node js-edit.js --file src/c.js --replace funcC --with-code "..." --fix --emit-change-id c1

# Generate summary
node js-edit.js --emit-change-summary --include-changes a1,b1,c1 --output summary.json
# Returns:
# {
#   timestamp: "2025-11-13T...",
#   changes: [
#     { id: "a1", file: "src/a.js", operation: "replace", symbol: "funcA", status: "success" },
#     { id: "b1", file: "src/b.js", operation: "replace", symbol: "funcB", status: "success" },
#     { id: "c1", file: "src/c.js", operation: "replace", symbol: "funcC", status: "success" }
#   ],
#   filesModified: 3,
#   totalSymbols: 3,
#   rollbackScript: "... script to undo all changes ..."
# }
```

**Implementation**:
- Store change metadata in tmp/.ai-cache/changes-session-*.json
- Generate summary from stored metadata
- Include rollback hints for each change

**Impact**: ⚡ **Audit trail** + **rollback capability**  
**Effort**: 🟢 **Low** - just structure existing change data  
**Agent Benefit**: Verification and safety net

---

## Additional High-Value Ideas (Medium Effort)

### 7. **Interactive Mode for Real-time Feedback** 🎮
Agents could use stdin/stdout for interactive workflows instead of file-based roundtrips.

```bash
# Current: 3 file I/O ops (write, read, parse)
# Proposed: Direct JSON streaming (1 TCP-like channel)
echo '{"op":"locate", "file":"src/app.js", "selector":"myFunc"}' | \
  node js-edit.js --interactive --json
# Returns immediately with result on stdout
```

**Effort**: 🟡 **Medium** - new stream processing loop  
**Impact**: ⚡ Real-time REPL-like workflows  

### 8. **Rename Tracking Across Files** 🔄
When renaming a symbol, automatically track which dependent files need updates.

```bash
node js-edit.js --file src/app.js --rename oldName newName \
  --track-dependents \
  --output rename-plan.json
# Returns files that import the renamed symbol
```

**Effort**: 🟡 **Medium** - cross-file dependency resolution  
**Impact**: ⚡ Safe refactoring without manual hunting  

### 9. **Template-based Code Generation** 📝
Pre-built snippets for common patterns (error handlers, middleware, getters/setters).

```bash
node js-edit.js --file src/app.js \
  --insert-template error-handler \
  --after functionName \
  --with-values message="Custom error" \
  --dry-run
```

**Effort**: 🟡 **Medium** - template system + variable substitution  
**Impact**: ⚡ Faster scaffolding for agents  

### 10. **Test Impact Analysis** 🧪
Automatically suggest which tests might be affected by a code change.

```bash
node js-edit.js --file src/app.js --replace myFunc \
  --suggest-test-impact \
  --json
# Returns: tests that import or reference the modified function
```

**Effort**: 🟡 **Medium** - test file scanning + symbol matching  
**Impact**: ⚡ Faster test selection for validation  

---

## Documentation Improvements (Low Effort, High Value)

### 1. **Selector Quick Reference Card**
```markdown
# Selector Patterns (Copy-Paste Ready)

| Goal | Selector | Example |
|------|----------|---------|
| Exact function name | `name:/exact` | `--locate "name:/processData"` |
| Exported function | `name:/exports/funcName` | `--locate "name:/exports/handler"` |
| Class method | `path:/class/methodName` | `--locate "path:/UserService/validate"` |
| Arrow function | `path:/const/arrow/name` | `--locate "path:/const/arrow/mapper"` |
| Anonym function | `hash:abc123` | `--locate hash:abc123` |

Just give agents a reference card - reduces guessing 50%.
```

### 2. **Common Workflows Library**
Pre-written agent workflows for typical tasks:

```markdown
# Workflow: Rename a Function Across Files

1. Scan for usage:
   node js-scan.js --search oldFuncName --json > usage.json

2. Check each file for context:
   for file in $(cat usage.json | jq -r '.matches[].file'):
     node js-edit.js --file $file --list-functions --match oldFuncName

3. Rename in each file with guards:
   node js-edit.js --file src/app.js --rename oldFuncName newFuncName \
     --expect-hash <computed-from-step-2>

4. Verify tests still pass:
   npm run test:by-path tests/**/*
```

### 3. **Error Recovery Guide**
Document what to do when tools fail:

```markdown
# Error: "Multiple matches found"
→ Use --suggest-selectors to disambiguate
→ Use --select with index or hash

# Error: "Hash mismatch"
→ Code changed since discovery step
→ Re-run discovery to get fresh hash
→ Use --force to override (dangerous)

# Error: "No matches found"
→ Check --suggest-selectors output (shows close matches)
→ Try with --match-pattern (glob-style matching)
→ Check file is being scanned (verify --include/--exclude rules)
```

---

## Implementation Priority Matrix

| # | Feature | Impact | Effort | Priority | Est. Time |
|---|---------|--------|--------|----------|-----------|
| 1 | Hash Index | ⭐⭐⭐ | 🟢 Low | **CRITICAL** | 2h |
| 2 | Plan Validation | ⭐⭐⭐ | 🟢 Low | **CRITICAL** | 2h |
| 3 | Batch Context | ⭐⭐⭐ | 🟢 Low | **HIGH** | 3h |
| 5 | Selector Suggestions | ⭐⭐ | 🟢 Low | **HIGH** | 1h |
| 4 | Dep Graph Export | ⭐⭐ | 🟢 Low | **MEDIUM** | 2h |
| 6 | Change Summary | ⭐⭐ | 🟢 Low | **MEDIUM** | 1.5h |
| Docs | Quick Ref Card | ⭐⭐⭐ | 🟢 Low | **HIGH** | 0.5h |
| Docs | Workflows | ⭐⭐ | 🟢 Low | **MEDIUM** | 1h |
| 7 | Interactive Mode | ⭐⭐ | 🟡 Med | **LOW** | 4h |
| 8 | Rename Tracking | ⭐ | 🟡 Med | **LOW** | 3h |
| 9 | Templates | ⭐ | 🟡 Med | **LOW** | 4h |
| 10 | Test Impact | ⭐⭐ | 🟡 Med | **LOW** | 3h |

---

## Quick-Win Implementations (Start Here)

### Phase 1: Ultra-Quick (Next 1-2 Hours)
These add major value with minimal code:

**1a. Selector Quick Reference**  
- Create `tools/dev/SELECTOR_REFERENCE.md` (250 words)
- Copy-paste examples for all selector types
- Link from AGENTS.md

**1b. Error Recovery Guide**  
- Create `docs/CLI_ERROR_RECOVERY.md`
- Document 10 common errors + fixes
- Link from CLI_TOOL_TESTING_GUIDE.md

### Phase 2: Strategic Features (2-4 Hours Each)
Pick 2-3 for maximum impact:

**2a. Hash Index for Quick Access**
- Implement `--build-hash-index` in js-scan
- Add `--use-hash-cache` to js-edit
- Cache in tmp/.ai-cache/ with TTL
- Test with existing tests + new smoke test

**2b. Plan Validation**
- Extract guard computation into separate function
- Add `--validate-plan` (parse, compute, return as JSON)
- Add `--apply-validated-plan <file>` (verify then execute)
- 80% of implementation is extracting existing code

**2c. Batch Context**
- New flag `--batch-mode <file.json>`
- Loop over entries, reuse existing operation dispatch
- Return results in array format
- Test with js-scan + js-edit batch operations

---

## Agent Usability Impact

After implementing Phase 1 + 2a + 2b:

**Before**:
```
Discover function → Get hash → Locate in file → Extract → 
Edit → Verify → (manual verification of changes)
= 6+ steps, multiple file I/O
```

**After**:
```
Direct via hash → Validate → Apply → (audit trail with rollback)
= 3 steps, cached hash index eliminates discovery
```

**Expected Improvements**:
- ⚡ **50% faster** multi-file analysis (batch mode)
- ⚡ **Elimination** of discovery overhead (hash index)
- ⚡ **100% safer** edits (plan validation)
- ⚡ **Audit trail** for verification (change summary)

---

## Proof of Concept: Simple Example

**Goal**: Change "fetchUser" function signature across 3 files

**New Workflow** (with enhancements):
```bash
# 1. Build hash index once
node js-scan.js --build-hash-index --output hashes.json

# 2. Find all files with fetchUser
node js-scan.js --search fetchUser --json | jq '.matches[].file' > files.txt

# 3. Batch extract context (single call!)
cat > batch.json <<EOF
[
  { "file": "src/models/user.js", "op": "extract", "selector": "fetchUser" },
  { "file": "src/services/auth.js", "op": "extract", "selector": "fetchUser" },
  { "file": "src/api/handlers.js", "op": "extract", "selector": "fetchUser" }
]
EOF
node js-edit.js --batch-mode batch.json --json > contexts.json

# 4. For each file, validate then apply change
for file in $(cat files.txt); do
  # Validate plan first
  node js-edit.js --file $file \
    --replace fetchUser \
    --with-file new-fetch-user.js \
    --validate-plan --json > plan.json
  
  # Check plan is valid
  if [ $(jq -r '.status' plan.json) = "valid" ]; then
    # Apply safely
    node js-edit.js --file $file \
      --replace fetchUser \
      --with-file new-fetch-user.js \
      --apply-validated-plan plan.json \
      --fix
  fi
done

# 5. Verify changes
npm run test:by-path tests/**/*.test.js
```

**Result**: Safe, auditable, fast refactor across multiple files.

---

## Recommendations for Immediate Action

1. ✅ **Create SELECTOR_REFERENCE.md** (30 min) - huge readability win
2. ✅ **Add hash index caching** (2 hours) - biggest usability gain
3. ✅ **Implement plan validation** (2 hours) - most important safety feature
4. ✅ **Add batch context mode** (3 hours) - performance multiplier
5. ✅ **Document common workflows** (1 hour) - practical agent patterns

---

## Questions for Your Consideration

1. **Hash Index**: Should we auto-generate on startup, or on-demand? (Suggest: on-demand with 1-hour cache)
2. **Batch Mode**: New flag or separate subcommand? (Suggest: `--batch-mode` flag for consistency)
3. **Plan Validation**: Should failures return suggestions for fixes? (Suggest: Yes, include diagnostics)
4. **Priority**: Which 2-3 features would have the most immediate impact for your agents?

---

**Status**: Ready for review and prioritization  
**Next Steps**: Confirm priority, assign effort, track in GitHub Issues
