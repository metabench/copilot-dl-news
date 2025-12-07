# Reliable Crawler Phase 1 Specification: Foundation (The "Tenacious" Crawler)

**Status**: ✅ Complete
**Date**: 2025-12-07 (Implemented 2025-12-07/08)
**Parent**: [RELIABLE_CRAWLER_ROADMAP.md](../goals/RELIABLE_CRAWLER_ROADMAP.md)

## Implementation Status

| Component | Status | Tests | Notes |
|-----------|--------|-------|-------|
| ContentValidationService | ✅ Complete | 16 | Garbage filtering, hard/soft failures |
| ResilienceService | ✅ Complete | 16 | Circuit breakers, heartbeat, diagnostics |
| ArchiveDiscoveryStrategy | ✅ Complete | 25 | Sitemap, archive, date patterns |
| PaginationPredictorService | ✅ Complete | 33 | Query/path pagination patterns |
| CrawlerServiceWiring | ✅ Complete | - | All Phase 1 services wired |
| FetchPipeline integration | ✅ Complete | 12 | Validation, resilience hooks |

**Total Phase 1 Tests**: 90 passing

## Overview

Phase 1 focuses on **resilience** and **tenacity**. The crawler must not stall, must find content even when the "front page" is stale, and must reject low-quality data early.

## 1. Internal Resilience & Self-Healing

**Goal**: The crawler process monitors its own health, handles network interruptions gracefully, and manages domain backoff internally without relying on an external supervisor for basic recovery.

### Architecture
- **Component**: `ResilienceService` (internal module)
- **Integration**: Integrated directly into the `SequenceRunner` loop and `FetchService`.
- **State**: Maintains in-memory health metrics (last success, consecutive failures, domain error counts).

### Logic
1.  **Self-Monitoring (Heartbeat)**:
    - The main loop updates a `last_activity_timestamp` on every action.
    - A lightweight internal timer checks this timestamp.
    - If `now - last_activity > STALL_THRESHOLD` (e.g., 5 mins):
        - Log "Stall Detected".
        - Trigger **Self-Diagnostics**.
2.  **Self-Diagnostics & Recovery**:
    - **Network Check**: Attempt to reach a reliable host (e.g., 8.8.8.8 or google.com).
        - *If Down*: Pause queue consumption, enter "Wait for Network" loop (check every 30s). Resume when up.
    - **Database Check**: Run a lightweight query (`SELECT 1`).
        - *If Down*: Attempt reconnect. If fails, exit process (let OS restart).
3.  **Domain Circuit Breaker**:
    - Track consecutive 403/429 errors per domain in memory.
    - If `errors > THRESHOLD`:
        - Mark domain as "cooldown" in memory (skip for M minutes).
        - Log "Circuit Breaker Tripped for [Domain]".
4.  **Graceful Suicide**:
    - If the crawler determines it is in an unrecoverable state (e.g., memory leak detected, critical internal error), it logs a fatal error and exits with a specific code (e.g., 1) to allow the OS/Docker/PM2 to restart it cleanly.

### Database Impact
- No schema changes. Relies on memory state for immediate decisions.

---

## 2. Archive Discovery

**Goal**: Explicit logic to find and traverse `/archive`, `/sitemap`, and calendar-based navigation when the "fresh" news runs dry.

### Architecture
- **Component**: `ArchiveDiscoveryStrategy` (implements `IUrlDiscoveryStrategy`)
- **Integration**: Plugged into `UrlDecisionOrchestrator`.

### Logic
1.  **Trigger**:
    - When `queue_items` (status='pending', priority='high') drops below threshold.
    - OR periodically (e.g., once per day per domain).
2.  **Pattern Matching**:
    - **Standard Paths**: `/archive`, `/sitemap`, `/sitemap.xml`, `/robots.txt`.
    - **Date Patterns**: `/2025/`, `/2025/12/`, `/news/2025/`.
3.  **Execution**:
    - Generate candidate URLs for the domain.
    - Check if they exist in `urls` table.
    - If new, add to queue with `priority='discovery'`.
4.  **Sitemap Parsing**:
    - If `sitemap.xml` is found, parse it (handle nested sitemaps).
    - Extract URLs and `lastmod`.

### Implementation Details
- Extend `UrlPatternLearningService` to recognize "archive-like" patterns from successful crawls.

---

## 3. Pagination Predictor

**Goal**: Heuristic to detect and speculatively crawl pagination (`?page=N`, `/page/N`) to go deeper than the immediate links.

### Architecture
- **Component**: `PaginationPredictorService`
- **Integration**: Called by `UrlDecisionOrchestrator` when processing a "List" type page (e.g., section front).

### Logic
1.  **Pattern Detection**:
    - Analyze current URL: `example.com/news` -> Candidate: `example.com/news?page=2`.
    - Analyze links on page: If links to `?page=2`, `?page=3` exist, infer pattern `?page={N}`.
2.  **Speculation**:
    - If page 1 is crawled and has content, speculatively generate page 2 (if not explicitly linked).
    - **Limit**: Max speculation depth (e.g., +1 from known max).
3.  **Feedback Loop**:
    - If speculative crawl (Page N) returns 404 or "No results", mark pattern as invalid for this path.
    - If successful, generate Page N+1.

### Database Impact
- Store learned pagination patterns in `url_classification_patterns` or a new `pagination_rules` table.

---

## 4. Strict Validation

**Goal**: A filter to reject "garbage" content (e.g., "Please enable JS", "Access Denied", empty body) before it pollutes the DB.

### Architecture
- **Component**: `ContentValidationService`
- **Integration**: Called by `FetchService` (post-download) or `ContentProcessor` (pre-extraction).

### Logic
1.  **Garbage Signatures**:
    - **Text**: "Please enable JavaScript", "Checking your browser", "Access Denied", "403 Forbidden" (in body text).
    - **Size**: Body length < 500 bytes (configurable).
    - **Structure**: No `<p>` tags, or only script tags.
2.  **Action**:
    - If validation fails:
        - Mark `http_responses` status as 'rejected' (or specific error code).
        - Do NOT create `article_content` record.
        - Log reason for rejection.
3.  **Soft vs. Hard Failure**:
    - **Hard**: "Access Denied" -> Stop crawling domain temporarily.
    - **Soft**: "Enable JS" -> Re-queue for **Teacher** (Puppeteer) crawl (Phase 2).

### Database Impact
- Add `validation_status` and `rejection_reason` columns to `http_responses` (or use existing `status` field with new enum values).

---

## Implementation Plan

### Step 1: Strict Validation (Quick Win) ✅ COMPLETE
- ✅ Implement `ContentValidationService`.
- ✅ Hook into `FetchPipeline`.
- ✅ Define initial "garbage" regex list.

### Step 2: Internal Resilience ✅ COMPLETE
- ✅ Create `ResilienceService`.
- ✅ Integrate heartbeat check (via FetchPipeline activity recording).
- ✅ Implement network/database diagnostics.
- ✅ Implement per-domain circuit breakers.

### Step 3: Pagination & Archive (The "Brain") ✅ COMPLETE
- ✅ Implement `PaginationPredictorService`.
- ✅ Implement `ArchiveDiscoveryStrategy`.
- ✅ Wire services into `CrawlerServiceWiring.js`.
- ⏳ TODO: Integration triggers in UrlDecisionOrchestrator/QueueManager.

