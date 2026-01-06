# First Steps: Bridging Current to Target

This document provides concrete, executable steps to move from current state to book target.

---

## Phase 1: Foundation Hardening (Days 1-5)

### Step 1.1: Verify Current Daemon Works

```powershell
# Check daemon status (should show 'not running')
node tools/dev/crawl-daemon.js status

# Start daemon
node tools/dev/crawl-daemon.js start

# Verify it's running
node tools/dev/crawl-daemon.js status --json
# Expected: { "running": true, "port": 3099, "pid": <number> }

# Test API health
Invoke-WebRequest -Uri http://localhost:3099/health -UseBasicParsing | Select-Object StatusCode
# Expected: 200

# Stop daemon
node tools/dev/crawl-daemon.js stop
```

### Step 1.2: Verify Analysis Observable Works

```powershell
# Run small analysis batch in headless mode
node labs/analysis-observable/run-lab.js --limit 3 --headless --verbose

# Check output includes:
# - Progress emissions
# - Timing metrics
# - Completion summary
```

### Step 1.3: Run Unified Lab (Current Best)

```powershell
# Start unified dashboard
node labs/crawler-progress-integration/server.js

# Open browser to http://localhost:3008
# Verify:
# - SSE connection works
# - Can start crawl
# - Can see progress
# - Analysis auto-starts after crawl

# Stop server with Ctrl+C
```

---

## Phase 2: Extract Production Modules (Days 6-15)

### Step 2.1: Create Production Daemon Module

**File to create:** `src/daemon/CrawlDaemon.js`

**Source to extract from:** `src/cli/crawl/daemon.js` (lines 150-400)

```powershell
# Create directory
New-Item -ItemType Directory -Path src/daemon -Force

# The extraction requires:
# 1. Copy getDaemonConfig(), isDaemonRunning(), startDaemonDetached(), stopDaemon()
# 2. Wrap in class with constructor
# 3. Add error handling
# 4. Export class

# After creating, test with:
node -e "const { CrawlDaemon } = require('./src/daemon/CrawlDaemon'); console.log('OK')"
```

### Step 2.2: Create Production Analysis Module

**File to create:** `src/analysis/AnalysisObservable.js`

**Source to extract from:** `labs/analysis-observable/analysis-observable.js`

```powershell
# Copy core observable code (not CLI stuff)
# Extract:
# - RollingWindow class
# - ItemTimingTracker class
# - createAnalysisObservable() function

# Wrap in class with:
# - constructor(options)
# - subscribe(observer)
# - start()
# - stop()
# - getState()

# Test with:
node -e "const { AnalysisObservable } = require('./src/analysis/AnalysisObservable'); console.log('OK')"
```

### Step 2.3: Create Pipeline Orchestrator

**File to create:** `src/pipelines/PipelineOrchestrator.js`

**Pattern from:** `labs/crawler-progress-integration/server.js`

See [Chapter 16](chapters/16-implementation-guide.md) for complete implementation.

---

## Phase 3: Enhance Disambiguation (Days 16-25)

### Step 3.1: Audit Current Scoring

```powershell
# Find current scoring logic
node tools/dev/js-scan.js --dir src --search "pickBestCandidate" "placeScore" "disambiguate" --json

# Read implementation
node tools/dev/js-edit.js --file src/analysis/place-extraction.js --list-functions --json
```

### Step 3.2: Add Publisher Location Prior

**Concept:** When The Guardian mentions "Manchester", it likely means UK not NH.

```javascript
// Add to src/analysis/place-extraction.js or new module

function getPublisherPrior(publisherDomain, candidateCountry) {
  const PUBLISHER_COUNTRIES = {
    'bbc.com': 'GB',
    'bbc.co.uk': 'GB',
    'theguardian.com': 'GB',
    'nytimes.com': 'US',
    'washingtonpost.com': 'US',
    'reuters.com': null, // International - no prior
    // ... more publishers
  };
  
  const pubCountry = PUBLISHER_COUNTRIES[publisherDomain];
  if (!pubCountry) return 0;
  
  return candidateCountry === pubCountry ? 0.3 : 0; // 30% boost for same country
}
```

### Step 3.3: Add Co-occurrence Features

**Concept:** If "London" and "UK" appear near each other, boost UK's London.

```javascript
function getCooccurrenceScore(mention, candidates, context) {
  // Find other place mentions within N characters
  const nearby = findNearbyMentions(mention.position, context, 200);
  
  for (const candidate of candidates) {
    // Check if any nearby mention is in candidate's hierarchy
    // e.g., "UK" mentioned → boost London, GB
    const parentMentions = nearby.filter(m => 
      isParentOf(m.matchedPlace, candidate.place)
    );
    
    if (parentMentions.length > 0) {
      candidate.score += 0.2 * parentMentions.length; // 20% per parent mention
    }
  }
}
```

### Step 3.4: Create /explain Endpoint

```powershell
# Add route to API server
# src/api/routes/explain.js

# Endpoint: POST /api/disambiguation/explain
# Body: { text: "String with place mentions" }
# Response: {
#   mentions: [...],
#   candidates: { mention: [...candidates with scores] },
#   decision: { mention: selectedPlace, confidence, reasoning }
# }
```

---

## Phase 4: Expand XPath Coverage (Ongoing)

### Step 4.1: Audit Current Coverage

```powershell
# Count patterns in extractors.json
node -e "console.log(Object.keys(require('./config/extractors.json')).length)"

# List domains covered
node -e "console.log(Object.keys(require('./config/extractors.json')).join('\n'))"
```

### Step 4.2: Add High-Value Patterns

Priority domains (by traffic/importance):

1. **BBC** — `bbc.com`, `bbc.co.uk`
2. **Guardian** — `theguardian.com`
3. **Reuters** — `reuters.com`
4. **NYT** — `nytimes.com`
5. **Washington Post** — `washingtonpost.com`
6. **AP News** — `apnews.com`
7. **CNN** — `cnn.com`
8. **NPR** — `npr.org`

### Step 4.3: Pattern Template

```json
{
  "example.com": {
    "title": {
      "xpath": "//h1[contains(@class, 'headline')]",
      "fallback": "//title"
    },
    "body": {
      "xpath": "//article//p",
      "exclude": "//*[contains(@class, 'ad')]"
    },
    "author": {
      "xpath": "//meta[@name='author']/@content"
    },
    "publishedDate": {
      "xpath": "//time[@datetime]/@datetime"
    }
  }
}
```

---

## Validation Commands

After implementing each phase, run these validations:

```powershell
# Phase 1 validation
node tools/dev/crawl-daemon.js status --json
node labs/analysis-observable/run-lab.js --limit 1 --headless

# Phase 2 validation (after module extraction)
npm run test:by-path tests/daemon/CrawlDaemon.test.js
npm run test:by-path tests/analysis/AnalysisObservable.test.js
npm run test:by-path tests/pipelines/PipelineOrchestrator.test.js

# Phase 3 validation
npm run test:by-path tests/analysis/place-extraction.test.js
node tools/dev/db-downloads.js --stats

# Full integration test
node src/cli/pipeline.js run --url https://example.com --pages 5 --dry-run
```

---

## Progress Tracking

Create a session to track migration progress:

```powershell
node tools/dev/session-init.js --slug "book-implementation" --type "implementation" --title "Book Implementation Sprint" --objective "Execute Chapter 16 migration plan"
```

Update the session's `PLAN.md` with:

```markdown
## Tasks

- [ ] Phase 1: Foundation verification
  - [ ] Daemon start/stop/status
  - [ ] Analysis observable headless
  - [ ] Unified lab end-to-end
  
- [ ] Phase 2: Module extraction
  - [ ] CrawlDaemon class
  - [ ] AnalysisObservable class
  - [ ] PipelineOrchestrator class
  
- [ ] Phase 3: Disambiguation
  - [ ] Publisher prior
  - [ ] Co-occurrence scoring
  - [ ] /explain endpoint
  
- [ ] Phase 4: XPath patterns
  - [ ] BBC patterns
  - [ ] Guardian patterns
  - [ ] Reuters patterns
```

---

## Success Criteria

Phase is complete when:

| Phase | Success Criteria |
|-------|------------------|
| 1 | All verification commands pass |
| 2 | All three tests pass, CLI works |
| 3 | Disambiguation accuracy >80% on test set |
| 4 | 50+ domains covered in extractors.json |

---

[← Back to Index](README.md) | [Chapter 16: Implementation Guide →](chapters/16-implementation-guide.md)
