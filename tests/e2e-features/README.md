# Specialized E2E Feature Tests (Legacy)

**When to Read**: Read this document if you are writing or running specialized end-to-end (E2E) tests. These tests are different from regular unit or integration tests and have specific requirements for logging, performance assertions, and telemetry verification. This guide explains the philosophy and structure of these tests.

## Purpose

This directory contains **specialized feature development tests** that are separate from regular unit and integration tests. These tests focus on:

1. **Precise performance requirements** (response times, throughput)
2. **Detailed telemetry flow verification**
3. **Sequential step-by-step validation**
4. **Concise, actionable output**

## Test Structure

```
tests/e2e-features/
├── instant-feedback/       # Response time and instant feedback tests
│   └── crawl-start-response.test.js
├── telemetry-flow/         # Telemetry and SSE stream tests
│   └── preparation-stages.test.js
├── geography-crawl/        # Geography-specific crawl tests
├── preparation-stages/     # Detailed preparation phase tests
└── README.md
```

## Test Philosophy

### 1. Precise Sequential Logging

Every test logs **sequential steps** with:
- Step number
- Timestamp
- Action description
- Structured data (JSON)

Example:
```javascript
const log = (step, message, data = null) => {
  const timestamp = new Date().toISOString();
  const prefix = `[${timestamp}] [Step ${step}]`;
  if (data) {
    console.log(`${prefix} ${message}:`, JSON.stringify(data, null, 2));
  } else {
    console.log(`${prefix} ${message}`);
  }
};
```

### 2. Performance Assertions

Tests specify **exact performance requirements**:
- Instant feedback: `<200ms`
- Status checks: `<50ms`
- Telemetry emission: Real-time streaming

Example:
```javascript
const startTime = Date.now();
const response = await request(app).post('/api/crawl').send({ ... });
const responseTime = Date.now() - startTime;

expect(responseTime).toBeLessThan(200);
log(4, `✓ Response time ${responseTime}ms < 200ms requirement`);
```

### 3. Telemetry Flow Verification

Tests capture and analyze:
- SSE event streams
- Preparation stage emissions
- Progress updates
- Stage transitions

Example:
```javascript
eventSource.on('planner-stage', (event) => {
  const data = JSON.parse(event.data);
  stages.push(data);
  log(4, 'Received planner-stage event', {
    type: data.type,
    status: data.status,
    durationMs: data.durationMs
  });
});
```

### 4. Concise Output

Test output is **actionable and precise**:
- ✓ Success markers
- ⚠ Warning indicators
- ✅ Final summary with key metrics
- JSON-formatted data for easy parsing

## Running Tests

### Run all specialized E2E tests:
```bash
npm run test:e2e-features
```

### Run specific feature category:
```bash
npm run test:file "instant-feedback"
npm run test:file "telemetry-flow"
npm run test:file "geography-crawl"
```

### Run individual test:
```bash
npm run test:file "crawl-start-response"
```

## Test Categories

### Instant Feedback Tests
**Directory**: `instant-feedback/`

**Focus**: Verify instant response times for user-facing operations

**Key Metrics**:
- Crawl start response: `<200ms`
- Status endpoint: `<50ms`
- Response structure completeness

**Example Test**: `crawl-start-response.test.js`

### Telemetry Flow Tests
**Directory**: `telemetry-flow/`

**Focus**: Verify real-time telemetry streaming and stage emissions

**Key Metrics**:
- SSE connection establishment time
- Stage emission completeness
- Progress event frequency
- Telemetry data structure

**Example Test**: `preparation-stages.test.js`

### Geography Crawl Tests
**Directory**: `geography-crawl/`

**Focus**: End-to-end geography crawl validation

**Key Metrics**:
- Country discovery and download
- Gazetteer data quality
- Planning stage telemetry
- Progress bar updates

### Preparation Stages Tests
**Directory**: `preparation-stages/`

**Focus**: Detailed validation of crawl preparation phases

**Key Metrics**:
- Bootstrap stage timing
- Pattern inference results
- Planning stage outputs
- Stage transition smoothness

## Writing New Specialized Tests

### Template Structure:

```javascript
'use strict';

/**
 * Specialized E2E Feature Test: [Category] - [Feature Name]
 * 
 * Purpose: [Clear description of what this test validates]
 * Target: [Specific performance or behavior target]
 * 
 * Test Philosophy:
 * - [Key testing principle 1]
 * - [Key testing principle 2]
 * - [Key testing principle 3]
 */

describe('E2E Feature: [Category] - [Feature]', () => {
  const log = (step, message, data = null) => {
    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] [Step ${step}]`;
    if (data) {
      console.log(`${prefix} ${message}:`, JSON.stringify(data, null, 2));
    } else {
      console.log(`${prefix} ${message}`);
    }
  };

  test('[Specific behavior under test]', async () => {
    log(1, 'Starting test');

    // Step 2: Setup
    log(2, 'Setup action', { details });

    // Step 3: Execute
    const startTime = Date.now();
    // ... test action ...
    const duration = Date.now() - startTime;
    log(3, 'Action completed', { durationMs: duration });

    // Step 4: Assert
    expect(duration).toBeLessThan(TARGET_MS);
    log(4, `✓ Meets performance requirement`);

    // Final summary
    log(5, '✅ Test completed', {
      summary: {
        performance: `${duration}ms < ${TARGET_MS}ms`,
        status: 'PASS'
      }
    });
  });
});
```

### Guidelines:

1. **Start with purpose**: Clear docstring explaining test goal
2. **Sequential steps**: Number and log every step
3. **Performance targets**: Specify exact timing requirements
4. **Structured data**: Use JSON for complex data logging
5. **Summary section**: Final step with key metrics
6. **Visual markers**: Use ✓, ⚠, ✅ for quick scanning

## Differences from Regular Tests

| Aspect | Regular Tests | Specialized E2E Tests |
|--------|--------------|----------------------|
| **Location** | `src/**/__tests__/` | `tests/e2e-features/` |
| **Output** | Minimal (pass/fail) | Detailed sequential logs |
| **Performance** | No timing assertions | Strict timing requirements |
| **Scope** | Unit/integration | End-to-end feature flows |
| **Telemetry** | Mock or ignore | Capture and analyze |
| **Purpose** | Code correctness | User experience validation |

## Best Practices

1. **Precise timing**: Always measure and assert response times
2. **Real infrastructure**: Use actual server, database, SSE streams
3. **Comprehensive capture**: Collect all telemetry events
4. **Clear failures**: Log exactly what failed and why
5. **Actionable output**: Developer should know what to fix immediately

## Adding to AGENTS.md

When documenting this testing approach in AGENTS.md:

1. Explain the separation between regular and specialized tests
2. Emphasize precise sequential logging
3. Document performance requirements (e.g., <200ms for instant feedback)
4. Show example log output format
5. Explain when to add specialized tests vs regular tests
