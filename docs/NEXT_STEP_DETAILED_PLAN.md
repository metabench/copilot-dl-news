# Next Step Detailed Plan: Crawl Operations Sequence Library Implementation

## Overview
This document outlines the detailed plan for implementing the next step in the Crawl High-Level Facade initiative, specifically Task 2.2 - Sequence Library. This follows the completion of Task 1.x phases and the partial implementation of Task 2.3 (CLI Entry Surface).

## Current Status
As of November 4, 2025:
- CrawlOperations facade has been delivered (Phase 1 complete)
- CrawlSequenceRunner now delegates to the orchestration runner
- Sequence execution results now bubble preset metadata/context
- Task 2.1 (Discovery & Alignment) is in progress
- Task 2.2 (Sequence Library) is pending implementation
- Task 2.3 (CLI Entry Surface) has partial implementation

## Objective
Implement a reusable sequence presets library that defines domain-specific crawl algorithms (ensure → explore → topic discovery, history refresh bundles, etc.) with descriptive identifiers rather than manually scripting steps.

## Detailed Implementation Plan

### 1. Sequence Preset Registry (`src/crawler/operations/sequencePresets.js`)

#### 1.1. Define Initial Sequence Presets
Create the following named sequences in the registry:
- `ensureCountryStructure`: Focus on establishing country hub structure
- `countryExploration`: Explore discovered country hubs for deeper content
- `historyRefresh`: Refresh historical content for existing hubs
- `topicDiscovery`: Discover topic hubs within established country structures
- `fullCountryPass`: Composite sequence combining ensure → explore → topic discovery

#### 1.2. Sequence Preset Structure
Each preset should define:
- `name`: Descriptive identifier for the sequence
- `description`: Human-readable explanation of what the sequence does
- `steps`: Ordered array of operation names to execute
- `sharedOverrides`: Configuration options that apply to all steps
- `stepOverrides`: Configuration options specific to individual steps
- `continueOnError`: Boolean indicating whether to abort on step failure

Example structure:
```javascript
const sequencePresets = {
  ensureCountryStructure: {
    name: 'ensureCountryStructure',
    description: 'Ensure country hub structure is established',
    steps: ['ensureCountryHubs'],
    sharedOverrides: {
      // Common options for all steps
    },
    stepOverrides: {
      // Step-specific options
    },
    continueOnError: false
  }
};
```

### 2. Playbook Integration Adapter (`src/crawler/operations/sequenceContext.js`)

#### 2.1. Context Resolution Functions
Implement functions to fetch domain-specific context:
- `resolveStartUrl(domain)`: Get canonical start URL from playbook
- `resolvePlannerSettings(domain)`: Get planner verbosity and other settings
- `resolveRetryBudget(domain)`: Get domain-specific retry configuration

#### 2.2. Context Merging Logic
Create logic to merge playbook context with user overrides:
- User overrides should take precedence over playbook defaults
- Provide fallbacks when playbook service is unavailable
- Handle async resolution of playbook data

### 3. Configuration-as-Code Enablement

#### 3.1. Sequence Configuration Loader
Implement `src/orchestration/SequenceConfigLoader.js` to:
- Parse YAML/JSON sequence configuration files
- Validate configuration structure using AJV
- Resolve sequence references and dependencies
- Provide checksum metadata for change tracking

#### 3.2. Configuration File Structure
Define structure for files in `config/crawl-sequences/`:
```yaml
name: "country-research"
description: "Complete country hub research workflow"
continueOnError: false
steps:
  - operation: "ensureCountryHubs"
    overrides:
      depth: 1
  - operation: "exploreCountryHubs"
    overrides:
      depth: 3
  - operation: "findTopicHubs"
    overrides:
      maxTopics: 50
sharedOverrides:
  verbose: true
```

### 4. CLI Entry Point Enhancement

#### 4.1. Command Line Interface
Extend `src/tools/crawl-operations.js` to support:
- `--sequence <name>`: Execute a named sequence
- `--sequence-config <path>`: Execute a sequence from a config file
- `--list-sequences`: Display available sequences
- Preflight output showing sequence steps and configuration

#### 4.2. Validation Commands
Add validation capabilities:
- `validate --sequence <name>`: Validate a named sequence
- `validate --sequence-config <path>`: Validate a sequence config file

### 5. Implementation Steps

#### Phase 1: Foundation (Days 1-2)
1. Create `src/crawler/operations/sequencePresets.js`
2. Define initial sequence presets with basic structure
3. Implement core presets: ensureCountryStructure, countryExploration, historyRefresh
4. Add unit tests for sequence preset definitions

#### Phase 2: Playbook Integration (Days 3-4)
1. Create `src/crawler/operations/sequenceContext.js`
2. Implement context resolution functions
3. Add fallback mechanisms for when playbook service is unavailable
4. Create unit tests for context resolution and merging

#### Phase 3: Configuration Loading (Days 5-6)
1. Create `src/orchestration/SequenceConfigLoader.js`
2. Implement YAML/JSON parsing
3. Add schema validation with AJV
4. Create test fixtures for positive/negative validation cases
5. Add unit tests for config loading and validation

#### Phase 4: CLI Enhancement (Days 7-8)
1. Extend `src/tools/crawl-operations.js` with sequence support
2. Add new command line options (--sequence, --sequence-config, --list-sequences)
3. Implement preflight output for sequences
4. Add validation commands
5. Update help text and documentation

#### Phase 5: Integration & Testing (Days 9-10)
1. Update `CrawlOperations` to consume sequence presets
2. Implement sequence execution in the facade
3. Add integration tests for sequence execution
4. Run smoke tests for CLI sequence commands
5. Validate telemetry continuity in sequence results

### 6. Testing Strategy

#### 6.1. Unit Tests
- Test sequence preset definitions and structure
- Test context resolution and merging logic
- Test configuration loading and validation
- Test CLI argument parsing for sequence options

#### 6.2. Integration Tests
- Test sequence execution through the CrawlOperations facade
- Test playbook context integration
- Test configuration file execution
- Validate result payloads match expected structure

#### 6.3. Smoke Tests
- Execute CLI with various sequence options
- Verify preflight output accuracy
- Test validation commands
- Confirm error handling and continueOnError behavior

### 7. Documentation Updates

#### 7.1. Update `docs/CLI_REFACTORING_QUICK_START.md`
- Add section on sequence usage
- Include examples of sequence execution
- Document configuration file format
- Add CLI command reference for sequences

#### 7.2. Update `docs/ARCHITECTURE_CRAWLS_VS_BACKGROUND_TASKS.md`
- Add section on sequence orchestration
- Document sequence preset registry
- Explain configuration-as-code approach
- Update CLI command list

#### 7.3. Update `docs/CRAWL_REFACTORING_TASKS.md`
- Document implementation progress
- Record test results and validation outcomes
- Note any issues or deviations from plan

### 8. Risk Mitigation

#### 8.1. Playbook Latency
Risk: Synchronous sequence execution could be delayed by playbook lookups.
Mitigation: 
- Make context adapter optional
- Implement caching for playbook data
- Allow async context resolution with proper error handling

#### 8.2. CLI Compatibility
Risk: New CLI surface might conflict with existing usage patterns.
Mitigation:
- Maintain backward compatibility with existing operation invocations
- Provide clear migration path documentation
- Test with existing scripts and automation workflows

#### 8.3. Configuration Validation
Risk: Invalid configuration files could cause runtime errors.
Mitigation:
- Implement comprehensive schema validation
- Provide clear error messages for validation failures
- Include positive and negative test fixtures

### 9. Success Criteria
- Sequence presets are defined and exported
- Playbook context integration works correctly
- Configuration files can be loaded and validated
- CLI supports sequence execution with proper output
- All unit and integration tests pass
- Documentation is updated with new usage patterns
- Telemetry payloads maintain backward compatibility

### 10. Timeline
Total estimated time: 10 days
- Foundation: 2 days
- Playbook Integration: 2 days
- Configuration Loading: 2 days
- CLI Enhancement: 2 days
- Integration & Testing: 2 days

### 11. Dependencies
- Existing `CrawlOperations` facade implementation
- `CrawlSequenceRunner` delegation to orchestration runner
- `CliArgumentParser` and `CliFormatter` infrastructure
- `CrawlPlaybookService` APIs for context resolution
- AJV validation library (already present in repository)
- js-yaml library for YAML