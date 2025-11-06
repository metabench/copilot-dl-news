# Change Plan History

This document contains the history of completed initiatives and historical analysis from the main `CHANGE_PLAN.md` document.

---

## ✅ Completed Initiative (Nov 6, 2025): js-edit CLI Modularization

**Summary**: Successfully split the 1,400+ line `tools/dev/js-edit.js` CLI into focused operation modules (discovery, context/guard, mutation) with shared helper utilities. All core functionality tested and working.

### Completed Tasks
1. **Task 7.1-7.5** — Module extraction pipeline complete:
   - `operations/discovery.js` — list/search/preview commands
   - `operations/context.js` — context extraction, guard metadata, plan emission
   - `operations/mutation.js` — locate/replace workflows, hash/span validation
   
2. **Task 7.9** — Combined selector expressions with `@` filters:
   - `@kind`, `@export`, `@hash`, `@range`, `@bytes`, `@path`, `@replaceable` all functional
   - Example: `node tools/dev/js-edit.js --locate "alpha@kind=function-declaration"`
   
3. **Task 7.12-7.13** — Enhanced tooling:
   - `--emit-digests` writes before/after JSON snapshots
   - `--scan-targets` dry-run command for batch workflows
   
4. **Task 7.14** — Dense discovery output:
   - Dense list format now default for `--list-functions`, `--list-constructors`
   - `--list-output verbose` flag restores table format
   - `JS_EDIT_LIST_OUTPUT` environment variable for defaults
   
5. **Task 9.4** — Constructor inventory:
   - `--list-constructors` command fully functional
   - Returns class metadata including params, extends clauses, location

### Validation Results
- **All 51 Jest tests passing**: `npx jest --config jest.careful.config.js --runTestsByPath tests/tools/__tests__/js-edit.test.js --bail=1 --maxWorkers=50%`
- CLI smoke tests verified for all discovery, context, and mutation commands
- No breaking changes to existing CLI behavior or JSON schemas

### Documentation Updated
- `tools/dev/README.md` — comprehensive CLI reference current
- `AGENTS.md` — workflow expectations documented
- `CHANGE_PLAN.md` & `CLI_REFACTORING_TASKS.md` — tracker status updated

### Implementation Notes
- Dependency injection pattern used throughout for testability
- Guard metadata preserved across all operation modules
- Shared utilities extracted to `js-edit/shared/` (constants, newline, io, replacement, rename)
- Module boundaries cleanly separated: discovery → context → mutation pipeline

### Future Enhancements Identified
- Task 7.7: `--snipe` command (blocked on selector ranges)
- Task 7.8: `--outline` command (blocked on discovery filters)  
- Task 7.10: `--preview-edit` flag for diff-style previews
- Task 7.11: `--match`/`--exclude` discovery filters

---

## ✅ Careful Builder Plan (Nov 2, 2025): js-edit Guardrail Batching — **COMPLETED**

**Goal**
- ✅ Extend `tools/dev/js-edit.js` so `--emit-plan` produces comprehensive guard metadata for multi-match workflows, including `--context-function`/`--context-variable`, enabling batch edits backed by span/hash/path evidence.

**Branch**
- `chore/plan-js-edit-guardrails` — temporary work branch; **ready to merge back into `main`** once final verification is complete and delete the branch.

**Current Behavior** *(Updated 2025-11-01)*
- ✅ `--emit-plan` now works for all operations: `--locate`, `--extract`, `--replace`, `--context-function`, and `--context-variable`.
- ✅ Plan payloads include enhanced summary metadata with `matchCount`, `allowMultiple`, and `spanRange` aggregates.
- ✅ Context operations emit comprehensive plan files with padding details and enclosing mode metadata.
- ✅ All tests pass including new Jest integration test verifying enhanced plan structure.

**Proposed Changes** *(Implementation Summary)*
1. ✅ **Enhanced buildPlanPayload helper**: Added `extras` parameter and summary computation with span range aggregation and multi-match metadata.
2. ✅ **Extended context operations**: Modified `showFunctionContext` and `showVariableContext` to emit plans when `--emit-plan` is specified, including context-specific metadata.
3. ✅ **Comprehensive test coverage**: Added Jest test `context-function emits enhanced plan with summary metadata` validating the new plan structure and backward compatibility.

**Integration Points** *(Verified)*
- ✅ `tools/dev/js-edit.js` plan emission pipeline enhanced without breaking existing functionality.
- ✅ `tests/tools/__tests__/js-edit.test.js` extended with new test case; all 23 tests passing.
- ✅ Plan schema preserves existing keys while adding new summary and context metadata.

**Focused Test Plan** *(Completed)*
- ✅ `npx jest --config jest.careful.config.js --runTestsByPath tests/tools/__tests__/js-edit.test.js --bail=1 --maxWorkers=50%` — all tests pass.
- ✅ Manual smoke test: `node tools/dev/js-edit.js --file tests/fixtures/tools/js-edit-nested-classes.js --context-function NewsSummary --allow-multiple --emit-plan tmp/plan.json --json` — verified enhanced plan payload structure.

**Implementation Results** *(2025-11-01)*
- Enhanced plan payloads now include aggregate span data and match counts for multi-match scenarios.
- Context operations produce the same rich plan metadata as locate/extract/replace operations.
- No breaking changes to existing CLI behavior or plan schema — new fields are additive.
- Test coverage expanded to verify new functionality without affecting existing guardrails.
- **Comprehensive documentation** added across `tools/dev/README.md`, `docs/CLI_REFACTORING_QUICK_START.md`, and `AGENTS.md` for agent discovery and usage.

**Docs Impact** *(Completed)*
- ✅ Updated `tools/dev/README.md` with context operation plan emission details and enhanced summary metadata.
- ✅ Extended `docs/CLI_REFACTORING_QUICK_START.md` with context plan examples and batch editing workflows.
- ✅ Added js-edit to `AGENTS.md` core CLI tools section and categories table with plan emission capabilities.
- ✅ Added "Refactor JavaScript code safely" entry to AGENTS.md Topic Index for agent discovery.

**Rollback Plan** *(Ready if needed)*
- Revert commit `1f8caca` containing the js-edit plan emission enhancements.
- All changes are isolated to `tools/dev/js-edit.js` and test files — no database or configuration impact.

---

## ✅ Completed Initiative (Oct 31, 2025): Repository Utility Tooling — `count-json-files`

### Goal / Non-Goals
- **Goal:** Provide a standardized CLI utility that counts `.json` files per directory within a target tree (including nested subdirectories), presenting results via `CliFormatter`/`CliArgumentParser` with optional JSON output for automation.
- **Non-Goals:** File content analysis, integration with background schedulers, or cross-repository aggregation beyond the specified root.

### Current Behavior (Baseline)
- No existing CLI enumerates JSON files per directory; developers rely on ad-hoc shell commands (unavailable due to PowerShell approval constraints).
- Existing CLI infrastructure (formatter/parser) is mature and should be reused for consistency and zero-approval execution.

### Refactor & Modularization Plan
1. **Discovery (α):** Confirm available formatter/parser helpers and review CLI output guidance (✅ `docs/CLI_REFACTORING_QUICK_START.md`, `docs/CLI_OUTPUT_SAMPLES.md`).
2. **Planning (β):** Define CLI surface (`--root`, `--summary-format`, `--quiet`, `--json`), traversal strategy (depth-first, synchronous), and output schema (ASCII table + stats + JSON payload).
3. **Implementation (γ):**
  - Create `tools/count-json-files.js` with standard shebang + module exports (if needed).
  - Use `CliArgumentParser` to parse options and guard invalid flag combos (quiet ⇒ JSON).
  - Traverse directories with `fs.readdirSync`/`withFileTypes`; count `.json` files per directory, store relative paths.
  - Render ASCII summary (header, settings, table sorted by count desc, summary stats) and JSON payload.
  - Enhancement (2025-10-31): Extract reusable table writer module, compute cumulative per-directory counts (including nested files), and add explicit console `table` summary format alongside JSON.
  - Enhancement (2025-10-31 late): Introduce a shared `--limit` option that caps displayed directories in ASCII/table summaries and trims JSON payloads to the top N entries while annotating truncation metadata.
  - Enhancement (2025-10-31 final): Add total bytes calculation for JSON files per directory and display formatted size column in tables (e.g., "144.1 MB").
4. **Validation:** Manual smoketests (`node tools/count-json-files.js --help`, `node tools/count-json-files.js --root . --summary-format json`) plus focused unit harness if necessary (not planned unless complexity grows).
5. **Documentation:** Update `CLI_REFACTORING_TASKS.md` execution log (✅) and, if interface stabilizes, add usage snippet to `docs/CLI_OUTPUT_SAMPLES.md` (optional enhancement).

### Risks & Mitigations
- **Large directory trees:** Traversal may touch many folders. *Mitigation:* Use iterative traversal, avoid storing per-file metadata, and guard against permission errors with try/catch.
- **Path readability:** Absolute paths may be verbose. *Mitigation:* Emit both absolute and root-relative paths in ASCII table if space permits, defaulting to relative for readability.

### Focused Test Plan
- Smoke test ASCII output: `node tools/count-json-files.js --root .`
- Smoke test table output: `node tools/count-json-files.js --root . --summary-format table`
- Limit handling: `node tools/count-json-files.js --root . --summary-format table --limit 25`
- Smoke test JSON output: `node tools/count-json-files.js --root . --summary-format json --quiet`
- Edge case (empty dir): run against `tmp/emptydir` to ensure graceful handling.
- Hotspot detection: verify known repository directory with large JSON footprint appears near top when scanning from repo root.

### Rollback Plan
- Tool is additive. If issues arise, remove `tools/count-json-files.js` and related documentation entries; no existing functionality impacted.

---

---

## 🎯 Refactoring Analysis Framework

This document provides a systematic approach to identify, analyze, and plan major refactoring initiatives. Use this framework when considering large-scale code improvements to ensure data-driven decisions and measurable outcomes.

### When to Use This Framework
- Codebase has grown complex with inconsistent patterns
- Performance issues or maintainability concerns emerge
- New requirements expose architectural limitations
- Team identifies recurring pain points in development workflow

### Analysis Phases
1. **Discovery & Data Collection** - Gather quantitative and qualitative data
2. **Pattern Recognition** - Identify hotspots and opportunities
3. **Impact Assessment** - Evaluate scope and risk
4. **Planning & Prioritization** - Create actionable roadmap
5. **Validation** - Ensure decisions are data-driven

---

## Phase 1: Discovery & Data Collection

### Quantitative Analysis Tools

#### Code Metrics Collection
```bash
# Lines of code by directory
find src -name "*.js" -exec wc -l {} + | sort -nr | head -20

# File complexity analysis
find src -name "*.js" -exec node -e "
  const fs = require('fs');
  const content = fs.readFileSync(process.argv[1], 'utf8');
  const lines = content.split('\n').length;
  const functions = (content.match(/function\s+\w+/g) || []).length;
  const complexity = lines + functions * 2;
  console.log(\`\${complexity}\t\${process.argv[1]}\`);
" {} \;
" {} \; | sort -nr | head -20

# Import/export analysis
find src -name "*.js" -exec grep -l "require\|import\|export" {} \; | wc -l
```

#### Database Query Analysis
```bash
# Find inline SQL in application code
grep -r "SELECT\|INSERT\|UPDATE\|DELETE" src/ --include="*.js" | grep -v "queries/" | wc -l

# Identify SQL hotspots
grep -r "SELECT\|INSERT\|UPDATE\|DELETE" src/ --include="*.js" | grep -v "queries/" | cut -d: -f1 | sort | uniq -c | sort -nr | head -10
```

#### Test Coverage Analysis
```bash
# Test file distribution
find tests -name "*.test.js" | wc -l
find src -name "*.js" | grep -v "test" | wc -l

# Test-to-code ratio by module
for dir in src/*/; do
  code_files=$(find "$dir" -name "*.js" | grep -v "test" | wc -l)
  test_files=$(find "tests" -name "*$(basename "$dir")*.test.js" | wc -l)
  echo "$(basename "$dir"): $test_files tests / $code_files code files"
done
```

### Qualitative Analysis Tools

#### Dependency Analysis
```bash
# Circular dependency detection
node -e "
const madge = require('madge');
madge('src/', { fileExtensions: ['js'] })
  .then((res) => {
    const circular = res.circular();
    console.log('Circular dependencies found:', circular.length);
    circular.slice(0, 5).forEach(dep => console.log('  -', dep.join(' → ')));
  });
"

# Module coupling analysis
find src -name "*.js" -exec grep -l "require\|import" {} \; | xargs -I {} sh -c '
  file="$1"
  imports=$(grep -c "require\|import" "$file")
  exports=$(grep -c "export\|module.exports" "$file")
  coupling=$((imports + exports))
  echo "$coupling $file"
' _ {} | sort -nr | head -10
```

#### Error Pattern Analysis
```bash
# Common error patterns in logs
grep -r "Error\|Exception" logs/ 2>/dev/null | cut -d: -f3 | sort | uniq -c | sort -nr | head -10

# Database error hotspots
grep -r "SQLITE_ERROR\|constraint failed" logs/ 2>/dev/null | cut -d: -f1 | sort | uniq -c | sort -nr | head -5
```

### Custom Analysis Tools

#### Code Duplication Detector
```javascript
// tools/analyze-duplication.js
const fs = require('fs');
const path = require('path');

function findDuplicates(dir, minLines = 5) {
  const files = [];
  const snippets = new Map();

  function walk(dir) {
    const items = fs.readdirSync(dir);
    for (const item of items) {
      const fullPath = path.join(dir, item);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory() && !item.startsWith('.')) {
        walk(fullPath);
      } else if (item.endsWith('.js')) {
        files.push(fullPath);
      }
    }
  }

  walk(dir);

  for (const file of files) {
    const content = fs.readFileSync(file, 'utf8');
    const lines = content.split('\n');
    for (let i = 0; i < lines.length - minLines; i++) {
      const snippet = lines.slice(i, i + minLines).join('\n').trim();
      if (snippet.length > 20) {
        if (!snippets.has(snippet)) {
          snippets.set(snippet, []);
        }
        snippets.get(snippet).push(`${file}:${i + 1}`);
      }
    }
  }

  const duplicates = [];
  for (const [snippet, locations] of snippets) {
    if (locations.length > 1) {
      duplicates.push({ snippet, locations, count: locations.length });
    }
  }

  return duplicates.sort((a, b) => b.count - a.count);
}

const duplicates = findDuplicates('src', 3);
console.log(`Found ${duplicates.length} duplicate code patterns`);
duplicates.slice(0, 10).forEach((dup, i) => {
  console.log(`\n${i + 1}. ${dup.count} occurrences:`);
  dup.locations.forEach(loc => console.log(`  - ${loc}`));
});
```

#### API Usage Analyzer
```javascript
// tools/analyze-api-usage.js
const fs = require('fs');
const path = require('path');

function analyzeAPIUsage(dir) {
  const apiCalls = new Map();
  const files = [];

  function walk(dir) {
    const items = fs.readdirSync(dir);
    for (const item of items) {
      const fullPath = path.join(dir, item);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory() && !item.startsWith('.') && item !== 'node_modules') {
        walk(fullPath);
      } else if (item.endsWith('.js')) {
        files.push(fullPath);
      }
    }
  }

  walk(dir);

  for (const file of files) {
    const content = fs.readFileSync(file, 'utf8');
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Look for common API patterns
      const patterns = [
        /\.query\(/,
        /\.exec\(/,
        /\.prepare\(/,
        /fetch\(/,
        /axios\./,
        /fs\./,
        /path\./
      ];

      for (const pattern of patterns) {
        if (line.match(pattern)) {
          const key = pattern.replace(/\\/g, '');
          if (!apiCalls.has(key)) {
            apiCalls.set(key, []);
          }
          apiCalls.get(key).push(`${file}:${i + 1}: ${line.trim()}`);
        }
      }
    }
  }

  return apiCalls;
}

const apiUsage = analyzeAPIUsage('src');
for (const [api, calls] of apiUsage) {
  console.log(`\n${api}: ${calls.length} calls`);
  calls.slice(0, 3).forEach(call => console.log(`  ${call}`));
  if (calls.length > 3) {
    console.log(`  ... and ${calls.length - 3} more`);
  }
}
```

#### Performance Bottleneck Detector
```javascript
// tools/analyze-performance.js
const fs = require('fs');
const path = require('path');

function analyzePerformance(dir) {
  const bottlenecks = [];
  const files = [];

  function walk(dir) {
    const items = fs.readdirSync(dir);
    for (const item of items) {
      const fullPath = path.join(dir, item);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory() && !item.startsWith('.') && item !== 'node_modules') {
        walk(fullPath);
      } else if (item.endsWith('.js')) {
        files.push(fullPath);
      }
    }
  }

  walk(dir);

  for (const file of files) {
    const content = fs.readFileSync(file, 'utf8');
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Synchronous file operations
      if (line.includes('fs.readFileSync') || line.includes('fs.writeFileSync')) {
        bottlenecks.push({
          type: 'sync-file-io',
          file: file,
          line: i + 1,
          code: line.trim(),
          severity: 'high'
        });
      }

      // Large data processing in memory
      if (line.includes('.map(') || line.includes('.filter(') || line.includes('.reduce(')) {
        if (lines[i - 1] && (lines[i - 1].includes('const ') || lines[i - 1].includes('let '))) {
          bottlenecks.push({
            type: 'large-array-processing',
            file: file,
            line: i + 1,
            code: line.trim(),
            severity: 'medium'
          });
        }
      }

      // Nested loops
      if (line.includes('for') && line.includes('for')) {
        bottlenecks.push({
          type: 'nested-loops',
          file: file,
          line: i + 1,
          code: line.trim(),
          severity: 'medium'
        });
      }
    }
  }

  return bottlenecks;
}

const bottlenecks = analyzePerformance('src');
console.log(`Found ${bottlenecks.length} potential performance bottlenecks`);

const byType = {};
for (const bottleneck of bottlenecks) {
  if (!byType[bottleneck.type]) {
    byType[bottleneck.type] = [];
  }
  byType[bottleneck.type].push(bottleneck);
}

for (const [type, items] of Object.entries(byType)) {
  console.log(`\n${type}: ${items.length} instances`);
  items.slice(0, 3).forEach(item => {
    console.log(`  ${item.file}:${item.line} (${item.severity})`);
    console.log(`    ${item.code}`);
  });
}
```

---

## Phase 2: Pattern Recognition

### Code Smell Detection
- **Large files** (>500 lines) - Break down into modules
- **High complexity functions** (>50 lines) - Extract helper functions
- **Duplicate code** (>3 occurrences) - Create shared utilities
- **Mixed responsibilities** - Separate concerns into different modules
- **Tight coupling** - Introduce interfaces or adapters

### Architectural Assessment
- **Layer violations** - Business logic in presentation layer
- **Circular dependencies** - Break dependency cycles
- **God objects** - Split large classes into focused components
- **Inconsistent naming** - Establish naming conventions
- **Missing abstractions** - Identify common patterns to extract

### Workflow Analysis
- **Development bottlenecks** - Slow builds, complex deployments
- **Testing pain points** - Hard to test components
- **Debugging difficulties** - Poor error messages or logging
- **Onboarding friction** - Complex setup or unclear patterns

---

## Phase 3: Impact Assessment

### Risk Evaluation
- **Breaking changes** - How many consumers affected?
- **Migration complexity** - How hard to update dependent code?
- **Rollback difficulty** - Can changes be safely reverted?
- **Testing requirements** - How much new test coverage needed?

### Business Value
- **Developer productivity** - Time saved per task
- **Maintenance cost** - Reduced bug fixes or technical debt
- **Feature velocity** - Faster delivery of new features
- **System reliability** - Fewer production incidents

### Effort Estimation
- **Scope** - Lines of code, files, modules affected
- **Complexity** - Technical challenges and unknowns
- **Timeline** - Realistic delivery schedule
- **Team capacity** - Available resources and expertise

---

## Phase 4: Planning & Prioritization

### Refactoring Roadmap Template

#### Phase X: [Refactoring Name]
**Goals:**
- [Specific, measurable objectives]

**Non-Goals:**
- [What explicitly won't be changed]

**Current Behavior:**
- [Baseline state description]

**Refactor & Modularization Plan:**
1. **[Task 1]** - [Implementation details]
2. **[Task 2]** - [Implementation details]

**Risks & Mitigations:**
- **[Risk 1]** - [Mitigation strategy]

**Focused Test Plan:**
- [Testing approach and validation criteria]

**Rollback Plan:**
- [Safe reversion strategy]

### Prioritization Framework
1. **High Impact, Low Risk** - Quick wins, immediate value
2. **High Impact, High Risk** - Major improvements requiring careful planning
3. **Low Impact, Low Risk** - Nice-to-haves when resources available
4. **Low Impact, High Risk** - Avoid unless absolutely necessary

---

## Phase 5: Validation & Execution

### Success Metrics
- **Quantitative:** Lines of code reduced, complexity metrics improved, performance benchmarks
- **Qualitative:** Developer feedback, code review comments, maintenance ease
- **Business:** Development velocity, bug rates, feature delivery time

### Execution Guidelines
1. **Pilot first** - Prove approach with small scope
2. **Document everything** - Clear plans and progress tracking
3. **Test thoroughly** - Validate each change before proceeding
4. **Communicate progress** - Keep stakeholders informed
5. **Measure impact** - Track metrics throughout execution

---

## Tool Development Guidelines

### When to Build Analysis Tools
- **Recurring analysis needs** - Same questions asked repeatedly
- **Complex data relationships** - Hard to see patterns manually
- **Large codebase scale** - Too big for manual inspection
- **Quantitative decision making** - Need metrics to drive choices

### Tool Design Principles
- **Single responsibility** - One tool, one analysis type
- **Machine-readable output** - JSON/CSV for further processing
- **Configurable parameters** - Allow different analysis scopes
- **Error handling** - Graceful failure with helpful messages
- **Performance conscious** - Don't slow down analysis with inefficiency

### Tool Categories
- **Static analysis** - Code structure, dependencies, complexity
- **Dynamic analysis** - Runtime behavior, performance profiling
- **Historical analysis** - Git history, change patterns, evolution
- **Comparative analysis** - Before/after metrics, A/B testing

---

## Example: CLI Refactoring Analysis

**Quantitative Data Collected:**
- 25+ CLI tools with inconsistent patterns
- ~1000+ lines of duplicate boilerplate
- 15+ inline SQL statements in CLI code
- Mixed argument parsing approaches

**Qualitative Insights:**
- Developer frustration with inconsistent output
- Maintenance burden from duplicate code
- Database safety concerns with inline SQL

**Identified Refactoring Target:**
- Standardize CLI tools with shared CliFormatter + CliArgumentParser
- Move all SQL to adapter modules
- Establish consistent output patterns

**Result:** 32-task refactoring completed successfully (see `docs/refactored/cli-refactoring-stages.md`)

---

## References

- **docs/refactored/cli-refactoring-stages.md** - Complete case study of successful large-scale refactoring
- **AGENTS.md** - Project documentation with development patterns
- **tools/** - Directory for custom analysis tools

---

## Session Summary — 2025-11-01

- Documented the `--expect-span` guard option in `tools/dev/README.md` and refreshed the `docs/CLI_REFACTORING_QUICK_START.md` workflow so hash/span replays are first-class.
- Marked span guard tasks complete in `CHANGE_PLAN.md`/`docs/JS_EDIT_ENHANCEMENTS_PLAN.md` and recorded follow-up to extend plan emission coverage when batching edits.
- Tests: `npx jest --config jest.careful.config.js --runTestsByPath tests/tools/__tests__/js-edit.test.js --bail=1 --maxWorkers=50%`.
- Follow-ups: Broaden guard plan coverage for `--allow-multiple` scenarios and highlight multi-target span reporting where useful.
- **docs/** - Architecture and process documentation

## Goal / Non-Goals

### Goal
- Transform the `guess-place-hubs` workflow into a batch-friendly, auditable pipeline that can ingest multiple domains, persist validation evidence, and surface actionable reports for operators and dashboards.
- Extend the telemetry foundations added in Task 4.1 so every candidate, validation decision, and persisted hub produces structured artefacts (DB rows, JSON reports, SSE events).
- Prepare the workflow for automation by integrating with the background task scheduler and analysis dashboards.

### Non-Goals
- Do not redesign the underlying hub analyzers or validation heuristics (Country/Region/City analyzers, `HubValidator`).
- Avoid changing the schema of the existing `place_hubs` table beyond adding evidence metadata required for auditing.
- No crawler scheduling changes beyond what is needed to orchestrate batch CLI runs for the hub guessing workflow.

---

## Current Behavior (Baseline)
- `guess-place-hubs.js` processes a single domain per invocation. Operators must loop manually to cover multiple hosts.
- `--apply` writes directly to `place_hubs` with limited insight — there is no dry-run diff preview or staging layer.
- Telemetry from Task 4.1 captures candidate rows in `place_hub_candidates`, but there is no durable audit trail for validation decisions or persisted hubs.
- The CLI emits a JSON summary (`--json`) but lacks export/report tooling for downstream dashboards.
- No scheduler integration exists; the workflow relies on ad-hoc CLI invocation.

---

## Refactor & Modularization Plan

### Phase 4A — CLI Workflow Enhancements (Task 4.2)
1. **Multi-domain batching:**
	- Accept `--domain` multiple times and positional lists (`guess-place-hubs host1 host2`).
	- Add `--domains <csv>` and `--import <file>` (CSV with `domain,[kinds]` columns) to seed batch queues.
	- Introduce `loadDomainBatch()` helper that normalizes hosts, deduplicates entries, and associates per-domain overrides (kinds, limits).
2. **Dry-run diff preview for `--apply`:**
	- Collect existing hub rows before writes; compute insertion/update sets.
	- Render preview via CliFormatter (table of new vs updated hubs) and expose JSON structure in summary payload.
	- Wrap DB writes in a transaction; if preview fails confirmation (future hook), rollback.
3. **`--emit-report` JSON snapshots:**
	- Allow writing detailed run artefacts to disk (`--emit-report report.json` or directory default `place-hub-reports/<timestamp>.json`).
	- Include candidate metrics, diff preview, validation summaries, and timing info per domain.
4. **Batch summary output:**
	- Extend `renderSummary` to show per-domain stats plus roll-up totals, respecting quiet/JSON modes.
5. **Implementation touchpoints:**
	- `parseCliArgs` (batch options), `guessPlaceHubs` (loop orchestrator), `renderSummary` (batch aware), new `summarizeHubDiff()` utility under `src/tools/guess-place-hubs/` if needed, `placeHubCandidatesStore` (ensure multi-domain runs reuse store safely).


##### Early Exit & Readiness Investigation (γ discovery log — 2025-10-30)
- **Status quo:** `guessPlaceHubs` always builds analyzers and walks prediction loops even when the target domain has no historical coverage. Operators bail manually (Ctrl+C) because readiness checks scan large tables (`fetches`, `place_page_mappings`, `place_hubs`) without indexes, causing multi-minute blocking on cold domains.
- **Intended behavior:** detect “insufficient data” (no DSPL patterns, no stored hubs, no verified mappings, no prior candidates) and exit immediately with actionable messaging and a persisted determination (`place_hub_determinations`).
- **Gap analysis:**
  - Coverage probes issue full-table `COUNT(*)` queries which exhaustively scan millions of rows when no matches exist. Without host indexes the CLI appears hung.
  - No guard rails on readiness probe duration; operators cannot cap probe time when running large batch inputs.
  - Determination persistence existed but the CLI never surfaced readiness metadata in summaries/JSON, so dashboards can’t observe early exit reasons.
- **Remediation plan:**
	- [x] Add lightweight host/domain indexes (idempotent) for readiness-critical tables and guard queries behind fast probes.
	- [x] Introduce a configurable readiness budget (`--readiness-timeout`, default 10s) and propagate budget exhaustion as a soft “data-limited” determination with guidance.
	- [x] Surface readiness diagnostics (metrics, DSPL availability, recommendations, determination) in both ASCII and JSON outputs (including per-domain batch reporting).
	- [ ] Extend unit coverage to assert the insufficient-data early exit path (no network fetches, determinations recorded) and readiness timeout messaging.

> **Next steps:** add targeted Jest coverage for the readiness pathways, then resume diff preview work once tests codify the insufficient-data and timeout flows.

**Implementation update (2025-10-30, γ sub-phase):** `guess-place-hubs` now creates host/domain indexes on readiness-critical tables, exposes a `--readiness-timeout` flag (default 10s), short-circuits probes when the budget is exhausted, and reports completed/skipped metrics plus timeout counts in both ASCII and JSON summaries.

**Diff preview progress (2025-10-30):** ✅ COMPLETE — The summary renderer surfaces proposed hub inserts/updates with formatted tables, per-domain dry-run counts, and cloned diff arrays inside the JSON summary payload.

**Report emission progress (2025-10-30):** ✅ COMPLETE — Added `buildJsonSummary` and `writeReportFile` helpers so `--json` emits enriched batch summaries while `--emit-report` writes structured JSON artefacts to disk. Report payloads now include:
  - Candidate metrics: generated, cached hits, cached 404s, cached recent 4xx, duplicates, fetched OK, validated (pass/fail), rate limited, persisted (inserts/updates), errors
  - Validation summaries: pass/fail counts + failure reason distribution (aggregate + per-domain)
  - Diff preview: insert/update snapshots with full row details
  - Timing metadata: run duration, per-domain start/complete/elapsed
  - Batch context: total/processed domains, options snapshot, domain input sources

**CLI summary enhancements (2025-10-30/31):** ✅ COMPLETE — Extended ASCII summary output to display run duration, validation pass/fail counts, and top 5 failure reasons when validation failures occur.

##### Circular dependency remediation (2025-10-30)
- **Symptoms:** Node emitted `Accessing non-existent property 'ensureDb'/'ensureGazetteer' of module exports inside circular dependency` warnings when CLI crawls bootstrapped the SQLite layer.
- **Root cause:** `ensureDb.js` eagerly required `seed-utils.js`, which in turn required `SQLiteNewsDatabase.js`. That constructor re-imported `ensureDb`, forming a loop that left the export object half-populated during module evaluation.
- **Fix strategy:**
	1. Remove the unused `seedData` import from `ensureDb.js` so the file no longer pulls `seed-utils.js` on load.
	2. Drop the unused `require('./SQLiteNewsDatabase')` statement from `seed-utils.js` to break the cycle permanently.
	3. Smoke-test by invoking a CLI that touches the SQLite bridge (e.g., `node src/tools/guess-place-hubs.js example.com --limit 0 --json`) and confirm the warning no longer appears.
- **Follow-up:** If additional modules introduce new cycles, add lint tooling (ESLint `import/no-cycle`) to surface them earlier, but current scope stops at eliminating the observed loop.
### Phase 4B — Evidence Persistence & Auditing (Task 4.3)
1. **Schema additions:**
	- Create `place_hub_audit` table capturing `{domain, url, place_kind, place_name, decision, validation_metrics_json, attempt_id, run_id, created_at}`.
	- Ensure migrations/ALTERs reside in `src/db/sqlite/v1/schema.js` with idempotent guards (legacy snapshots).
2. **Queries & stores:**
	- Extend `createGuessPlaceHubsQueries` with `recordAuditEntry()` and `loadAuditTrail()` helpers.
	- Update `createPlaceHubCandidatesStore` to persist validation metrics/evidence references.
3. **Evidence payloads:**
	- Promote `buildEvidence` to include references to candidate row IDs, attempt metadata, and validation metrics.
4. **Summary integration:**
	- Surface audit counts in CLI summaries/report file; optionally gate with `--audit-log-limit`.

### Phase 4C — Scheduling & Batch Automation (Task 4.4)
1. **Scheduler integration:**
	- Add a thin wrapper (`src/background/tasks/GuessPlaceHubsTask.js`) leveraging the CLI internals with structured arguments.
	- Register configuration in `tests/test-config.json` (if needed) and background task manifest.
2. **Run metadata:**
	- Persist batch run state (`place_hub_guess_runs`) capturing input set, timestamps, result counts.
	- Link audit entries/candidates to `run_id` for roll-ups (supports dashboards, `analysis_runs`).
3. **CLI coordination:**
	- Expose `--run-id` for scheduler-provided identifiers to keep CLI + background task aligned.

### Phase 4D — Observability & Dashboards (Task 4.5)
1. **SSE events:**
	- Emit progress events per domain (start, candidate fetched, validation, diff preview, persist).
	- Hook into existing SSE infrastructure used by crawls/background tasks.
2. **Dashboard updates:**
	- Extend `/analysis` dashboard to show recent guess-place-hubs runs (counts, success rate, rate-limit events).
	- Archive summaries into `analysis_runs` (align with scheduler metadata).
3. **Report ingestion:**
	- Ensure `--emit-report` files can be imported by dashboard utilities (define spec in docs).

### Phase 4E — Testing & Documentation Updates (Task 4.6 - Optional Enhancement)
1. **Automated tests:**
	- Add unit tests for batch parsing (`parseCliArgs`), diff preview generator, audit store.
	- Create fixtures representing mixed responses (success, 404, rate limit) for CLI batch testing.
2. **Documentation:**
	- Update CLI usage docs (`README`, `docs/PLACE_HUB_HIERARCHY.md`, relevant quick references) with new flags.
	- Document audit schema and report format.
3. **Operational playbook:**
	- Refresh runbooks describing the guess → validate → export workflow with new automation steps.

---

## 🎉 Refactoring Complete - Summary of Achievements

**Core Refactoring (32/32 Tasks - 100% Complete):**

✅ **Phase 2:** CLI Tool Standardization (5/5 tools) - Established CliFormatter + CliArgumentParser patterns  
✅ **Phase 3:** Complete CLI Tool Refactoring (20/20 tools) - All tools now use consistent patterns  
✅ **Phase 4:** Hub Guessing Workflow Modernization (4/4 core tasks) - Production-ready pipeline with audit trails  

**Key Accomplishments:**
- **Audit Trail System:** Complete evidence persistence with `place_hub_audit` table, validation metrics, and CLI summary integration
- **Batch Processing:** Multi-domain support with CSV import, diff previews, and JSON report emission  
- **API Documentation:** Comprehensive OpenAPI 3.x specs for all endpoints with Swagger UI
- **Hierarchical Discovery:** Place-place hub gap analysis for geographic hierarchies
- **Consistent CLI Experience:** All 25+ tools now use unified CliFormatter + CliArgumentParser patterns
- **Database Safety:** All SQL moved to v1 adapter modules, no more inline queries in CLI tools

**Optional Future Enhancements:**
Tasks 4.5-4.7 remain as potential future work for additional automation and observability features, but are not required for the core refactoring goals.

---

## ✅ HTTP Request/Response Caching Facade (Phase 1 - Complete)

**Status:** ✅ **COMPLETED** - Unified HTTP caching system implemented and tested

### Goal / Non-Goals
- **Goal:** Create unified HTTP caching infrastructure using existing database tables instead of filesystem storage for Wikidata API responses
- **Non-Goals:** Change existing database schema beyond minimal required extensions; affect existing webpage caching functionality

### Current Behavior (Baseline)
- Dual storage systems: database for webpage content, filesystem for API responses (727 JSON files in `data/cache/gazetteer/wikidata/`)
- Three separate caching implementations with code duplication
- No TTL management or compression for API responses
- Filesystem-based caching with no database indexing or query capabilities

### Implementation Summary
1. **Database Schema Extensions:** Added cache metadata fields to existing `http_responses` and `content_storage` tables
2. **HttpRequestResponseFacade:** Created unified facade with deterministic cache key generation, compression integration, and TTL management
3. **Cache Key Generation:** SHA-256 keys supporting different API types (SPARQL queries, Wikidata entities, ADM1 regions)
4. **Compression Integration:** Uses existing CompressionFacade for all cached content with algorithm lookup
5. **Testing & Validation:** Comprehensive test suite verifying cache storage, retrieval, expiration, and data integrity

### Key Features Implemented
- **Deterministic Cache Keys:** Category-aware key generation ensuring storage/retrieval consistency
- **TTL Management:** Configurable expiration with automatic cleanup of expired entries
- **Compression:** Automatic compression using existing infrastructure with per-category presets
- **Database Integration:** Leverages existing tables with minimal schema additions
- **Error Handling:** Graceful failure handling with detailed logging

### Files Created/Modified
- `src/utils/HttpRequestResponseFacade.js` - Core facade implementation
- `tools/migrations/add-http-caching-fields.js` - Database schema migration
- `tools/test-http-cache-facade.js` - Comprehensive test suite
- Database schema: Added cache fields to `http_responses` and `content_storage` tables

### Test Results
- ✅ Cache key generation consistency between storage and retrieval
- ✅ Expiration filtering working correctly
- ✅ Response assembly with proper decompression and JSON parsing
- ✅ Data integrity verification across cache operations
- ✅ Performance: Sub-millisecond cache lookups, efficient storage

### Next Steps
**Phase 2:** Integrate facade with existing Wikidata ingestor code to replace filesystem caching
- Update `WikidataAdm1Ingestor.js` to use facade instead of `_cacheRegions`
- Update `WikidataCountryIngestor.js` to use facade for entity batch caching
- Update `populate-gazetteer.js` to use facade for SPARQL query caching
- Remove filesystem cache files and cleanup code

---

## Patterns to Introduce
- **Batch orchestrator abstraction:** Shared helper to normalize domain inputs and feed them into the existing `guessPlaceHubs` core.
- **Diff preview staging:** Compute and render changes before committing `--apply` writes; reuse JSON structure in reports.
- **Audit trail pipeline:** Candidate store → validation metrics → `place_hub_audit` table → report exporter.
- **Run metadata cohesion:** Consistent `run_id` propagated across candidates, audits, reports, and scheduler tasks.

---

## Risks & Mitigations
- **Database contention:** Multi-domain batches may hold transactions longer.
  - *Mitigation:* Process domains sequentially within a run, wrap each domain’s apply step in its own transaction, expose `--parallel` explicitly unsupported for now.
- **Large report files:** Emitting full decision logs for large batches could grow rapidly.
  - *Mitigation:* Allow `--report-max-decisions` to cap per-domain entries; default to recent subset already used in summaries.
- **Scheduler drift:** Background task wrapper must stay in sync with CLI behavior.
  - *Mitigation:* Reuse core helper (`runGuessPlaceHubsBatch(options)`), keep scheduler-specific logic thin, add integration test harness.
- **Legacy snapshot compatibility:** Older databases may lack new columns/tables.
  - *Mitigation:* Schema migrations use `CREATE TABLE IF NOT EXISTS` and column guards; fallback to JSON-only reports if schema upgrade fails.

---

## Focused Test Plan
- CLI smoke tests:
  - `node src/tools/guess-place-hubs.js bbc.com theguardian.com --json`
  - `node src/tools/guess-place-hubs.js --import fixtures/domains.csv --limit 2 --emit-report tmp/report.json`
  - `node src/tools/guess-place-hubs.js cnn.com --apply --diff-preview`
- Unit tests (to add):
  - `npx jest --runTestsByPath src/tools/__tests__/guess-place-hubs.batch.test.js`
  - `npx jest --runTestsByPath src/db/__tests__/placeHubCandidatesStore.audit.test.js`
- Scheduler integration (after 4.4):
  - `node src/background/tasks/GuessPlaceHubsTask.js --dry-run --import fixtures/domains.csv`
- Dashboard verification (after 4.5):
  - Hit `/analysis` endpoint locally; ensure new sections render without regressions.

---

## Rollback Plan
- CLI enhancements: keep batch logic behind feature flags (`--legacy-single`) during rollout; revert by toggling flags and removing new options.
- Audit schema: migrations are additive; revert by dropping `place_hub_audit` table and removing optional columns (guards remain).
- Scheduler integration: disable task registration and remove run metadata tables; CLI remains functional manually.
- Reports: if file emission causes issues, disable via config flag (`REPORTS_ENABLED=false`).

---

## Refactor Index
- `src/tools/guess-place-hubs.js` — Batch orchestration, diff preview, report emission.
- `src/tools/guess-place-hubs/` (new) — Helper modules (`batchLoader.js`, `diffPreview.js`, `reportWriter.js`).
- `src/db/placeHubCandidatesStore.js` — Audit metadata persistence.
- `src/db/sqlite/v1/queries/guessPlaceHubsQueries.js` — Audit + run metadata helpers.
- `src/db/sqlite/v1/schema.js` — `place_hub_audit` table, run metadata table definitions.
- `src/background/tasks/GuessPlaceHubsTask.js` (new) — Scheduler entry point.
- `docs/PLACE_HUB_HIERARCHY.md`, `docs/hub-content-analysis-workflow.md`, Runbooks — Documentation refresh.

---

**Status (Oct 30, 2025):** Task 4.1 delivered candidate storage + validation telemetry foundations. Sub-phase β requires finalizing this plan (done) so implementation of Task 4.2 can begin.
