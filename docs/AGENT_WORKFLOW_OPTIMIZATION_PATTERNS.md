---
type: agent-optimization-playbook
title: "Agent Optimization Patterns by Workflow Type"
subtitle: "Specific Techniques for Common Code Tasks"
date: 2025-11-13
target-audience: "AI agents + engineering team"
---

# Agent Optimization Patterns by Workflow Type

## Overview

This document identifies **12 common agent workflows** and provides specific optimization patterns for each. These patterns leverage existing tools more effectively and suggest targeted enhancements where gaps exist.

---

## Pattern 1: Large-Scale Module Refactoring

### Symptoms
- Moving/renaming core modules that many files depend on
- Updating imports across 20+ files
- Risk of broken imports or circular dependencies
- Current approach: Manual search-replace + testing (2-3 hours)

### Current Workflow
```
1. Agent searches for imports: js-scan --search "import.*module"
2. Agent reads each file (20+ files)
3. Agent manually creates batch edits
4. Agent runs tests to find broken imports
5. Agent manually fixes errors (iterations)
Time: 2-3 hours
```

### Optimized Workflow (With Enhancement #1)
```
1. Agent queries semantic index:
   node js-scan.js --what-imports "src/old/module.js" \
     --recursive --json
   
   Returns: {
     "files": 23,
     "by_type": {
       "default_import": 8,
       "named_import": 12,
       "dynamic_import": 3
     },
     "breakdown": [...]
   }

2. Agent prepares batch edits:
   - Transform each import automatically
   - Detect circular dependencies upfront
   - Generate rollback plan

3. Dry-run with offset tracking (Enhancement #2):
   node js-edit.js --changes batch.json --dry-run --show-conflicts
   
   Returns: All conflicts upfront, not after failures

4. Apply batch atomically
5. Run tests (only on actually-affected files)

Time: 30-45 minutes (60% reduction)
```

### Specific Tool Improvements Needed
- **Enhancement #1** (Semantic Index): Essential for `--what-imports` capability
- **Enhancement #2** (Batch Editor): Needed for dry-run + offset tracking
- **Small add-on**: Circular dependency detector

### Success Metrics
- Time: 2.5h → 0.5h (80% reduction)
- Errors: 2-3 broken imports → 0
- Iterations: 3-4 → 1

---

## Pattern 2: Database Schema Evolution

### Symptoms
- Adding a column + migration
- Updating schema + adapter + tests
- 5-8 files to coordinate
- Current approach: Manual coordination + testing (1.5-2 hours)

### Current Workflow
```
1. Agent understands current schema
2. Agent creates migration file
3. Agent updates database adapter
4. Agent updates type definitions
5. Agent updates service layer
6. Agent adds tests
7. Agent runs full test suite
Time: 1.5-2 hours
```

### Optimized Workflow (With Enhancement #3 + #4)
```
1. Agent runs workflow discovery:
   node tools/dev/workflow-registry.js --search "schema" \
     --category "database" --json
   
   Returns workflow template for schema evolution

2. Agent uses workflow registry as checklist:
   - Schema change template
   - Associated files to update
   - Test patterns
   - Common mistakes to avoid

3. Agent chains analyses (Enhancement #4):
   # Create pipeline:
   # Step 1: Find all references to old column
   # Step 2: Identify affected adapters
   # Step 3: Find tests that reference schema
   # Step 4: Generate change summary
   
   node tools/dev/analysis-pipeline.js --plan pipeline.json
   
   Returns: Complete impact assessment in one step

4. Agent prepares changes with full context
5. Applies batch edits with dry-run
6. Runs targeted tests (only on affected modules)

Time: 45-60 minutes (50% reduction)
```

### Specific Tool Improvements Needed
- **Enhancement #3** (Workflow Registry): Critical for consistency
- **Enhancement #4** (Pipeline Chains): Essential for multi-step analysis
- **Small add-on**: Schema diff tool

### Success Metrics
- Time: 1.5-2h → 45-60 min (50% reduction)
- Errors: 1-2 missed files → 0
- Test iterations: 2-3 → 1

---

## Pattern 3: Implementing New Features Across Stack

### Symptoms
- Feature requires changes in UI + API + database + services
- 10+ files to touch
- Coordination of dependencies
- Current approach: Manual sequencing (3-4 hours)

### Current Workflow
```
1. Agent plans sequence manually
2. Agent starts with database
3. Agent works up to API
4. Agent implements UI
5. Agent tests integration
6. Agent fixes integration issues
7. Agent retests
Time: 3-4 hours
```

### Optimized Workflow (With Enhancement #3 + #4)
```
1. Agent queries workflow registry:
   node tools/dev/workflow-registry.js --search "feature" \
     --difficulty "intermediate" --json
   
   Returns: Tested feature implementation patterns

2. Agent retrieves recommended sequence:
   - Database changes first (why: used by everything else)
   - Service layer next (why: provides abstraction)
   - API layer next (why: depends on services)
   - UI last (why: depends on API)

3. Agent chains dependency analysis (Enhancement #4):
   # Pipeline identifies:
   # - What database changes break services
   # - What service changes break API
   # - What API changes break UI
   
   node tools/dev/analysis-pipeline.js --plan feature_pipeline.json \
     --identify-breakpoints --json

4. Agent implements in safe order:
   - Each step validates before moving to next
   - Uses dry-run to catch integration issues early
   - Minimizes rework

5. Integration tests only run at end (not after each step)

Time: 1.5-2 hours (50-65% reduction)
```

### Specific Tool Improvements Needed
- **Enhancement #3** (Workflow Registry): Critical for sequencing guidance
- **Enhancement #4** (Pipeline Chains): Essential for integration analysis
- **Small add-on**: Breakpoint detector for integration risks

### Success Metrics
- Time: 3-4h → 1.5-2h (50-65% reduction)
- Iterations: 4-5 → 1-2
- Integration issues caught: After implementation → During planning

---

## Pattern 4: Extracting Shared Utility

### Symptoms
- Code is duplicated in 3-4 places
- Need to extract common logic + update callers
- Ensure tests still pass
- Current approach: Manual extraction + testing (1-1.5 hours)

### Current Workflow
```
1. Agent finds duplicate code (manual search)
2. Agent creates utility function
3. Agent updates callers (manual edits)
4. Agent runs tests to find failures
5. Agent fixes import/usage issues
Time: 1-1.5 hours
```

### Optimized Workflow (With Enhancement #1)
```
1. Agent finds duplicate code:
   # More efficient search with semantic index
   node js-scan.js --pattern "similar-code-blocks" \
     --similarity-threshold 0.85 \
     --json
   
   Returns: Code blocks with high similarity scores

2. Agent extracts utility:
   # Tool suggests best location for utility
   node tools/dev/extract-utility.js \
     --from src/file1.js:10-20 \
     --also-in src/file2.js:45-55 \
     --also-in src/file3.js:120-130 \
     --suggest-location

3. Agent updates all callers atomically:
   # One batch edit updates all files
   node js-edit.js --changes batch.json --atomic

4. Runs tests (tests automatically find issues)

Time: 30-45 minutes (50-60% reduction)
```

### Specific Tool Improvements Needed
- **Enhancement #1** (Semantic Index): Need similarity-based pattern matching
- **Small add-on**: Extract utility suggestion engine

### Success Metrics
- Time: 1-1.5h → 30-45 min (50-60% reduction)
- Errors: 1-2 broken imports → 0
- Iterations: 2-3 → 1

---

## Pattern 5: Fixing a Bug with Ripple Analysis

### Symptoms
- Bug identified in core function
- Need to understand who uses it
- Risk of side effects in dependent code
- Current approach: Manual ripple analysis (45-60 min)

### Current Workflow
```
1. Agent finds bug location
2. Agent searches for callers (multiple searches)
3. Agent reads each caller context
4. Agent assesses impact
5. Agent writes fix
6. Agent tests fix + all callers
Time: 45-60 minutes
```

### Optimized Workflow (With Enhancement #1 + #4)
```
1. Agent runs ripple analysis query:
   node js-scan.js --ripple-analyze "src/bug/location.js:line:col" \
     --depth 3 \
     --json
   
   Returns: Structured impact assessment
   {
     "direct_callers": 5,
     "transitive_callers": 12,
     "external_modules_affected": 3,
     "tests_affected": 8,
     "critical_paths": [...]
   }

2. Agent chains analysis (Enhancement #4):
   # Pipeline runs:
   # - Ripple analysis
   # - Extract affected test patterns
   # - Identify integration points
   
   node tools/dev/analysis-pipeline.js --plan debug_pipeline.json

3. Agent understands full impact upfront:
   - Can't miss dependent code
   - Knows which tests to run first
   - Prepared for side effects

4. Agent writes fix + tests
5. Runs only affected tests (not full suite)

Time: 20-30 minutes (50-60% reduction)
```

### Specific Tool Improvements Needed
- **Enhancement #1** (Semantic Index): Critical for accurate ripple analysis
- **Enhancement #4** (Pipeline Chains): Nice-to-have for integrated impact view

### Success Metrics
- Time: 45-60 min → 20-30 min (50-60% reduction)
- Missed dependencies: 1-2 → 0
- Regression bugs: Rare → None

---

## Pattern 6: Converting Between Formats/Patterns

### Symptoms
- Converting callback-based code to promises
- Converting promises to async/await
- Updating from old pattern to new pattern
- Multiple files (20+)
- Current approach: Manual transformation + testing (2+ hours)

### Current Workflow
```
1. Agent searches for pattern to convert
2. Agent manually transforms each occurrence
3. Agent tests each transformation
4. Agent fixes errors
Time: 2+ hours
```

### Optimized Workflow (With Enhancement #1 + #3)
```
1. Agent finds transformation workflow:
   node tools/dev/workflow-registry.js \
     --search "callback to promise" \
     --category "refactoring" --json

2. Workflow includes:
   - Pattern to search for (AST-based, not regex)
   - Transformation rules
   - Test patterns to apply
   - Known gotchas

3. Agent runs pattern search (Enhancement #1):
   node js-scan.js --pattern "callback-pattern" --json
   
   Returns: All matches with high precision

4. Agent applies transformation batch:
   node js-edit.js --recipe "callback-to-promise" \
     --from pattern_results.json \
     --atomic --dry-run

5. Verify with dry-run, then apply

Time: 40-50 minutes (60-70% reduction)
```

### Specific Tool Improvements Needed
- **Enhancement #1** (Semantic Index): Need reliable pattern matching
- **Enhancement #3** (Workflow Registry): Transformation recipes
- **Small add-on**: Recipe engine for common transformations

### Success Metrics
- Time: 2h → 40-50 min (60-70% reduction)
- Errors: 3-5 → 0
- Completeness: 95% → 100%

---

## Pattern 7: Dependency Injection / Constructor Injection Refactoring

### Symptoms
- Convert global references to injected dependencies
- 10+ constructor signatures to update
- 20+ call sites to update
- High risk of breaking changes
- Current approach: Very careful manual work (2-3 hours)

### Current Workflow
```
1. Agent maps current state (reads files)
2. Agent creates new constructor signatures
3. Agent updates call sites (manual edits)
4. Agent runs tests to find failures
5. Agent fixes remaining issues
Time: 2-3 hours
```

### Optimized Workflow (With Enhancement #1 + #2 + #4)
```
1. Agent builds dependency injection plan:
   # Query semantic index
   node js-scan.js --analyze-construction "src/service.js" \
     --identify-globals \
     --json
   
   Returns: All global refs + injection points

2. Agent chains analysis (Enhancement #4):
   # Pipeline runs:
   # - Current constructor analysis
   # - Call site analysis
   # - Impact assessment
   
   node tools/dev/analysis-pipeline.js --plan di_pipeline.json

3. Agent prepares transformation batch:
   # Update constructors atomically
   # Update call sites atomically
   
   node js-edit.js --changes changes.json --dry-run --show-conflicts

4. Dry-run reveals conflicts (Enhancement #2)
5. Apply atomically with offset tracking

Time: 60-90 minutes (40-50% reduction)
```

### Specific Tool Improvements Needed
- **Enhancement #1** (Semantic Index): For construction pattern analysis
- **Enhancement #2** (Batch Editor): For confident multi-file updates
- **Enhancement #4** (Pipeline Chains): For integrated analysis

### Success Metrics
- Time: 2-3h → 60-90 min (40-50% reduction)
- Errors: 2-3 broken refs → 0
- Confidence in changes: Low → High

---

## Pattern 8: Performance Optimization (N+1, Lazy Loading, etc.)

### Symptoms
- Performance bug identified (N+1 queries, inefficient loops)
- Need to find all similar patterns
- Verify fix doesn't break anything
- Current approach: Semi-manual optimization (1.5-2 hours)

### Current Workflow
```
1. Agent finds performance problem
2. Agent searches for similar patterns
3. Agent manually optimizes each occurrence
4. Agent benchmarks changes
5. Agent verifies no regressions
Time: 1.5-2 hours
```

### Optimized Workflow (With Enhancement #1 + #3)
```
1. Agent finds performance pattern:
   node js-scan.js --pattern "n-plus-1-query" \
     --context "database" \
     --json
   
   Returns: All N+1 patterns with context

2. Agent looks up optimization workflow:
   node tools/dev/workflow-registry.js \
     --search "n-plus-1" \
     --category "performance" --json

3. Workflow includes:
   - Optimization patterns
   - Batch query examples
   - Verification benchmarks

4. Agent applies optimizations:
   node js-edit.js --recipe "optimize-n-plus-1" \
     --from results.json \
     --include-benchmark-tests

5. Runs targeted benchmarks (not full suite)

Time: 45-60 minutes (50% reduction)
```

### Specific Tool Improvements Needed
- **Enhancement #1** (Semantic Index): For performance anti-pattern detection
- **Enhancement #3** (Workflow Registry): Best practices library
- **Small add-on**: Anti-pattern matcher for common perf issues

### Success Metrics
- Time: 1.5-2h → 45-60 min (50% reduction)
- Optimization completeness: 80% → 95%+
- Regressions: 1-2 → 0

---

## Pattern 9: Adding Comprehensive Error Handling

### Symptoms
- Function has no error handling
- Need to add error handling across codebase consistently
- Different error types need different handling
- Current approach: Manual additions + testing (1-1.5 hours)

### Current Workflow
```
1. Agent identifies functions needing error handling
2. Agent adds try/catch blocks manually
3. Agent adds error logging
4. Agent adds error testing
5. Agent verifies consistent patterns
Time: 1-1.5 hours
```

### Optimized Workflow (With Enhancement #1 + #3)
```
1. Agent finds functions needing error handling:
   node js-scan.js --pattern "function-without-error-handling" \
     --json
   
   Returns: All candidates with severity

2. Agent queries error handling workflow:
   node tools/dev/workflow-registry.js \
     --search "error handling" \
     --category "reliability" --json

3. Workflow includes:
   - Consistent error handling template
   - Error logging pattern
   - Test pattern for errors

4. Agent applies transformation:
   node js-edit.js --recipe "add-error-handling" \
     --from results.json \
     --use-template "standard-errors"

5. Verifies consistent pattern across codebase

Time: 30-40 minutes (50-60% reduction)
```

### Specific Tool Improvements Needed
- **Enhancement #1** (Semantic Index): For error handling pattern detection
- **Enhancement #3** (Workflow Registry): Error handling templates
- **Small add-on**: Error handling pattern matcher

### Success Metrics
- Time: 1-1.5h → 30-40 min (50-60% reduction)
- Consistency: 70% → 98%+
- Error coverage: 60% → 95%+

---

## Pattern 10: Code Reorg / File Restructuring

### Symptoms
- Reorganizing module structure (move files, rename directories)
- 30+ files affected
- Complex import patterns
- Current approach: High-risk manual work (1.5-2 hours + anxiety)

### Current Workflow
```
1. Agent plans new structure
2. Agent moves files (manual work)
3. Agent fixes import errors (multiple rounds)
4. Agent tests and debugs
5. Agent may discover circular dependencies
Time: 1.5-2 hours + risk
```

### Optimized Workflow (With Enhancement #1 + #2)
```
1. Agent plans new structure
2. Agent uses semantic index to understand current structure:
   node js-scan.js --build-import-graph \
     --include "src/**" \
     --analyze-structure --json
   
   Returns: Current structure + import patterns

3. Agent simulates restructure:
   node tools/dev/simulate-restructure.js \
     --plan restructure.json \
     --check-circular-deps \
     --check-import-paths \
     --json
   
   Returns: All issues before making changes

4. Agent fixes issues in plan
5. Agent applies restructure (with dry-run validation)
6. Runs tests

Time: 50-60 minutes (40-50% reduction)
```

### Specific Tool Improvements Needed
- **Enhancement #1** (Semantic Index): For accurate import graph
- **Small add-on**: Restructure simulator + validation

### Success Metrics
- Time: 1.5-2h → 50-60 min (40-50% reduction)
- Circular dep issues: 0-1 → 0
- Import errors: 5-10 → 0
- Risk: High → Low

---

## Pattern 11: Writing Integration Tests for New Feature

### Symptoms
- Feature implemented but no integration tests
- Need tests covering major paths
- Should verify interactions between components
- Current approach: Manual test writing (1-2 hours)

### Current Workflow
```
1. Agent understands feature
2. Agent identifies test scenarios
3. Agent writes tests manually
4. Agent runs tests + debugs failures
5. Agent adds missing scenarios
Time: 1-2 hours
```

### Optimized Workflow (With Enhancement #3 + #4)
```
1. Agent finds testing workflow:
   node tools/dev/workflow-registry.js \
     --search "integration test" \
     --difficulty "intermediate" --json

2. Workflow includes:
   - Test structure/patterns
   - Mocking examples
   - Assertion patterns
   - Coverage benchmarks

3. Agent chains analysis (Enhancement #4):
   # Pipeline analyzes:
   # - Feature dependencies
   # - Integration points
   # - Required test scenarios
   
   node tools/dev/analysis-pipeline.js --plan test_pipeline.json

4. Agent gets test template:
   # Pre-filled with identified scenarios
   node tools/dev/generate-test-outline.js \
     --for-feature "feature_name" \
     --json

5. Agent fills in test implementations
6. Runs tests

Time: 40-50 minutes (50-60% reduction)
```

### Specific Tool Improvements Needed
- **Enhancement #3** (Workflow Registry): Test templates
- **Enhancement #4** (Pipeline Chains): Scenario identification
- **Small add-on**: Test outline generator

### Success Metrics
- Time: 1-2h → 40-50 min (50-60% reduction)
- Scenario coverage: 60% → 90%+
- Test clarity: Average → High

---

## Pattern 12: Documenting Complex System

### Symptoms
- Complex system has little documentation
- Need to generate architecture docs + module docs
- Should include diagrams + flow descriptions
- Current approach: Very manual (2-3+ hours)

### Current Workflow
```
1. Agent reads code extensively
2. Agent creates diagrams manually
3. Agent writes descriptions
4. Agent creates documentation structure
Time: 2-3+ hours
```

### Optimized Workflow (With Enhancement #1 + #4)
```
1. Agent chains analysis (Enhancement #4):
   # Pipeline extracts:
   # - Module structure
   # - Dependencies
   # - Public APIs
   # - Data flows
   
   node tools/dev/analysis-pipeline.js --plan doc_pipeline.json \
     --generate-doc-outline

2. Agent gets generated doc skeleton:
   {
     "modules": [...],
     "dependencies": [...],
     "data_flows": [...],
     "public_apis": [...],
     "suggested_diagrams": [...]
   }

3. Agent adds narrative explanation + examples
4. Generate diagrams from analysis
5. Build documentation site

Time: 1-1.5 hours (50% reduction)
```

### Specific Tool Improvements Needed
- **Enhancement #1** (Semantic Index): For accurate analysis
- **Enhancement #4** (Pipeline Chains): For doc extraction
- **Small add-on**: Doc generator from analysis

### Success Metrics
- Time: 2-3h → 1-1.5h (50% reduction)
- Documentation completeness: 70% → 95%+
- Accuracy: High
- Maintenance: Automated from code

---

## Summary Table: Impact by Enhancement

| Enhancement | Pattern Impact | Average Time Savings | Adoption Rate |
|-------------|----------------|----------------------|---------------|
| **#1 Semantic Index** | Patterns 1,2,4,5,6,8,9,10,12 | 50-80% | 80%+ |
| **#2 Batch Editor** | Patterns 1,2,3,7,10 | 40-60% | 90%+ |
| **#3 Workflow Registry** | Patterns 2,3,6,8,11 | 30-50% | 85%+ |
| **#4 Pipeline Chains** | Patterns 2,3,5,7,11,12 | 40-60% | 70%+ |

---

## Recommended Prioritization

### Phase 1 (Quick Wins): Enhancements #1 + #2
- **Affects**: 8-10 common patterns
- **Time savings**: 50-80% on average
- **Effort**: 11-15 hours
- **ROI**: 20:1+

### Phase 2 (Scaling): Enhancements #3 + #4
- **Affects**: 8-12 patterns
- **Time savings**: 30-60% additional
- **Effort**: 8-10 hours
- **ROI**: 15:1+

---

## Measuring Success

For each workflow, track:
1. **Time to completion** (baseline vs. optimized)
2. **Error rate** (bugs, missed files, etc.)
3. **Agent iterations** (times tool/test loop runs)
4. **Code quality** (regressions, test coverage)
5. **Adoption** (% of agents using new patterns)

---

_This document should be updated quarterly as new patterns emerge and enhancements are implemented._
