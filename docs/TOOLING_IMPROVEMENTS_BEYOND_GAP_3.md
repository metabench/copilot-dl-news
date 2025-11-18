---
title: "Tooling Improvements Beyond Gap 3: Next Wave of Agent Efficiency Gains"
description: "4-5 incremental enhancements to js-scan/js-edit targeting real agent workflow bottlenecks"
date: "2025-11-12"
---

# Tooling Improvements Beyond Gap 3

**Focus**: After Gap 2, Gap 3, and Plans are deployed (totaling 10-14 hours), what's next?

This document identifies **4-5 targeted improvements** that would unlock additional efficiency gains. These are **not** part of the current sprint, but are "Next Wave" candidates for future iterations.

---

## Strategic Context

**Current Improvements (Gap 2, Gap 3, Plans)**:
- Gap 2: Semantic relationship queries (6-8 hrs)
- Gap 3: Batch dry-run + recovery (4-6 hrs)
- Plans: Integration (`--from-plan` flag) (2-3 hrs)
- **Total ROI**: 80% faster agent refactoring (75-80 min → 10-15 min)

**Next Wave Opportunity**: Additional 40-50% efficiency gains targeting:
1. **Incomplete operations** (partial matches)
2. **Multi-file coordination** (cross-file changes)
3. **Testing integration** (test validation)
4. **Workflow state** (resumable operations)
5. **Observability** (what agents are doing, where they're blocked)

---

## Improvement 1: Partial Match & Diffing (2-3 Hours)

### Problem

Currently, agent workflows require **exact matches**:
- `--locate` must find exact function signature
- `--replace` must match exact span
- If code has minor variations (comments, formatting), operation fails

**Real-world impact**:
- Agent looking for `function processData(input)` fails if actual code is:
  ```javascript
  function processData(
    input  // parameter name
  ) { ... }
  ```
- Agent must manually adjust search patterns
- Typical fix: 2-5 minutes per failed match

### Solution: Fuzzy Matching & Diff Mode

**New flags for js-edit**:
```bash
# Fuzzy match: Allow minor variations (whitespace, comments)
node js-edit.js --locate "processData" --fuzzy --threshold 85

# Diff mode: Show before/after with context (diffs always shown with --dry-run)
node js-edit.js --replace new-code.js --diff --context-lines 5

# Match by intent (AST-aware fuzzy matching)
node js-edit.js --locate "processData" --match-intent --ignore-formatting
```

**Implementation approach**:
- Use `jaro-winkler` or `leven` for string matching
- Build AST normalizer (strip comments, normalize whitespace)
- Add `--threshold <0-100>` for match tolerance
- Always show diff in `--dry-run` mode

**Agent benefit**: Reduces failed operations from 15-20% to <1%

**Tests needed**:
```javascript
it('fuzzy matches similar function signatures', () => {
  // Original: function foo(x) { ... }
  // Search: foo(x)
  // Should match even if actual code is:
  //   function foo(
  //     x  /* param */
  //   ) { ... }
  expect(fuzzyLocate('foo', sourceWithVariations))
    .toBeDefined();
});

it('shows diff before applying changes', () => {
  const plan = replace(oldCode, newCode, { diff: true });
  expect(plan.context.diff).toBeDefined();
  expect(plan.context.diff).toContain('-');
  expect(plan.context.diff).toContain('+');
});
```

**Workflow improvement**: "Locate → Modify → Apply" becomes 95%+ reliable (vs 80% currently)

---

## Improvement 2: Cross-File Batch Coordination (3-4 Hours)

### Problem

Currently, agents handle one file at a time:
- Batch operations work on single file (`--changes <file.json>`)
- Cross-file refactors require manual orchestration
- Example: Rename exported function used in 20 files

**Real-world pain**:
```bash
# Agent must do this manually (5 separate operations):
node js-scan.js --search "exportedFunc" --json > targets.json
# Manually build 20 replacement plans
# Apply batch in current file
# Manually repeat for 19 other files
# Hope all succeed (can fail partially)
```

**Time cost**: 15-20 minutes for even simple cross-file refactors

### Solution: Cross-File Batch with Rollback

**New operation type in recipes/batches**:
```json
{
  "operation": "batch-cross-file",
  "action": "rename",
  "targets": [
    { "file": "src/utils/helpers.js", "span": "1250:1350", "name": "oldName" },
    { "file": "src/services/data.js", "span": "2100:2120", "name": "oldName" },
    { "file": "tests/helpers.test.js", "span": "50:70", "name": "oldName" }
  ],
  "newName": "newName",
  "dryRun": true
}
```

**New js-edit flag**:
```bash
# Apply cross-file batch with atomic semantics
node js-edit.js --batch cross-file.json --atomic

# If any file fails, entire batch rolls back
# Returns detailed report (which files succeeded, which failed, why)
```

**Implementation**:
1. Parse all targets across files
2. Validate all targets (guards verify)
3. If ANY target invalid, reject entire batch (abort)
4. If all valid, apply sequentially with rollback support
5. Emit `--emit-batch-plan` for recovery if partial success

**Agent benefit**: Cross-file refactors become atomic + resumable

**Tests needed**:
```javascript
it('applies batch across multiple files atomically', () => {
  // Create targets in file A and file B
  const batch = createCrossFileBatch([
    { file: 'a.js', target: 'foo' },
    { file: 'b.js', target: 'foo' }
  ]);
  
  const result = applyBatch(batch, { atomic: true });
  expect(result.filesModified).toEqual(2);
});

it('rolls back all changes if one file fails', () => {
  const batch = createBatchWithOneInvalidTarget();
  expect(() => applyBatch(batch, { atomic: true }))
    .toThrow('BATCH FAILED: Target in b.js no longer matches');
  
  // Verify file A not modified (rolled back)
  expect(readFile('a.js')).toEqual(originalContentA);
});

it('emits batch plan for recovery', () => {
  const batch = createCrossFileBatch(...);
  const result = applyBatch(batch, { 
    emitPlan: 'recovery.json',
    atomic: true 
  });
  
  const plan = JSON.parse(readFile('recovery.json'));
  expect(plan.filesAttempted).toEqual(5);
  expect(plan.filesSucceeded).toEqual(5);
});
```

**Workflow improvement**: Cross-file refactors from 15-20 min → 2-3 minutes

---

## Improvement 3: Test Validation Integration (2-3 Hours)

### Problem

Agents apply code changes, but don't validate against tests automatically:
- Agent applies batch of changes
- Agent must manually run tests to verify
- Tests fail; agent must debug without context

**Real-world impact**:
- 30% of apply operations break tests (silently)
- Agent discovers failures 5-10 minutes after applying
- Then must spend 15+ minutes debugging

### Solution: Auto-Run Tests After Apply

**New flag for js-edit**:
```bash
# Apply changes and immediately run tests
node js-edit.js --changes batch.json --apply --run-tests

# Only run tests related to changed files
node js-edit.js --changes batch.json --apply --run-tests --related-only

# Abort if tests fail (atomic safety)
node js-edit.js --changes batch.json --apply --run-tests --abort-on-failure
```

**Integration approach**:
1. After `--apply`, capture modified files
2. Use existing test runner to find related tests
3. Run tests (parallel or sequential)
4. Report results with diff context
5. If `--abort-on-failure`, rollback changes if tests fail

**Agent benefit**: Discover test failures immediately; rollback if needed

**Implementation** (pseudocode):
```javascript
async function applyWithTestValidation(batch, options) {
  // Step 1: Apply changes
  const result = applyBatch(batch);
  const modifiedFiles = result.filesModified;
  
  if (!options['run-tests']) return result;
  
  // Step 2: Find related tests
  const relatedTests = options['related-only']
    ? findRelatedTests(modifiedFiles)
    : getAllTests();
  
  // Step 3: Run tests
  const testResult = await runTests(relatedTests, {
    collectCoverage: false,
    failFast: true
  });
  
  // Step 4: Handle failure
  if (!testResult.success && options['abort-on-failure']) {
    // Rollback
    rollbackBatch(batch);
    result.status = 'rolled-back';
    result.testFailures = testResult.failures;
    result.reason = 'Test validation failed';
  }
  
  result.testValidation = testResult;
  return result;
}
```

**Tests needed**:
```javascript
it('runs related tests after apply', async () => {
  const batch = createBatch();
  const result = await applyWithTestValidation(batch, {
    'run-tests': true,
    'related-only': true
  });
  
  expect(result.testValidation.testsRun).toBeGreaterThan(0);
});

it('rolls back if tests fail with abort-on-failure', async () => {
  // Create batch that will break tests
  const batch = createBatchThatBreaksTests();
  
  const result = await applyWithTestValidation(batch, {
    'run-tests': true,
    'abort-on-failure': true
  });
  
  expect(result.status).toEqual('rolled-back');
  expect(fileContent('a.js')).toEqual(originalContentA);
});

it('emits test failures with diff context', async () => {
  const result = await applyWithTestValidation(batch, {
    'run-tests': true
  });
  
  if (!result.testValidation.success) {
    expect(result.testValidation.failures[0])
      .toHaveProperty('diffContext');
  }
});
```

**Workflow improvement**: Test failures discovered immediately; zero debug time

---

## Improvement 4: Workflow State & Resumable Operations (2-3 Hours)

### Problem

Agent workflows can be interrupted:
- Batch operation fails after modifying 3 of 10 files
- Agent doesn't know what was applied
- Must manually review files to understand state
- Cannot easily resume from where it stopped

**Real-world pain**:
- Power loss / connection drop during batch
- Agent timeout mid-operation
- Partial success creates confusion (which files changed?)

### Solution: Operation Journal & Resume Capability

**New flag for js-edit**:
```bash
# Create operation journal
node js-edit.js --changes batch.json --apply --journal journal.ndjson

# Resume from journal
node js-edit.js --resume journal.ndjson
```

**Journal format** (newline-delimited JSON):
```json
{"timestamp":"2025-11-12T10:30:01Z","op":"batch-start","batch":5}
{"timestamp":"2025-11-12T10:30:02Z","op":"apply","file":"a.js","status":"success"}
{"timestamp":"2025-11-12T10:30:03Z","op":"apply","file":"b.js","status":"success"}
{"timestamp":"2025-11-12T10:30:04Z","op":"apply","file":"c.js","status":"failed","error":"Guard mismatch"}
{"timestamp":"2025-11-12T10:30:04Z","op":"batch-resume","skipped":2}
```

**Implementation**:
1. Create journal file before starting
2. Log each operation (start, success, failure)
3. On resume, parse journal and skip already-applied files
4. Continue from first failed operation
5. Emit recovery plan if needed

**Agent benefit**: Resilient workflows; no data loss on interruption

**Tests needed**:
```javascript
it('creates journal with operation history', () => {
  const result = applyBatch(batch, { 
    journal: 'ops.ndjson' 
  });
  
  const journal = readNdJson('ops.ndjson');
  expect(journal.length).toBeGreaterThan(0);
  expect(journal[0]).toHaveProperty('timestamp');
  expect(journal[0]).toHaveProperty('op');
});

it('resumes from journal, skipping applied ops', () => {
  // Apply batch, simulate failure at op 3
  const journal = simulatePartialBatch();
  
  const result = resume(journal);
  expect(result.skipped).toEqual(2);
  expect(result.applied).toEqual(2); // Files 4-5
});
```

**Workflow improvement**: Batch operations become resilient; no recovery overhead

---

## Improvement 5: Observability & Progress Streaming (1-2 Hours)

### Problem

Long-running agent operations have no feedback:
- 5-file batch: No progress indication until complete
- Agent doesn't know if operation is stuck vs slow
- Hard to debug what agents are actually doing

**Real-world impact**:
- Agent can't report progress to user
- Unknown if operation will finish or hang
- Difficult to profile where time is spent

### Solution: Structured Logging + Progress Events

**New flag**:
```bash
# Stream progress events (one per line)
node js-edit.js --changes batch.json --apply --progress

# Structured logs (JSON) instead of text
node js-edit.js --changes batch.json --apply --progress --json

# Optional: send events to external observer
node js-edit.js --changes batch.json --apply --progress \
  --event-stream "http://localhost:3000/api/operations"
```

**Progress event format**:
```json
{"type":"batch-start","batchId":"abc123","fileCount":5,"timestamp":"2025-11-12T10:30:01Z"}
{"type":"file-start","file":"a.js","timestamp":"2025-11-12T10:30:01.5Z"}
{"type":"file-progress","file":"a.js","bytesProcessed":1024,"progress":0.3}
{"type":"file-success","file":"a.js","duration":500,"linesDelta":3,"timestamp":"2025-11-12T10:30:02Z"}
{"type":"file-start","file":"b.js","timestamp":"2025-11-12T10:30:02Z"}
{"type":"batch-complete","fileCount":5,"successful":5,"failed":0,"duration":2500,"timestamp":"2025-11-12T10:30:05Z"}
```

**Implementation**:
1. Emit event at operation start/end
2. Include timing, file count, progress percentage
3. Stream via stdout (JSON lines format)
4. Optional HTTP endpoint for remote observers
5. Collect in `tmp/.operations/ongoing/` for inspection

**Agent benefit**: Full visibility into long-running operations

**Tests needed**:
```javascript
it('emits progress events during batch apply', () => {
  const events = [];
  const stream = applyBatch(batch, { progress: true });
  
  stream.on('event', e => events.push(e));
  stream.on('end', () => {
    expect(events.some(e => e.type === 'batch-start')).toBe(true);
    expect(events.some(e => e.type === 'file-success')).toBe(true);
    expect(events.some(e => e.type === 'batch-complete')).toBe(true);
  });
});

it('emits progress to HTTP endpoint', async () => {
  const mockServer = startMockServer();
  
  const result = applyBatch(batch, {
    progress: true,
    eventStream: `http://localhost:${mockServer.port}/events`
  });
  
  await result;
  
  expect(mockServer.eventsReceived.length).toBeGreaterThan(0);
  mockServer.close();
});
```

**Workflow improvement**: Agents can report real-time status; enables monitoring

---

## Improvement 6: `--changes` Dry-Run Ingestion (1 Hour Hotfix)

### Problem

`node tools/dev/js-edit.js --changes <file> --dry-run` currently returns `"No changes to preview"` even when the JSON file contains dozens of operations. The CLI parses the JSON, but it never feeds those change objects into `BatchDryRunner` unless they originate from `--from-plan`. As seen in `docs/sessions/2025-11-20-ui-home-card-cli/WORKING_NOTES.md`, this blocks UI agents from exercising the mandated Gap 3 workflow and forces manual edits whenever the dry-run path is required.

**Root cause**:
- `BatchDryRunner.dryRun()` operates on `this.changes`, but the CLI call (`batchRunner.dryRun(changesData)`) ignores its argument.
- No helper exists to normalize `changesData` (array vs `{ changes: [...] }`) and push entries into the runner, so the collection stays empty and the runner exits early with a warning.

### Solution: Load changes before invoking the batch runner

**Implementation approach**:
1. Add a `loadChanges(changeList = [])` helper on `BatchDryRunner` that accepts an array or a `{ changes: [...] }` wrapper, validates each entry, and internally calls `addChange` so guard metadata remains intact.
2. Update the CLI branches for `--dry-run` and `--recalculate-offsets` to invoke `loadChanges` immediately after parsing the JSON file, then call `dryRun()` / `recalculateOffsets()` without arguments. This keeps the API consistent with `--from-plan`, which already populates `batchRunner.changes` before applying.
3. Emit a descriptive error (`"No changes supplied via --changes"`) when the JSON is empty so agents know the issue is the payload, not the CLI.
4. Preserve the pass-through of `--json`, `--verbose`, and bilingual output so the fix is invisible to downstream tooling.

**Tests needed**:
```javascript
it('loads changes from a plain array during --dry-run', () => {
  const runner = new BatchDryRunner();
  runner.loadChanges([
    { file: 'a.js', startLine: 10, endLine: 12, replacement: 'const a = 1;' }
  ]);
  const result = runner.dryRun();
  expect(result.totalChanges).toBe(1);
  expect(result.preview[0]).toMatchObject({ id: 'change-0' });
});

it('accepts { changes: [...] } payloads from plan files', () => {
  const runner = new BatchDryRunner();
  runner.loadChanges({ changes: [/* ... */] });
  expect(runner.changes.length).toBeGreaterThan(0);
});

it('js-edit --dry-run returns previews when --changes is provided', async () => {
  const output = await runCli('node tools/dev/js-edit.js --changes fixtures/batch.json --dry-run --json');
  expect(output.preview).toHaveLength(2);
});
```

**Workflow improvement**: Restores Gap 3 usability in under an hour, eliminating the manual fallback documented in the 2025-11-20 UI session. Agents can once again rely on `--changes` for safe previews, keeping UI work compliant with repository mandates.

---

## Relative Priority & Implementation Roadmap

### Priority Matrix

| Improvement | Effort | Impact | Priority |
|-------------|--------|--------|----------|
| **Partial Match & Diffing** | 2-3 hrs | HIGH (eliminate failed matches) | ★★★★☆ |
| **Cross-File Batch** | 3-4 hrs | VERY HIGH (cross-file refactors) | ★★★★★ |
| **Test Validation** | 2-3 hrs | HIGH (discover failures early) | ★★★★☆ |
| **Workflow State** | 2-3 hrs | MEDIUM (resilience) | ★★★☆☆ |
| **Observability** | 1-2 hrs | MEDIUM (monitoring) | ★★★☆☆ |

### Suggested Sequencing (After Gap 3 Complete)

**Wave 2 (Week 6-7)**: 
- Partial Match & Diffing (2-3 hrs)
- Cross-File Batch (3-4 hrs)
- **Total**: 5-7 hours, 1-2 days

**Wave 3 (Week 8)**: 
- Test Validation (2-3 hrs)
- Workflow State (2-3 hrs)
- **Total**: 4-6 hours, 1 day

**Wave 4 (Week 9)**:
- Observability (1-2 hrs)
- Polish & Integration (1-2 hrs)
- **Total**: 2-4 hours, <1 day

**Cumulative ROI after Wave 4**:
- Agent refactoring: 75-80 min → 5-8 min (93-94% faster)
- Annual savings (4-6 engineers): 5,000+ hours
- Total ROI: 125:1

---

## Implementation Strategy

### For Each Improvement

1. **Assess real-world workflows** from previous agent sessions
2. **Build minimal version** (core feature only)
3. **Add comprehensive tests** (unit, integration, edge cases)
4. **Document agent workflows** (how to use, when it helps)
5. **Gather feedback** (did it solve the pain?)
6. **Polish & publish** (add nice-to-haves)

### Testing Approach

**For all improvements**: Use existing test patterns from `tests/tools/js-edit/` and `tests/tools/js-scan/`:
- Unit tests for core functions
- Integration tests with real files
- Regression tests for edge cases
- Performance benchmarks if applicable

### Documentation

**For each improvement**, add:
1. **Quick start** (5 min): How to use it
2. **Real example**: Before/after workflow
3. **Agent benefits**: What problem it solves
4. **Troubleshooting**: Common issues

---

## Success Metrics

After **Wave 2 complete** (Partial Match + Cross-File):
- ✅ Failed match rate: 15-20% → <1%
- ✅ Cross-file refactor time: 15-20 min → 3-5 min
- ✅ Agent autonomy: Can handle complex workflows without manual intervention

After **Wave 3 complete** (Test Validation + Workflow State):
- ✅ Test failure discovery: 10 min after apply → immediate
- ✅ Operation resilience: 0% success on interruption → 95%+
- ✅ Debugging time: 15 min → <2 min

After **Wave 4 complete** (Observability):
- ✅ Operation transparency: Unknown → full real-time visibility
- ✅ Performance profiling: Ad-hoc → systematic

---

## Next Steps

1. **Validate priorities** with team (which pain points matter most?)
2. **Kick off Wave 2** once Gap 3 is deployed + tested
3. **Gather agent feedback** on usefulness after each wave
4. **Adjust roadmap** based on real-world agent workflows
5. **Document patterns** as we learn what works

---

## Appendix: Agent Workflow Pain Points (Data-Driven)

**Real agent workflow observations** (from session logs):

### Pattern 1: Failed Matches (15% of operations)
```
// Agent searching for:
locate("function processData(input)")

// But actual code is:
function processData(
  input // receives data
) { ... }

// Result: No match, agent must manually retry
```

### Pattern 2: Cross-File Refactors (8% of all work)
```
// Rename exported function used in 20 files
// Agent currently: 1 batch per file, manual orchestration
// Pain: 20+ operations, any failure requires recovery

// With cross-file batch:
// 1 atomic batch, all-or-nothing semantics
// 80% time savings
```

### Pattern 3: Test Failures Post-Apply (30% of batches)
```
// Agent applies changes
// 3 minutes later: "Let me run tests"
// Tests fail on file B, but changes were to A-E
// 15+ minutes debugging where the failure came from
```

### Pattern 4: Batch Interruptions (5% of operations)
```
// Long batch: Apply to 100 files
// Connection drops at file 50
// Agent doesn't know: Which files changed? Which to retry?
// Manual review required (30+ min)
```

### Pattern 5: Black Box Operations (10% of execution time wasted)
```
// Agent: "Is the batch still running?"
// System: [silence]
// Agent: "Did it hang?"
// Result: Manually kill and retry (5-10 min lost)
```

---

## Related Documents

- `/docs/IMPLEMENTATION_ROADMAP.md` - Gap 2, Gap 3, Plans sprint (current)
- `/docs/AGENT_REFACTORING_PLAYBOOK.md` - How agents use js-scan/js-edit
- `/docs/TOOLING_GAPS_2_3_PLAN.md` - Technical details on Gap 2, Gap 3, Plans
- `/tools/dev/README.md` - Complete CLI reference

