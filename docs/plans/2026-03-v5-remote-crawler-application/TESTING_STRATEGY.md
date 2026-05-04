# Testing and Perfection Strategy – V5 Remote Crawler Application

## Goal
Make v5 implementable in increments and then harden it with deliberate testing and polish instead of ad-hoc cleanup.

## 1. Test Layers

### Layer A – Unit Tests
Focus:
- status normalization
- profile parsing
- place/topic hub candidate generation
- hub decision state transitions
- bundle manifest generation
- bundle checksum/integrity metadata generation
- retention decisions
- auth policy helpers
- article query parameter/state helpers

Purpose:
- keep contracts and core helpers stable

### Layer B – Integration Tests
Focus:
- gateway routes
- runtime lifecycle
- hub suggestion and review APIs
- bundle job persistence
- article library APIs
- export/download flows against test DB fixtures

Purpose:
- prove subsystem boundaries work together

### Layer C – UI Checks
Focus:
- shell SSR
- control room rendering
- discovery-intelligence rendering
- monitoring panel rendering
- article list/viewer rendering
- bundle manager rendering

Purpose:
- prevent fragile UI drift

### Layer D – Operational Smoke Tests
Focus:
- start backend
- open shell
- generate place/topic hub suggestions for a domain
- accept one candidate and launch a tiny crawl from it
- launch tiny crawl
- browse resulting articles
- create tiny bundle job
- download resulting archive

Purpose:
- prove end-to-end usefulness, not just API correctness

### Layer E – Recovery Drills
Focus:
- backend restart during crawl
- backend restart with persisted hub candidates
- bundle job interruption/resume
- restart-safe download retry behavior
- stale worker state
- auth/session expiry

Purpose:
- validate remote operability under failure

### Layer F – Performance Checks
Focus:
- shell response time
- hub suggestion query time
- article list query time
- bundle generation throughput
- download/archive size behavior
- event stream latency
- UI/API latency while crawl workers are busy
- UI/API latency while bundle workers are compressing large exports

Purpose:
- avoid shipping a product that works but feels slow or brittle

## 2. Phase-by-Phase Validation

### Phase 1 – Backend Alpha
- route tests
- lifecycle tests
- tiny runtime smoke
- event-loop isolation checks for crawl-start/load scenarios
- candidate-generation persistence checks for place/topic hub suggestions

### Phase 2 – UI Alpha
- UI check scripts
- shell navigation checks
- hub review/accept/reject checks
- one-browser multi-scenario verification
- responsiveness checks while background crawl activity is present

### Phase 3 – Bundle Beta
- synthetic large export tests
- archive integrity tests
- retry/resume download checks
- retry/failure-path tests

### Phase 4 – Hardening
- deployment smoke on target host
- auth/access tests
- restart/recovery drills
- disk/queue pressure and retention checks
- operator regression sweep
- always-on uptime validation with restart/supervision checks

## 3. Perfection Loop

The "perfecting" stage should be explicit, not vague.

### Inputs
- failing tests
- operator friction notes
- slow routes
- large bundle failures
- crash/recovery anomalies

### Loop
1. reproduce the highest-friction issue
2. add or tighten the smallest meaningful test
3. fix the issue
4. rerun focused tests
5. rerun one end-to-end smoke
6. record evidence in the active session and long-term session

## 4. Minimum Acceptance Before Calling V5 “Usable”

- backend boots cleanly
- backend can be left running on the remote host under supervision
- shell can control a crawl
- shell can surface intelligent place/topic hub suggestions for crawl planning
- article library shows remote content
- article reader works
- bundle jobs complete and download with integrity metadata
- auth boundary exists
- crawl runs and bundle jobs survive restart with clear resume/cancel state
- focused tests cover the main flows
- smoke run proves the whole operator path
- active crawl and active bundle creation do not make the operator UI feel blocked or sluggish
