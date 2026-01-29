---
description: Breaking down complex goals into modular, testable components with refactoring focus
---

# Goal Decomposition & Modular Refactoring Workflow

This workflow takes complex, multi-part goals and systematically breaks them down, refactors for modularity, tests each piece in isolation, and then integrates with full verification.

**Core Principle**: No component should be run "for real" until it has been proven to work in isolation.

---

## Phase 1: Goal Decomposition

### 1.1 Parse the Dense Goal
1. Read the user's goal statement carefully
2. Identify EVERY distinct action/objective (even implicit ones)
3. Create a numbered list of atomic sub-goals
4. For the example: "Set up crawler + UI to ensure 500 docs per site, run analysis, get hub patterns, guess place hubs from gazetteer"
   
   Breaks down to:
   ```
   1. Crawler can be configured with per-domain document thresholds
   2. Crawler tracks document counts per domain
   3. UI displays document counts and progress toward thresholds
   4. Crawler continues until thresholds met
   5. Analysis system can be triggered on completed domains
   6. Analysis produces hub patterns
   7. Hub patterns are stored/accessible
   8. Gazetteer data is available for lookups
   9. Pattern + Gazetteer → Place hub guessing logic
   10. Country hubs are guessed first (priority)
   11. Results are visible/verifiable
   ```

### 1.2 Map Sub-Goals to Code Areas
For each sub-goal, identify:
- Which files/modules are involved
- What the input/output contract is
- What dependencies it has
- Whether it can currently be tested in isolation

Create a table in your session notes:
```markdown
| Sub-Goal | Code Areas | Can Test Alone? | Dependencies |
|----------|------------|-----------------|--------------|
| 1. Threshold config | CrawlerConfig, profiles/ | ✅ Yes | None |
| 2. Doc count tracking | NewsCrawler, MilestoneTracker | ⚠️ Partial | DB |
| 3. UI display | crawlObserver/ | ❌ No | Full server |
| ...etc |
```

### 1.3 Identify Coupled Components
1. Flag any sub-goal where "Can Test Alone?" is ❌ or ⚠️
2. These are refactoring candidates
3. Ask: "What would need to change to test this in isolation?"

---

## Phase 2: Refactoring for Isolation

### 2.1 Extract Testable Units
For each coupled component:

1. **Identify the core logic** - What's the actual computation/decision?
2. **Separate I/O from logic** - DB reads, HTTP calls, file access should be injected
3. **Create a pure function or class** that can run without side effects
4. **Move to appropriate location**:
   - Business logic → `src/services/`
   - Data access → `src/data/`
   - Utilities → `src/utils/` or `src/lib/`

Example refactor pattern:
```javascript
// BEFORE: Coupled to database
class HubGuesser {
  async guess() {
    const patterns = await db.getPatterns(); // Direct DB call
    const places = await db.getPlaces();     // Direct DB call
    return this.match(patterns, places);
  }
}

// AFTER: Testable in isolation
class HubGuesser {
  constructor({ patternProvider, placeProvider }) {
    this.patternProvider = patternProvider;
    this.placeProvider = placeProvider;
  }
  
  async guess() {
    const patterns = await this.patternProvider.getPatterns();
    const places = await this.placeProvider.getPlaces();
    return this.match(patterns, places);
  }
  
  // This can now be tested with mock providers!
  match(patterns, places) {
    // Pure logic, no I/O
  }
}
```

### 2.2 Create Standalone Test Harnesses
For each refactored component, create a test harness:

1. Location: `tools/test-harnesses/<component>-harness.js`
2. Structure:
   ```javascript
   #!/usr/bin/env node
   /**
    * Test Harness: <Component Name>
    * Purpose: Verify <component> works correctly in isolation
    * Run: node tools/test-harnesses/<component>-harness.js [--verbose]
    * 
    * Exit codes:
    *   0 = All checks passed
    *   1 = Failures detected (see output)
    */
   
   const { Component } = require('../../src/...');
   
   async function runTests() {
     console.log('=== Testing <Component> ===\n');
     
     // Test 1: Basic functionality
     console.log('Test 1: Basic functionality...');
     const result = await testBasicFunctionality();
     console.log(result.passed ? '  ✅ PASS' : '  ❌ FAIL: ' + result.error);
     
     // Test 2: Edge cases
     console.log('Test 2: Edge cases...');
     // ...
     
     // Summary
     console.log('\n=== Summary ===');
     console.log(`Passed: ${passCount}/${totalCount}`);
     
     process.exit(failCount > 0 ? 1 : 0);
   }
   
   runTests().catch(err => {
     console.error('Harness crashed:', err);
     process.exit(1);
   });
   ```

3. Each harness MUST:
   - Exit with code 0 on success, 1 on failure
   - Print clear PASS/FAIL for each test
   - Work without network, database (use mocks/fixtures)
   - Run in < 10 seconds

### 2.3 Unit Tests for Refactored Code
1. Create Jest tests: `src/<path>/__tests__/<component>.test.js`
2. Tests should cover:
   - Happy path
   - Edge cases
   - Error conditions
// turbo
3. Run: `npm test -- --findRelatedTests src/<path>/<component>.js`

---

## Phase 3: CLI Verification Tools

### 3.1 Create Status/Check CLI Commands
For each major sub-goal, create a CLI tool that verifies the state:

Location: `tools/checks/` or `src/cli/commands/`

Examples needed:
```
node tools/checks/check-doc-counts.js
  → Shows per-domain document counts, highlights those under threshold

node tools/checks/check-analysis-status.js
  → Shows which domains have been analyzed, which pending

node tools/checks/check-hub-patterns.js
  → Lists discovered hub patterns, validates format

node tools/checks/check-place-hub-guesses.js
  → Shows guessed place hubs, confidence scores
```

### 3.2 CLI Tool Standard Format
```javascript
#!/usr/bin/env node
/**
 * Check: <What it checks>
 * Run: node tools/checks/<name>.js [options]
 * 
 * Options:
 *   --json     Output as JSON for programmatic use
 *   --verbose  Show detailed information
 *   --domain   Filter to specific domain
 */

const { program } = require('commander');

program
  .option('--json', 'Output as JSON')
  .option('--verbose', 'Verbose output')
  .option('--domain <domain>', 'Filter to domain')
  .parse();

async function main() {
  const opts = program.opts();
  
  // ... check logic ...
  
  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    // Human-readable output
    console.log('=== <Check Name> ===');
    // ... formatted output ...
  }
  
  // Exit code: 0 if OK, 1 if problems found
  process.exit(hasProblems ? 1 : 0);
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
```

### 3.3 Register CLI Tools
1. Add to `package.json` scripts if frequently used
2. Document in `docs/CLI_TOOLS.md` or similar
3. Add help text accessible via `--help`

---

## Phase 4: Logging & Observability

### 4.1 Ensure Sufficient Logging
Each component should log:
- **Start/End** of major operations with timestamps
- **Counts** of items processed
- **Decisions** made (and why)
- **Errors** with full context

Check existing logging, add where missing:
```javascript
const log = require('../utils/logger');

async function processHubPatterns(patterns) {
  log.info(`Starting hub pattern processing`, { count: patterns.length });
  
  for (const pattern of patterns) {
    log.debug(`Processing pattern`, { pattern: pattern.id, type: pattern.type });
    
    try {
      const result = await process(pattern);
      log.info(`Pattern processed`, { pattern: pattern.id, matches: result.matchCount });
    } catch (err) {
      log.error(`Pattern processing failed`, { pattern: pattern.id, error: err.message });
    }
  }
  
  log.info(`Hub pattern processing complete`, { 
    processed: successCount, 
    failed: failCount 
  });
}
```

### 4.2 Create Log Analysis Tools
If logs are needed to verify success:

```javascript
// tools/logs/analyze-crawl-logs.js
// Extracts key metrics from crawler logs

// tools/logs/find-errors.js
// Scans logs for errors, groups by type
```

---

## Phase 5: Integration - Wiring Components Together

### 5.1 Create Integration Test Scenarios
After individual components work:

1. Create: `tests/integration/<feature>-integration.test.js`
2. Test components working together with real (but test) database
3. Use fixtures/seeds for reproducible state

### 5.2 End-to-End Dry Run
Before running the full goal:

1. Create dry-run mode for major operations:
   ```javascript
   if (dryRun) {
     log.info('DRY RUN: Would crawl', { domain, currentDocs, targetDocs });
     return { wouldCrawl: true, reason: 'Below threshold' };
   }
   ```

2. Run with `--dry-run` flag to see what WOULD happen
3. Verify the plan looks correct

// turbo
4. Run: `node src/cli.js crawl-to-threshold --dry-run`

---

## Phase 6: Execute Sub-Goals Sequentially

### 6.1 Execute One Sub-Goal at a Time
For each sub-goal in order:

1. **Before execution**:
   - Verify prerequisites are met (use check CLI tools)
   - Run the component's test harness
   - Note current state

2. **Execute**:
   - Run the actual operation
   - Monitor logs in real-time if possible
   - Capture output/exit codes

3. **After execution**:
   - Run verification CLI tool
   - Confirm expected state change happened
   - Document result in session notes

### 6.2 Decision Point Between Sub-Goals
After each sub-goal completes:
- If ✅ success: proceed to next sub-goal
- If ❌ failure: STOP, debug, fix, re-run test harness before retrying
- If ⚠️ partial: assess if safe to continue or need to address first

---

## Phase 7: Verification & Documentation

### 7.1 Final State Verification
Run ALL verification tools:
// turbo
```bash
node tools/checks/check-doc-counts.js
node tools/checks/check-analysis-status.js  
node tools/checks/check-hub-patterns.js
node tools/checks/check-place-hub-guesses.js
```

All should exit with code 0.

### 7.2 Document What Was Built/Changed

Update/create documentation:
1. **Architecture changes**: Update `docs/diagrams/` if module structure changed
2. **New CLI tools**: Add to `docs/CLI_TOOLS.md` or create it
3. **New services**: Update `docs/SERVICE_LAYER_GUIDE.md`
4. **Testing approach**: Document in component README or test file comments

### 7.3 Session Summary
Create comprehensive summary:
```markdown
# Session Summary: <Goal>

## Goal Decomposition
[The numbered list from Phase 1]

## Changes Made

### Refactoring
- Extracted `HubGuesser` from `NewsCrawler` for isolated testing
- Created `PatternProvider` interface for dependency injection
- ...

### New CLI Tools
- `tools/checks/check-doc-counts.js` - Verify document thresholds
- ...

### New Test Harnesses  
- `tools/test-harnesses/hub-guesser-harness.js`
- ...

## Verification Results
[Output of verification tools]

## How to Re-Run This Goal
```bash
# 1. Verify prerequisites
node tools/checks/check-doc-counts.js

# 2. Run crawler to thresholds
node src/cli.js crawl-to-threshold

# 3. Run analysis
node src/cli.js analyze-all

# ...etc
```

## Known Limitations
- ...

## Future Improvements
- ...
```

---

## Quick Reference: Refactoring Patterns

### Pattern: Extract Pure Logic
```
Coupled Method → Extract calculation part → Inject I/O parts
```

### Pattern: Interface for Testing
```
Direct dependency → Define interface → Inject implementation → Mock in tests
```

### Pattern: Composition Root
```
Wire all dependencies in one place (e.g., bootstrap.js) → Components receive deps
```

### Pattern: Feature Flags for Safe Rollout
```
if (config.features.newHubGuesser) {
  return new NewHubGuesser(deps);
} else {
  return new LegacyHubGuesser(deps);
}
```

---

## Checklist Before Marking Goal Complete

- [ ] All sub-goals identified and mapped to code
- [ ] Coupled components refactored for isolation
- [ ] Test harness exists for each major component
- [ ] CLI verification tools work (exit 0)
- [ ] Each sub-goal executed and verified individually
- [ ] Full integration tested
- [ ] Logs capture success/failure clearly
- [ ] Documentation updated
- [ ] Session summary completed
- [ ] Future agent can re-run using documented commands

---

## Example: Applying to the Crawler Goal

For: "Ensure 500 docs per site, analyze, find patterns, guess country hubs"

1. **Decompose** → 11 sub-goals (see Phase 1.1)
2. **Map** → NewsCrawler, MilestoneTracker, HubGapAnalyzer, GazetteerManager, etc.
3. **Refactor** → Extract HubGuesser, PatternMatcher as testable units
4. **CLI tools**:
   - `check-doc-counts.js` → per-domain doc status
   - `check-analysis-status.js` → which analyzed
   - `check-patterns.js` → patterns found
   - `check-hub-guesses.js` → guessed hubs
5. **Execute sequentially**:
   - First: crawl until thresholds (verify with check-doc-counts)
   - Then: run analysis (verify with check-analysis-status)
   - Then: extract patterns (verify with check-patterns)
   - Finally: guess hubs (verify with check-hub-guesses)
6. **Document** → Full session summary with re-run instructions
