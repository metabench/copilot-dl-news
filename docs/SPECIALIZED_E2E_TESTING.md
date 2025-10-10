# Specialized E2E Feature Development Tests

**When to Read**: Read this when creating specialized E2E test suites for specific crawl types (geography, cities, etc.), understanding E2E test architecture, or debugging long-running E2E tests. See tests/e2e-features/ for implementation examples.

**Location**: `tests/e2e-features/` *(separate from regular tests)*

**Purpose**: In-depth validation of user-facing features with precise performance requirements and detailed telemetry analysis.

## Philosophy: Precise, Sequential, Actionable

Specialized E2E tests differ from regular tests:

| Aspect | Regular Tests | Specialized E2E Tests |
|--------|--------------|----------------------|
| **Location** | `src/**/__tests__/` | `tests/e2e-features/` |
| **Output** | Minimal (pass/fail) | Detailed sequential logs |
| **Performance** | No timing assertions | Strict timing requirements |
| **Scope** | Unit/integration | End-to-end feature flows |
| **Telemetry** | Mock or ignore | Capture and analyze |
| **Purpose** | Code correctness | User experience validation |

## Test Categories

### 1. Instant Feedback Tests (`instant-feedback/`)
- **Focus**: Response time validation
- **Requirements**: 
  - Crawl start: `<200ms` response with jobId + initial stage
  - Status endpoint: `<50ms` response
  - Immediate UI feedback on user actions

### 2. Telemetry Flow Tests (`telemetry-flow/`)
- **Focus**: Real-time event streaming
- **Requirements**:
  - SSE connection establishment
  - Stage emission completeness (bootstrap, planning, etc.)
  - Progress event frequency and structure
  - Preparation phase visibility

### 3. Geography Crawl Tests (`geography-crawl/`)
- **Focus**: Geography-specific workflows
- **Requirements**:
  - Country discovery and download
  - Gazetteer data quality
  - Planning stage telemetry
  - Progress bar updates with current/totalItems

### 4. Preparation Stages Tests (`preparation-stages/`)
- **Focus**: Crawl preparation phase details
- **Requirements**:
  - Bootstrap stage timing
  - Pattern inference telemetry
  - Stage transition smoothness
  - GUI display of preparation progress

## Sequential Logging Pattern

Every specialized test uses **step-by-step logging**:

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

test('Instant feedback on crawl start', async () => {
  log(1, 'Starting instant feedback test');
  
  const startTime = Date.now();
  log(2, 'Sending POST /api/crawl request', {
    url: 'https://example.com',
    crawlType: 'geography'
  });
  
  const response = await request(app).post('/api/crawl').send({ ... });
  const responseTime = Date.now() - startTime;
  
  log(3, 'Received response', {
    status: response.status,
    responseTimeMs: responseTime,
    jobId: response.body.jobId
  });
  
  expect(responseTime).toBeLessThan(200);
  log(4, `✓ Response time ${responseTime}ms < 200ms requirement`);
  
  log(5, '✅ Test completed successfully', {
    summary: {
      responseTime: `${responseTime}ms`,
      requirement: '<200ms',
      status: 'PASS'
    }
  });
});
```

## Performance Requirements

**Instant Feedback (<200ms)**:
- User starts crawl → Server returns jobId + initial stage
- UI displays "Preparing..." immediately
- No perceived delay in user interaction

**Preparation Stage Telemetry (Real-time)**:
- Bootstrap stage: Emitted when crawler initializes
- Planning stages: Stream as planning occurs (bootstrap, infer-patterns, reasoning)
- Progress updates: Every 10 items or significant milestone
- GUI updates: Display current stage name and progress bar

**Status Checks (<50ms)**:
- GET `/api/status` responds instantly
- Enables smooth UI polling without lag

## Example: Instant Feedback Test

```javascript
// tests/e2e-features/instant-feedback/crawl-start-response.test.js

test('POST /api/crawl returns response within 200ms', async () => {
  log(1, 'Starting instant feedback test');

  const startTime = Date.now();
  log(2, 'Sending crawl start request');

  const response = await request(app)
    .post('/api/crawl')
    .send({
      url: 'https://example.com',
      crawlType: 'geography',
      concurrency: 1
    });

  const responseTime = Date.now() - startTime;
  log(3, 'Received response', {
    status: response.status,
    responseTimeMs: responseTime,
    hasJobId: !!response.body.jobId
  });

  // Performance assertion
  expect(responseTime).toBeLessThan(200);
  log(4, `✓ Response time ${responseTime}ms < 200ms requirement`);

  // Structure validation
  expect(response.status).toBe(202);
  expect(response.body).toHaveProperty('jobId');
  expect(response.body.jobId).toMatch(/^[a-z0-9]+-\d+$/);
  log(5, '✓ Response has valid jobId', { jobId: response.body.jobId });

  // Initial stage validation
  expect(response.body).toHaveProperty('stage');
  expect(response.body.stage).toBe('preparing');
  log(6, '✓ Initial stage is "preparing"');

  // Final summary
  log(7, '✅ Test completed successfully', {
    summary: {
      responseTime: `${responseTime}ms`,
      requirement: '<200ms',
      status: 'PASS',
      jobId: response.body.jobId,
      initialStage: response.body.stage
    }
  });
});
```

## Example: Telemetry Flow Test

```javascript
// tests/e2e-features/telemetry-flow/preparation-stages.test.js

test('Geography crawl emits detailed preparation stage telemetry', async () => {
  log(1, 'Starting preparation stages telemetry test');

  // Connect to SSE stream
  log(2, 'Connecting to SSE telemetry endpoint');
  const eventSource = new EventSource(`http://localhost:${serverPort}/events?logs=1`);
  const stages = [];
  const progressEvents = [];

  eventSource.on('planner-stage', (event) => {
    const data = JSON.parse(event.data);
    stages.push(data);
    log(3, 'Received planner-stage event', {
      type: data.type,
      status: data.status,
      durationMs: data.durationMs
    });
  });

  eventSource.on('progress', (event) => {
    const data = JSON.parse(event.data);
    progressEvents.push(data);
    if (data.phase === 'processing') {
      log(4, 'Received progress event', {
        phase: data.phase,
        current: data.current,
        totalItems: data.totalItems
      });
    }
  });

  // Start crawl
  log(5, 'Starting geography crawl');
  const response = await fetch(`http://localhost:${serverPort}/api/crawl`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: 'https://example.com',
      crawlType: 'geography'
    })
  });

  const responseData = await response.json();
  log(6, 'Crawl started', {
    jobId: responseData.jobId,
    initialStage: responseData.stage
  });

  // Monitor for preparation stages
  log(7, 'Monitoring preparation stages for 30 seconds');
  await new Promise(resolve => setTimeout(resolve, 30000));
  
  eventSource.close();
  log(8, 'SSE connection closed', {
    totalStages: stages.length,
    totalProgress: progressEvents.length
  });

  // Analyze telemetry
  log(9, 'Analyzing captured telemetry');
  const stageTypes = [...new Set(stages.map(s => s.type))];
  log(10, 'Stage types captured', { stages: stageTypes });

  const processingProgress = progressEvents.filter(p => p.phase === 'processing');
  log(11, 'Processing progress events', { count: processingProgress.length });

  // Assertions
  expect(stages.length + progressEvents.length).toBeGreaterThan(0);
  log(12, '✅ Preparation stage telemetry test completed', {
    summary: {
      stagesCaptured: stages.length,
      progressEventsCaptured: progressEvents.length,
      telemetryFlowing: true
    }
  });
}, 45000);
```

## Running Specialized Tests

```bash
# All specialized E2E tests
npm run test:e2e-features

# Specific category
npm run test:file "instant-feedback"
npm run test:file "telemetry-flow"

# Individual test
npm run test:file "crawl-start-response"
```

## When to Add Specialized Tests

**Add specialized E2E tests when**:
- ✅ Feature has strict performance requirements (<200ms, <50ms, etc.)
- ✅ User-facing workflow requires validation (crawl start, preparation, progress)
- ✅ Telemetry flow is critical to UX (SSE events, stage transitions)
- ✅ Detailed debugging output would help future development

**Use regular tests when**:
- ✅ Testing individual functions or classes (unit tests)
- ✅ Testing API endpoints without timing requirements (integration tests)
- ✅ Testing internal logic that doesn't affect UX directly

## Best Practices

1. **Precise timing**: Always measure and assert response times
2. **Real infrastructure**: Use actual server, database, SSE streams
3. **Comprehensive capture**: Collect all telemetry events during test
4. **Clear failures**: Log exactly what failed and why
5. **Actionable output**: Developer should know what to fix immediately
6. **Visual markers**: Use ✓, ⚠, ✅ for quick scanning
7. **JSON formatting**: Structure complex data for easy parsing
8. **Final summary**: Always include summary with key metrics
