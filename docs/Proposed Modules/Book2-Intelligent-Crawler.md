# Book 2: Intelligent Crawler

**Repository Name**: `copilot-news-crawler`  
**Status**: Proposal  
**Role**: Data Acquisition & In-Stream Analysis  
**Dependency**: `copilot-news-platform` (HTTP API)  
**Version**: 1.0 Draft

---

## Table of Contents

1.  [Introduction](#1-introduction)
2.  [Goals & Non-Goals](#2-goals--non-goals)
3.  [Architecture Overview](#3-architecture-overview)
4.  [Worker Design](#4-worker-design)
5.  [In-Stream Analysis](#5-in-stream-analysis)
6.  [Communication with Platform](#6-communication-with-platform)
7.  [Rate Limiting & Politeness](#7-rate-limiting--politeness)
8.  [Deployment & Scaling](#8-deployment--scaling)
9.  [Files to Port from Monorepo](#9-files-to-port-from-monorepo)
10. [Appendix: Interface Contracts](#10-appendix-interface-contracts)

---

## 1. Introduction

The **Intelligent Crawler** is the data acquisition arm of the system. Unlike a simple fetcher, it combines crawling with *in-stream analysis* to make intelligent decisions about which links to follow. This colocated design eliminates the latency of sending data to a separate analysis service, enabling real-time prioritization.

### 1.1. Why "Intelligent"?

The crawler doesn't just fetch pages—it *understands* them as it fetches:

-   **Pattern Discovery**: Identifies URL templates like `/world/{country}`.
-   **Hub Detection**: Flags navigation pages (e.g., "World News") for priority crawling.
-   **Classification**: Marks pages as `article`, `hub`, or `other`.

This intelligence is bundled *inside* the crawler process, not in a separate service.

---

## 2. Goals & Non-Goals

### 2.1. Goals

1.  **High-Throughput Fetching**: Crawl thousands of pages per hour per worker.
2.  **In-Stream Analysis**: Run pattern extraction during the crawl loop.
3.  **Stateless Design**: All persistent state lives in the Platform API.
4.  **Politeness**: Respect `robots.txt`, implement per-domain rate limits.
5.  **Fault Tolerance**: Handle network errors gracefully; report back to Platform.

### 2.2. Non-Goals

-   ❌ **Long-Term Storage**: The crawler does not own the database. It sends data to Platform.
-   ❌ **User Interface**: No UI. Monitoring is done via Platform.
-   ❌ **ML Training**: The crawler runs pre-trained heuristics; it doesn't train models.

---

## 3. Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│               Intelligent Crawler Worker                    │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────┐    ┌────────────────┐    ┌──────────────┐  │
│  │   Fetcher   │───►│   Analyzer     │───►│  Reporter    │  │
│  │ (Puppeteer/ │    │ (Patterns,     │    │ (HTTP POST   │  │
│  │  Cheerio)   │    │  Hubs, Links)  │    │  to Platform) │  │
│  └──────┬──────┘    └────────────────┘    └──────────────┘  │
│         │                                                   │
│         │                  ┌───────────────┐                │
│         │                  │ Rate Limiter  │                │
│         └──────────────────┤ (per-domain)  │                │
│                            └───────────────┘                │
│                                                             │
│  ┌─────────────────────────────────────────────────────────┐│
│  │                   Local State (Ephemeral)               ││
│  │  - In-memory queue of URLs to fetch                     ││
│  │  - Cached robots.txt per domain                         ││
│  │  - Rate limit tokens                                    ││
│  └─────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
           │                              ▲
           │ POST /api/v1/urls/ingest     │ GET /api/v1/urls/queue
           │                              │
           ▼                              │
   ┌────────────────────────────────────────┐
   │        News Platform Core (API)        │
   └────────────────────────────────────────┘
```

### 3.1. Tech Stack

| Component          | Technology               | Rationale                                  |
|--------------------|--------------------------|--------------------------------------------|
| **Runtime**        | Node.js (v20+)           | Async I/O, codebase continuity             |
| **Fetcher**        | Cheerio + `undici`       | Fast HTML parsing, HTTP/2 support          |
| **Fallback Fetcher** | Puppeteer (optional)   | For JS-rendered sites                      |
| **HTTP Client**    | `undici` / `node-fetch`  | High-performance                           |
| **Rate Limiter**   | Custom (token bucket)    | Fine-grained, per-domain control           |

---

## 4. Worker Design

### 4.1. The Crawl Loop

Each worker instance runs an event loop:

```
1. CLAIM JOB
   GET /api/v1/urls/queue?limit=50&domain=example.com
   -> Receives list of pending URLs

2. FETCH PAGE
   For each URL:
     a. Acquire rate-limit token
     b. HTTP GET (respecting robots.txt)
     c. Handle redirects, errors

3. ANALYZE
   For each fetched page:
     a. Extract text content, title
     b. Run PatternAnalyzer (find URL templates)
     c. Extract outbound links
     d. Classify page (article, hub, other)

4. REPORT
   POST /api/v1/urls/ingest
   -> Send batch: { url, status, content, links, classification, patterns }

5. LOOP
   Go to step 1
```

### 4.2. Statelessness

The worker holds no persistent state. If it crashes:

-   In-flight URLs are re-queued by the Platform (timeout mechanism).
-   No data is lost (all writes go to Platform).
-   A new worker instance can immediately start.

### 4.3. Configuration

Workers are configured via environment variables or a config file:

| Variable             | Default       | Description                             |
|----------------------|---------------|-----------------------------------------|
| `PLATFORM_API_URL`   | (required)    | Base URL of Platform API                |
| `WORKER_ID`          | `uuid()`      | Unique worker identifier                |
| `BATCH_SIZE`         | `50`          | URLs to claim per queue request         |
| `RATE_LIMIT_DEFAULT` | `1000`        | Default ms delay between requests       |
| `MAX_DEPTH`          | `5`           | Maximum crawl depth from seed           |

---

## 5. In-Stream Analysis

### 5.1. Pattern Analyzer

The `PatternAnalyzer` module (ported from `sitePatternAnalysis.js`) runs on every fetched page:

**Capabilities:**
-   **Section Detection**: `/news`, `/world`, `/sport` → mark as top-level sections.
-   **Place Hub Detection**: `/world/africa`, `/news/uk` → flag as potential country hub.
-   **Template Extraction**: `/article/<id>`, `/story/<date>/<slug>` → store patterns.

**Output per page:**
```json
{
  "classification": "hub",
  "patterns": [
    { "template": "/world/{place}", "confidence": 0.9 }
  ],
  "isPlaceHub": true,
  "placeSlug": "africa"
}
```

### 5.2. Link Extraction

All `<a href>` links are extracted and normalized:

-   Absolute URLs only.
-   Same-domain links only (external links discarded).
-   Deduplicated before sending to Platform.

### 5.3. Classification Logic

| Classification | Criteria                                          |
|----------------|---------------------------------------------------|
| `article`      | URL matches article patterns, has body text > 500 chars |
| `hub`          | URL matches section patterns, has > 10 links      |
| `other`        | Default                                           |

---

## 6. Communication with Platform

### 6.1. Claiming Work: `GET /api/v1/urls/queue`

**Request:**
```http
GET /api/v1/urls/queue?limit=50&domain=example.com
Authorization: Bearer <worker-token>
```

**Response:**
```json
{
  "jobId": "uuid",
  "urls": [
    { "id": 123, "url": "https://example.com/page1", "depth": 0 },
    { "id": 124, "url": "https://example.com/page2", "depth": 1 }
  ]
}
```

### 6.2. Submitting Results: `POST /api/v1/urls/ingest`

**Request:**
```json
{
  "jobId": "uuid",
  "workerId": "worker-1",
  "items": [
    {
      "id": 123,
      "url": "https://example.com/page1",
      "status": "done",
      "httpStatus": 200,
      "title": "Page Title",
      "contentType": "text/html",
      "classification": "hub",
      "links": ["https://example.com/page3", "https://example.com/page4"],
      "patterns": [{ "template": "/section/{name}", "confidence": 0.8 }],
      "fetchedAt": "2026-01-12T03:00:00Z"
    }
  ]
}
```

**Response:**
```json
{
  "inserted": 2,
  "updated": 0,
  "errors": []
}
```

---

## 7. Rate Limiting & Politeness

### 7.1. Token Bucket Algorithm

Each domain has a rate limiter (ported from `rate-limiter.js`):

-   **Capacity**: Number of tokens (bursts allowed).
-   **Refill Rate**: Tokens added per second.
-   **Acquire**: Block until a token is available.

**Example:**
```javascript
const limiter = new RateLimiter({ capacity: 2, refillRate: 1 }); // 1 req/sec, burst 2
await limiter.acquire('example.com');
// ... make request ...
```

### 7.2. Robots.txt Compliance

Before crawling a domain, fetch and parse `robots.txt`:

-   Respect `Disallow` rules.
-   Use `Crawl-delay` if specified.
-   Cache for 24 hours.

---

## 8. Deployment & Scaling

### 8.1. Single Worker

For development or low-volume:

```bash
cd copilot-news-crawler
PLATFORM_API_URL=http://localhost:3100 node src/worker.js
```

### 8.2. Multi-Worker (Docker)

For production:

```yaml
# docker-compose.yml
services:
  crawler-worker:
    image: copilot-news-crawler:latest
    environment:
      - PLATFORM_API_URL=http://platform:3100
    deploy:
      replicas: 10
```

### 8.3. Kubernetes (Future)

-   Use a `Deployment` with Horizontal Pod Autoscaler (HPA).
-   Scale based on Platform queue depth (via Prometheus metrics).

---

## 9. Files to Port from Monorepo

### 9.1. Core Crawler Logic

| File                                                   | Purpose                                               |
|--------------------------------------------------------|-------------------------------------------------------|
| `deploy/remote-crawler/lib/crawl-worker.js`            | Main worker class (15KB)                              |
| `deploy/remote-crawler/lib/rate-limiter.js`            | Token bucket rate limiter (13KB)                      |
| `deploy/remote-crawler/lib/schema.js`                  | (Reference) Local queue schema                        |
| `deploy/remote-crawler/server.js`                      | (Reference) Express wrapper                           |

### 9.2. Analysis Logic

| File                                                   | Purpose                                               |
|--------------------------------------------------------|-------------------------------------------------------|
| `src/services/sitePatternAnalysis.js`                  | URL pattern discovery (13KB, core intelligence)       |
| `src/services/UrlClassificationService.js`             | Page classification (22KB)                            |
| `src/services/UrlPatternLearningService.js`            | Pattern storage helpers (20KB)                        |
| `src/services/PlaceHubPatternLearningService.js`       | Place-specific patterns (18KB)                        |
| `src/services/CountryHubGapAnalyzer.js`                | Country hub guessing (22KB)                           |

### 9.3. Hub Detection

| File                                                   | Purpose                                               |
|--------------------------------------------------------|-------------------------------------------------------|
| `src/services/HubGapAnalyzerBase.js`                   | Base class for hub analysis (7KB)                     |
| `src/services/CountryHubMatcher.js`                    | Match URLs to countries (9KB)                         |

### 9.4. Utilities

| File                                                   | Purpose                                               |
|--------------------------------------------------------|-------------------------------------------------------|
| `src/core/crawler/` (directory, 359 files)             | (Reference) Legacy crawler infrastructure             |

---

## 10. Appendix: Interface Contracts

### 10.1. QueueItem (from Platform)

```typescript
interface QueueItem {
  id: number;
  url: string;
  depth: number;
  priority?: number;
}
```

### 10.2. IngestItem (to Platform)

```typescript
interface IngestItem {
  id?: number;
  url: string;
  status: 'done' | 'error';
  httpStatus?: number;
  title?: string;
  contentType?: string;
  classification: 'article' | 'hub' | 'other';
  links: string[];
  patterns?: PatternMatch[];
  fetchedAt: string; // ISO 8601
  errorMessage?: string;
}

interface PatternMatch {
  template: string;
  confidence: number;
}
```

### 10.3. Worker Health Check

```
GET /health
-> { "status": "ok", "uptime": 12345, "fetched": 5000 }
```

---

**End of Book 2**
