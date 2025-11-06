# Phase 2: Crawl Facade — Sequence Orchestration & CLI Integration

**Implementation Plan Document**  
**Date:** November 6, 2025  
**Status:** Active Implementation  
**Phase:** 2 — Sequence Orchestration & CLI Integration

---

## Executive Summary

Phase 2 builds on Phase 1's CrawlOperations facade by introducing reusable sequence presets, host-aware configuration loading, and a dedicated CLI surface for high-level crawl orchestration. This phase enables operators to script multi-step crawl workflows declaratively while maintaining full backward compatibility with existing crawl infrastructure.

**Key Deliverables:**
- Task 2.2: Sequence preset library (`src/crawler/operations/sequencePresets.js`)
- Task 2.3: CLI entry surface (`src/tools/crawl-operations.js`)
- Task 2.4: Configuration & playbook integration (`src/crawler/operations/sequenceContext.js`)
- Task 2.5: Comprehensive tests & documentation

**Timeline:** 4-5 implementation cycles with continuous validation
**Risk Level:** Medium (integration with existing playbook services)

---

## Phase 2 Task Breakdown

### Task 2.2: Sequence Library Implementation

**Objective:** Define reusable sequence presets that wrap the orchestration runner with curated step lists and default overrides.

**Current State:**
- `CrawlOperations` facade exists with 6 registered operations (✅ Phase 1 complete)
- `CrawlSequenceRunner` can execute step arrays but requires manual composition
- No catalog of domain-specific workflows exists

**Design:**
```javascript
// src/crawler/operations/sequencePresets.js
const SEQUENCE_PRESETS = {
  ensureCountryStructure: {
    name: 'ensureCountryStructure',
    label: 'Ensure Country Hub Structure',
    description: 'Establishes baseline country hub structure with ensure → explore → topic discovery',
    steps: [
      { id: 's1', operation: 'ensureCountryHubs', label: 'Ensure country hubs exist' },
      { id: 's2', operation: 'exploreCountryHubs', label: 'Explore discovered hubs' },
      { id: 's3', operation: 'findTopicHubs', label: 'Discover topic hubs' }
    ],
    continueOnError: false,
    defaultStartUrl: null // Caller must provide
  },
  
  countryExploration: {
    name: 'countryExploration',
    label: 'Country Hub Exploration',
    description: 'Deep exploration of country hubs with history refresh',
    steps: [
      { id: 's1', operation: 'exploreCountryHubs', label: 'Explore hubs' },
      { id: 's2', operation: 'crawlCountryHubsHistory', label: 'Refresh hub history' }
    ],
    continueOnError: false
  },
  
  historyRefresh: {
    name: 'historyRefresh',
    label: 'History Refresh',
    description: 'Crawl history for all discovered hubs',
    steps: [
      { id: 's1', operation: 'crawlCountryHubsHistory', label: 'Refresh history' }
    ],
    continueOnError: false
  },
  
  topicDiscovery: {
    name: 'topicDiscovery',
    label: 'Topic Hub Discovery',
    description: 'Find topic hubs after country structure established',
    steps: [
      { id: 's1', operation: 'findTopicHubs', label: 'Discover topics' }
    ],
    continueOnError: false
  },
  
  fullDiscovery: {
    name: 'fullDiscovery',
    label: 'Full Place & Topic Discovery',
    description: 'Complete discovery workflow: ensure → explore → history → topics',
    steps: [
      { id: 's1', operation: 'ensureCountryHubs', label: 'Ensure hubs' },
      { id: 's2', operation: 'exploreCountryHubs', label: 'Explore hubs' },
      { id: 's3', operation: 'crawlCountryHubsHistory', label: 'History refresh' },
      { id: 's4', operation: 'findPlaceAndTopicHubs', label: 'Discover all hubs' }
    ],
    continueOnError: false
  }
};

// Public API
function listSequencePresets() {
  return Object.keys(SEQUENCE_PRESETS);
}

function getSequencePreset(name) {
  return SEQUENCE_PRESETS[name] || null;
}

function resolveSequencePreset(name, { startUrl, sharedOverrides, continueOnError, stepOverrides } = {}) {
  const preset = SEQUENCE_PRESETS[name];
  if (!preset) {
    throw new Error(`Unknown sequence preset: ${name}`);
  }
  
  return {
    preset,
    sequence: preset.steps,
    startUrl: startUrl || preset.defaultStartUrl,
    sharedOverrides: sharedOverrides || {},
    continueOnError: continueOnError !== undefined ? continueOnError : preset.continueOnError,
    stepOverrides: stepOverrides || {},
    metadata: {
      type: 'builtin-preset',
      name: preset.name,
      label: preset.label,
      description: preset.description
    }
  };
}

module.exports = {
  listSequencePresets,
  getSequencePreset,
  resolveSequencePreset,
  SEQUENCE_PRESETS // For testing
};
```

**Implementation Steps:**
1. Create `src/crawler/operations/sequencePresets.js` with 5 initial presets
2. Add exports to `src/crawler/operations/index.js`
3. Wire presets into `CrawlOperations` via `runSequencePreset(name, options)` method
4. Add unit tests in `src/crawler/operations/__tests__/sequencePresets.test.js`

**Validation:**
```bash
# Unit tests
npx jest --config jest.careful.config.js --runTestsByPath src/crawler/operations/__tests__/sequencePresets.test.js --bail=1 --maxWorkers=50%

# Smoke test facade integration
node -e "
const { CrawlOperations } = require('./src/crawler/CrawlOperations');
const facade = new CrawlOperations();
console.log('Presets:', facade.listSequencePresets());
console.log('Preset:', facade.getSequencePreset('ensureCountryStructure'));
"
```

**Dependencies:**
- ✅ CrawlOperations facade (Phase 1)
- ✅ CrawlSequenceRunner (Phase 1)
- Operation registry with 6 operations (Phase 1)

---

### Task 2.3: CLI Entry Surface

**Objective:** Create `src/tools/crawl-operations.js` following CliArgumentParser/CliFormatter patterns to expose facade operations and sequences via command-line.

**Current State:**
- Existing CLI pattern established in other tools (db-schema.js, hub-guesser.js, etc.)
- CliArgumentParser and CliFormatter available and mature
- No crawl-specific CLI exists outside monolithic `src/crawl.js`

**Design:**
```javascript
// src/tools/crawl-operations.js
#!/usr/bin/env node
'use strict';

const { CliArgumentParser } = require('../cli/ArgumentParser');
const { CliFormatter } = require('../cli/Formatter');
const { CrawlOperations } = require('../crawler/CrawlOperations');

const parser = new CliArgumentParser({
  programName: 'crawl-operations',
  description: 'High-level crawl orchestration tool for executing operations and sequences'
});

// Define arguments
parser.addArgument('operation', {
  description: 'Operation or sequence preset name (e.g., "ensureCountryHubs", "fullDiscovery")',
  required: false
});

parser.addOption('--list-operations', {
  type: 'boolean',
  description: 'List all available operations'
});

parser.addOption('--list-sequences', {
  type: 'boolean',
  description: 'List all available sequence presets'
});

parser.addOption('--start-url', {
  type: 'string',
  description: 'Starting URL for crawl (required for most operations)'
});

parser.addOption('--overrides', {
  type: 'json',
  description: 'JSON object with option overrides (e.g., \'{"maxDepth":2}\')'
});

parser.addOption('--continue-on-error', {
  type: 'boolean',
  description: 'Continue sequence execution if steps fail',
  defaultValue: false
});

parser.addOption('--summary-format', {
  type: 'choice',
  choices: ['table', 'json'],
  defaultValue: 'table',
  description: 'Output format'
});

parser.addOption('--json', {
  type: 'boolean',
  description: 'Output JSON (alias for --summary-format json)'
});

parser.addOption('--quiet', {
  type: 'boolean',
  description: 'Suppress progress messages'
});

async function main() {
  const args = parser.parse(process.argv.slice(2));
  const formatter = new CliFormatter({ colors: !args.quiet });
  
  const facade = new CrawlOperations({
    logger: args.quiet ? { log: () => {}, error: console.error } : console
  });
  
  // List operations
  if (args['list-operations']) {
    const operations = facade.listOperations();
    if (args.json) {
      console.log(JSON.stringify({ operations }, null, 2));
    } else {
      formatter.printTable(
        operations.map((name, idx) => ({
          '#': idx + 1,
          'Operation': name,
          'Preset': facade.getOperationPreset(name)?.label || '-'
        })),
        { title: 'Available Crawl Operations' }
      );
    }
    return;
  }
  
  // List sequences
  if (args['list-sequences']) {
    const sequences = facade.listSequencePresets();
    if (args.json) {
      console.log(JSON.stringify({ sequences }, null, 2));
    } else {
      formatter.printTable(
        sequences.map((name, idx) => {
          const preset = facade.getSequencePreset(name);
          return {
            '#': idx + 1,
            'Sequence': name,
            'Label': preset?.label || name,
            'Steps': preset?.steps?.length || 0
          };
        }),
        { title: 'Available Sequence Presets' }
      );
    }
    return;
  }
  
  // Execute operation/sequence
  if (!args.operation) {
    parser.showHelp();
    process.exit(1);
  }
  
  if (!args['start-url']) {
    formatter.error('--start-url is required for operation execution');
    process.exit(1);
  }
  
  const operation = args.operation;
  const startUrl = args['start-url'];
  const overrides = args.overrides || {};
  
  // Check if it's a sequence preset
  const isSequence = facade.listSequencePresets().includes(operation);
  
  let result;
  try {
    if (isSequence) {
      if (!args.quiet) {
        formatter.info(`Executing sequence: ${operation}`);
      }
      result = await facade.runSequencePreset(operation, {
        startUrl,
        sharedOverrides: overrides,
        continueOnError: args['continue-on-error']
      });
    } else {
      // Single operation
      if (!args.quiet) {
        formatter.info(`Executing operation: ${operation}`);
      }
      const operationFn = facade[operation];
      if (!operationFn) {
        formatter.error(`Unknown operation: ${operation}`);
        process.exit(1);
      }
      result = await operationFn(startUrl, overrides);
    }
    
    // Output results
    if (args.json || args['summary-format'] === 'json') {
      console.log(JSON.stringify(result, null, 2));
    } else {
      formatter.success('Operation completed');
      if (isSequence && result.steps) {
        formatter.printTable(
          result.steps.map((step) => ({
            'Step': step.label || step.operation,
            'Status': step.status,
            'Duration': `${step.elapsedMs}ms`,
            'Error': step.error?.message || '-'
          })),
          { title: 'Sequence Steps' }
        );
      }
      formatter.printKeyValue({
        'Status': result.status,
        'Duration': `${result.elapsedMs}ms`,
        'Domain': result.domain || '-',
        'Pages Crawled': result.pagesCrawled || '-'
      });
    }
  } catch (err) {
    formatter.error(`Execution failed: ${err.message}`);
    if (!args.quiet) {
      console.error(err.stack);
    }
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}

module.exports = { main };
```

**Implementation Steps:**
1. Create `src/tools/crawl-operations.js` with CLI scaffolding
2. Implement list operations/sequences commands
3. Implement single operation execution
4. Implement sequence execution
5. Add unit tests in `src/tools/__tests__/crawl-operations.test.js`

**Validation:**
```bash
# Help output
node src/tools/crawl-operations.js --help

# List operations
node src/tools/crawl-operations.js --list-operations
node src/tools/crawl-operations.js --list-operations --json

# List sequences
node src/tools/crawl-operations.js --list-sequences

# Execute single operation
node src/tools/crawl-operations.js ensureCountryHubs --start-url https://www.theguardian.com --overrides '{"maxDepth":1}'

# Execute sequence
node src/tools/crawl-operations.js fullDiscovery --start-url https://www.theguardian.com --continue-on-error
```

---

### Task 2.4: Configuration & Playbook Integration

**Objective:** Allow sequences to pull host-specific context (start URL derivation, planner verbosity) from CrawlPlaybookService without duplicating logic.

**Current State:**
- `CrawlPlaybookService` exists with domain knowledge, retry policies, avoidance rules
- No integration between playbook service and facade exists
- Start URLs are currently hard-coded in operation invocations

**Design:**
```javascript
// src/crawler/operations/sequenceContext.js
'use strict';

const { CrawlPlaybookService } = require('../CrawlPlaybookService');

/**
 * Adapter for pulling host-specific configuration from playbook service
 */
class SequenceContextAdapter {
  constructor({ playbookService, dbPath } = {}) {
    this._playbook = playbookService || (dbPath ? new CrawlPlaybookService(dbPath) : null);
  }
  
  /**
   * Resolve canonical start URL for a domain
   */
  async resolveStartUrl(domain) {
    if (!this._playbook) {
      return null;
    }
    
    // Query playbook for canonical start URL
    const playbookEntry = await this._playbook.getPlaybookForDomain(domain);
    return playbookEntry?.startUrl || `https://${domain}`;
  }
  
  /**
   * Get domain-specific planner verbosity
   */
  async getPlannerVerbosity(domain) {
    if (!this._playbook) {
      return 'normal';
    }
    
    const playbookEntry = await this._playbook.getPlaybookForDomain(domain);
    return playbookEntry?.plannerVerbosity || 'normal';
  }
  
  /**
   * Get domain-specific retry budget
   */
  async getRetryBudget(domain) {
    if (!this._playbook) {
      return 3;
    }
    
    const playbookEntry = await this._playbook.getPlaybookForDomain(domain);
    return playbookEntry?.retryBudget || 3;
  }
  
  /**
   * Check if domain is in avoidance list
   */
  async shouldAvoidDomain(domain) {
    if (!this._playbook) {
      return false;
    }
    
    return this._playbook.isDomainAvoided(domain);
  }
  
  /**
   * Get all playbook hints for a domain
   */
  async getPlaybookHints(domain) {
    if (!this._playbook) {
      return {};
    }
    
    const entry = await this._playbook.getPlaybookForDomain(domain);
    return {
      startUrl: entry?.startUrl,
      plannerVerbosity: entry?.plannerVerbosity,
      retryBudget: entry?.retryBudget,
      avoided: await this.shouldAvoidDomain(domain),
      customFlags: entry?.customFlags || {}
    };
  }
  
  dispose() {
    if (this._playbook && typeof this._playbook.dispose === 'function') {
      this._playbook.dispose();
    }
  }
}

/**
 * Factory for creating context adapters
 */
function createSequenceContext({ dbPath, playbookService } = {}) {
  return new SequenceContextAdapter({ dbPath, playbookService });
}

module.exports = {
  SequenceContextAdapter,
  createSequenceContext
};
```

**Implementation Steps:**
1. Create `src/crawler/operations/sequenceContext.js`
2. Add optional playbook integration to CLI tool via `--db-path` flag
3. Extend sequence presets to accept context adapter
4. Update `CrawlOperations` to accept context adapter in constructor
5. Add unit tests mocking playbook service

**Validation:**
```bash
# Without playbook (uses defaults)
node src/tools/crawl-operations.js ensureCountryHubs --start-url https://www.theguardian.com

# With playbook integration
node src/tools/crawl-operations.js ensureCountryHubs --start-url https://www.theguardian.com --db-path ./data/news.db
```

---

### Task 2.5: Tests & Documentation

**Objective:** Comprehensive test coverage and developer documentation for Phase 2 deliverables.

**Test Coverage Plan:**

1. **Sequence Presets Tests** (`src/crawler/operations/__tests__/sequencePresets.test.js`)
   - List all presets
   - Get individual preset by name
   - Resolve preset with overrides
   - Error handling for unknown presets

2. **CLI Tool Tests** (`src/tools/__tests__/crawl-operations.test.js`)
   - Help output validation
   - List operations/sequences
   - Execute operation with mocked facade
   - Execute sequence with mocked facade
   - JSON output format
   - Error handling

3. **Context Adapter Tests** (`src/crawler/operations/__tests__/sequenceContext.test.js`)
   - Resolve start URL from playbook
   - Get planner verbosity
   - Get retry budget
   - Domain avoidance checking
   - Graceful fallback when playbook unavailable

4. **Integration Tests** (`src/crawler/__tests__/CrawlOperations.integration.test.js`)
   - End-to-end sequence execution with stubbed crawler
   - Playbook integration with real service
   - CLI invocation via spawn

**Documentation Updates:**

1. **docs/CLI_REFACTORING_QUICK_START.md**
   - Add section: "High-Level Crawl Orchestration"
   - Document crawl-operations CLI usage
   - Provide sequence preset examples
   - Explain playbook integration

2. **docs/ARCHITECTURE_CRAWLS_VS_BACKGROUND_TASKS.md**
   - Update "High-Level Crawl Operations" section
   - Document sequence preset catalog
   - Explain context adapter pattern

3. **docs/CLI_REFACTORING_TASKS.md**
   - Mark Phase 2 tasks complete with verification commands

4. **docs/CHANGE_PLAN.md**
   - Update Phase 2 task ledger
   - Record completion timestamps

---

## Implementation Timeline

**Cycle 1: Task 2.2 (Sequence Library)** — 1-2 hours
- Create sequencePresets.js
- Add 5 initial presets
- Wire into CrawlOperations facade
- Unit tests

**Cycle 2: Task 2.3 (CLI Surface)** — 2-3 hours
- Create crawl-operations.js CLI
- Implement list commands
- Implement execute commands
- Unit tests with mocked facade

**Cycle 3: Task 2.4 (Context Adapter)** — 2-3 hours
- Create sequenceContext.js
- Integrate with CLI (--db-path flag)
- Update facade to accept adapter
- Unit tests with mocked playbook

**Cycle 4: Task 2.5 (Tests & Docs)** — 2-3 hours
- Complete test coverage
- Integration tests
- Documentation updates
- Final validation

**Total Estimate:** 7-11 hours of implementation time

---

## Risk Assessment & Mitigations

### High Risk Items

1. **Playbook Service Integration**
   - **Risk:** Async playbook lookups could delay sequence execution
   - **Mitigation:** Make context adapter optional, cache lookups, provide explicit fallbacks

2. **CLI Flag Complexity**
   - **Risk:** Too many flags could confuse operators
   - **Mitigation:** Keep CLI surface minimal, provide sensible defaults, comprehensive help text

3. **Sequence Step Failure Handling**
   - **Risk:** Unclear behavior when steps fail mid-sequence
   - **Mitigation:** Document continueOnError clearly, provide detailed step results

### Medium Risk Items

1. **Test Coverage Gaps**
   - **Risk:** Complex sequence scenarios might not be covered
   - **Mitigation:** Prioritize integration tests, use real playbook service in targeted tests

2. **Documentation Drift**
   - **Risk:** Docs might not reflect actual behavior
   - **Mitigation:** Update docs incrementally with implementation, validate examples

---

## Success Criteria

### Task 2.2 Complete When:
- ✅ 5 sequence presets defined and tested
- ✅ Presets accessible via CrawlOperations facade
- ✅ Unit tests passing

### Task 2.3 Complete When:
- ✅ CLI tool implements help/list/execute commands
- ✅ JSON and table output formats working
- ✅ Unit tests passing with mocked facade

### Task 2.4 Complete When:
- ✅ Context adapter resolves playbook hints
- ✅ CLI integrates via --db-path flag
- ✅ Unit tests passing with mocked playbook

### Task 2.5 Complete When:
- ✅ All unit tests passing (>90% coverage)
- ✅ Integration tests verify end-to-end flows
- ✅ Documentation updated and accurate

### Phase 2 Complete When:
- ✅ All 4 tasks complete
- ✅ Smoke tests validate CLI usage
- ✅ CHANGE_PLAN.md and CLI_REFACTORING_TASKS.md updated
- ✅ No regressions in existing crawler functionality

---

## Validation Commands Reference

```bash
# Phase 2.2 Validation
npx jest --config jest.careful.config.js --runTestsByPath src/crawler/operations/__tests__/sequencePresets.test.js --bail=1 --maxWorkers=50%

# Phase 2.3 Validation
node src/tools/crawl-operations.js --help
node src/tools/crawl-operations.js --list-operations
node src/tools/crawl-operations.js --list-sequences
npx jest --config jest.careful.config.js --runTestsByPath src/tools/__tests__/crawl-operations.test.js --bail=1 --maxWorkers=50%

# Phase 2.4 Validation
npx jest --config jest.careful.config.js --runTestsByPath src/crawler/operations/__tests__/sequenceContext.test.js --bail=1 --maxWorkers=50%

# Phase 2.5 Validation
npx jest --config jest.careful.config.js --runTestsByPath src/crawler/__tests__/CrawlOperations.integration.test.js --bail=1 --maxWorkers=50%

# Full Phase 2 Validation
npx jest --config jest.careful.config.js --testPathPattern="(sequencePresets|crawl-operations|sequenceContext|CrawlOperations)" --bail=1 --maxWorkers=50%
```

---

## Next Steps After Phase 2

Once Phase 2 completes:
1. **Phase 3:** Legacy Crawl CLI Modularization (Tasks 3.1-3.6)
2. **Phase 11:** NewsCrawler Service Extraction (Grok's composition pattern)
3. Continue Phase 8.5 (Schema Jest worker warning resolution)

---

**Document Version:** 1.0  
**Last Updated:** November 6, 2025  
**Author:** GitHub Copilot (GPT-5 Codex)  
**Review Status:** Ready for Implementation
