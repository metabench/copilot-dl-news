# API Endpoint Reference

**When to Read**: Read this when implementing new API consumers, integrating with the server, debugging API calls, or understanding available endpoints.

---

## Overview

This document provides a comprehensive reference for all HTTP API endpoints exposed by the Express server. Endpoints are organized by functional area.

**Base URL**: `http://localhost:3000` (default)  
**Content Type**: `application/json` (for POST/PUT/PATCH requests)  
**Authentication**: None (local development server)

---

## Table of Contents

1. [Crawl Management](#crawl-management)
2. [Job Control](#job-control)
3. [Background Tasks](#background-tasks)
4. [Gazetteer & Places](#gazetteer--places)
5. [News Websites](#news-websites)
6. [URL & Content](#url--content)
7. [Analysis](#analysis)
8. [Planning](#planning)
9. [Monitoring & Health](#monitoring--health)
10. [Navigation & UI](#navigation--ui)

---

## Crawl Management

### Start a Crawl

**POST** `/api/crawl`

Start a new crawl job (foreground system).

**Request Body**:
```json
{
  "url": "https://example.com",
  "depth": 2,
  "maxPages": 100,
  "intelligent": true,
  "mode": "intelligent",
  "crawlType": "standard"
}
```

**Parameters**:
- `url` (string, optional) - Starting URL for crawl
- `depth` (number, optional) - Maximum crawl depth
- `maxPages` (number, optional) - Maximum pages to crawl
- `intelligent` (boolean, optional) - Enable intelligent mode
- `mode` (string, optional) - Crawl mode: `standard`, `intelligent`, `gazetteer`
- `crawlType` (string, optional) - Specific crawl type

**Response** (201 Created):
```json
{
  "jobId": "abc123",
  "url": "https://example.com",
  "startedAt": 1728556800000,
  "args": ["--url", "https://example.com", "--depth", "2"]
}
```

**Error Responses**:
- `400 Bad Request` - Invalid options
- `409 Conflict` - Crawl already running (single-job mode)

**Service**: `CrawlOrchestrationService.startCrawl()`

---

### List Crawls

**GET** `/api/crawls`

Get list of active crawl jobs.

**Query Parameters**: None

**Response** (200 OK):
```json
{
  "count": 2,
  "items": [
    {
      "id": "abc123",
      "url": "https://example.com",
      "status": "running",
      "paused": false,
      "startedAt": 1728556800000,
      "mode": "intelligent",
      "achievements": [...],
      "lifecycle": { "startedAt": 1728556800000, "durationMs": 120000 }
    }
  ]
}
```

---

### Get Crawl Details

**GET** `/api/crawls/:id`

Get detailed information about a specific crawl job.

**URL Parameters**:
- `id` (string, required) - Job ID

**Response** (200 OK):
```json
{
  "id": "abc123",
  "url": "https://example.com",
  "status": "running",
  "paused": false,
  "startedAt": 1728556800000,
  "progress": {
    "percent": 45,
    "current": 450,
    "total": 1000,
    "message": "Crawling pages..."
  },
  "metrics": {...},
  "achievements": [...]
}
```

**Error Responses**:
- `404 Not Found` - Job not found

---

### Stop Crawl

**POST** `/api/crawls/:id/stop`

Stop a specific crawl job.

**URL Parameters**:
- `id` (string, required) - Job ID

**Response** (202 Accepted):
```json
{
  "stopped": true,
  "escalatesInMs": 5000
}
```

**Error Responses**:
- `404 Not Found` - Job not found
- `400 Bad Request` - Multiple jobs running, jobId required
- `200 OK` with `{stopped: false}` - No jobs running

**Service**: `JobControlService.stopJob()`

---

### Pause Crawl

**POST** `/api/crawls/:id/pause`

Pause a running crawl job.

**URL Parameters**:
- `id` (string, required) - Job ID

**Response** (200 OK):
```json
{
  "ok": true,
  "paused": true
}
```

**Error Responses**:
- `400 Bad Request` - Multiple jobs running, jobId required
- `404 Not Found` - Job not found
- `200 OK` with `{ok: false, paused: false, error: "stdin-unavailable"}` - Process stdin unavailable

**Service**: `JobControlService.pauseJob()`

---

### Resume Crawl

**POST** `/api/crawls/:id/resume`

Resume a paused crawl job.

**URL Parameters**:
- `id` (string, required) - Job ID

**Response** (200 OK):
```json
{
  "ok": true,
  "paused": false
}
```

**Error Responses**:
- `400 Bad Request` - Multiple jobs running, jobId required
- `404 Not Found` - Job not found
- `200 OK` with `{ok: false, paused: false, error: "stdin-unavailable"}` - Process stdin unavailable

**Service**: `JobControlService.resumeJob()`

---

## Job Control

### Stop Job (Legacy)

**POST** `/api/stop`

Stop the current job (legacy endpoint, supports single-job mode).

**Query Parameters**:
- `jobId` (string, optional) - Specific job to stop

**Response** (202 Accepted):
```json
{
  "stopped": true,
  "escalatesInMs": 800
}
```

---

### Pause Job (Legacy)

**POST** `/api/pause`

Pause the current job.

**Query Parameters**:
- `jobId` (string, optional) - Specific job to pause

**Response** (200 OK):
```json
{
  "ok": true,
  "paused": true
}
```

---

### Resume Job (Legacy)

**POST** `/api/resume`

Resume a paused job.

**Query Parameters**:
- `jobId` (string, optional) - Specific job to resume

**Response** (200 OK):
```json
{
  "ok": true,
  "paused": false
}
```

---

## Background Tasks

### List Background Task Types

**GET** `/api/background-tasks/types`

Get available background task types.

**Response** (200 OK):
```json
{
  "types": [
    {
      "type": "compression",
      "name": "Compression",
      "description": "Compress article content using gzip/brotli",
      "defaultConfig": {...}
    },
    {
      "type": "analysis",
      "name": "Analysis",
      "description": "Run analysis over database content",
      "defaultConfig": {...}
    }
  ]
}
```

---

### Get Task Type Details

**GET** `/api/background-tasks/types/:taskType`

Get detailed information about a specific task type.

**URL Parameters**:
- `taskType` (string, required) - Task type identifier

**Response** (200 OK):
```json
{
  "type": "compression",
  "name": "Compression",
  "description": "Compress article content using gzip/brotli",
  "defaultConfig": {
    "compressionLevel": 6,
    "methods": ["gzip", "brotli"]
  },
  "schema": {...}
}
```

---

### Get Task Details

**GET** `/api/background-tasks/:id`

Get detailed information about a specific background task.

**URL Parameters**:
- `id` (string, required) - Task ID

**Response** (200 OK):
```json
{
  "id": "task-123",
  "type": "compression",
  "config": {...},
  "status": "running",
  "progress": {
    "percent": 35,
    "current": 3500,
    "total": 10000
  },
  "createdAt": 1728556800000,
  "startedAt": 1728556900000,
  "estimatedCompletionAt": null
}
```

---

### Start Background Task

**POST** `/api/background-tasks/:id/start`

Start a background task.

**URL Parameters**:
- `id` (string, required) - Task ID

**Response** (200 OK):
```json
{
  "ok": true,
  "task": {...}
}
```

**Error Responses**:
- `404 Not Found` - Task not found
- `409 Conflict` - Task already running

---

### Pause Background Task

**POST** `/api/background-tasks/:id/pause`

Pause a running background task.

**URL Parameters**:
- `id` (string, required) - Task ID

**Response** (200 OK):
```json
{
  "ok": true,
  "task": {...}
}
```

---

### Resume Background Task

**POST** `/api/background-tasks/:id/resume`

Resume a paused background task.

**URL Parameters**:
- `id` (string, required) - Task ID

**Response** (200 OK):
```json
{
  "ok": true,
  "task": {...}
}
```

---

### Stop Background Task

**POST** `/api/background-tasks/:id/stop`

Stop a background task.

**URL Parameters**:
- `id` (string, required) - Task ID

**Response** (200 OK):
```json
{
  "ok": true,
  "task": {...}
}
```

---

### Delete Background Task

**DELETE** `/api/background-tasks/:id`

Delete a background task (must be stopped).

**URL Parameters**:
- `id` (string, required) - Task ID

**Response** (200 OK):
```json
{
  "ok": true,
  "deleted": true
}
```

**Error Responses**:
- `409 Conflict` - Task still running (must stop first)

---

### Get Compression Stats

**GET** `/api/background-tasks/stats/compression`

Get compression statistics.

**Response** (200 OK):
```json
{
  "totalArticles": 10000,
  "compressed": 3500,
  "uncompressed": 6500,
  "compressionRatio": 6.5,
  "spaceSaved": 52428800,
  "methods": {
    "gzip": { "count": 2000, "avgRatio": 5.2 },
    "brotli": { "count": 1500, "avgRatio": 8.1 }
  }
}
```

---

### Execute Background Action

**POST** `/api/background-tasks/actions/execute`

Execute a background action (create and start task).

**Request Body**:
```json
{
  "type": "compression",
  "config": {
    "compressionLevel": 9,
    "methods": ["brotli"]
  }
}
```

**Response** (201 Created):
```json
{
  "ok": true,
  "taskId": "task-123",
  "task": {...}
}
```

---

## Gazetteer & Places

### Get Gazetteer Summary

**GET** `/api/gazetteer/summary`

Get summary statistics for gazetteer data.

**Response** (200 OK):
```json
{
  "totalPlaces": 50000,
  "countries": 195,
  "cities": 10000,
  "states": 3500,
  "lastUpdated": 1728556800000
}
```

---

### List Places

**GET** `/api/gazetteer/places`

Get list of places with filtering.

**Query Parameters**:
- `kind` (string, optional) - Place kind: `country`, `city`, `state`
- `limit` (number, optional) - Max results (default: 100)
- `offset` (number, optional) - Offset for pagination

**Response** (200 OK):
```json
{
  "places": [
    {
      "id": "Q30",
      "name": "United States",
      "kind": "country",
      "latitude": 37.09024,
      "longitude": -95.712891,
      "population": 331449281
    }
  ],
  "total": 195,
  "limit": 100,
  "offset": 0
}
```

---

### Get Place Details

**GET** `/api/gazetteer/place/:id`

Get detailed information about a specific place.

**URL Parameters**:
- `id` (string, required) - Place ID (Wikidata QID)

**Response** (200 OK):
```json
{
  "id": "Q30",
  "name": "United States",
  "kind": "country",
  "latitude": 37.09024,
  "longitude": -95.712891,
  "population": 331449281,
  "aliases": ["USA", "United States of America"],
  "parent": null,
  "children": [...]
}
```

---

### Get Place Articles

**GET** `/api/gazetteer/articles`

Get articles associated with places.

**Query Parameters**:
- `placeId` (string, optional) - Filter by place ID
- `limit` (number, optional) - Max results

**Response** (200 OK):
```json
{
  "articles": [
    {
      "url": "https://example.com/article",
      "title": "News from USA",
      "placeId": "Q30",
      "placeName": "United States",
      "publishedAt": 1728556800000
    }
  ],
  "total": 1500
}
```

---

### Get News Hubs

**GET** `/api/gazetteer/hubs`

Get news hub locations (places with many articles).

**Query Parameters**:
- `minArticles` (number, optional) - Minimum article count (default: 10)

**Response** (200 OK):
```json
{
  "hubs": [
    {
      "placeId": "Q60",
      "placeName": "New York City",
      "articleCount": 5000,
      "latitude": 40.7128,
      "longitude": -74.0060
    }
  ]
}
```

---

### Resolve Place Name

**GET** `/api/gazetteer/resolve`

Resolve place name to Wikidata ID.

**Query Parameters**:
- `name` (string, required) - Place name to resolve

**Response** (200 OK):
```json
{
  "matches": [
    {
      "id": "Q60",
      "name": "New York City",
      "kind": "city",
      "score": 0.95
    }
  ]
}
```

---

### Get Gazetteer Progress

**GET** `/api/gazetteer/progress`

Get progress of gazetteer ingestion.

**Response** (200 OK):
```json
{
  "status": "running",
  "progress": {
    "percent": 60,
    "current": 30000,
    "total": 50000
  },
  "startedAt": 1728556800000,
  "estimatedCompletionAt": 1728560400000
}
```

---

## News Websites

### List News Websites

**GET** `/api/news-websites`

Get list of tracked news websites.

**Response** (200 OK):
```json
{
  "websites": [
    {
      "id": 1,
      "domain": "example.com",
      "name": "Example News",
      "enabled": true,
      "articleCount": 5000,
      "lastCrawled": 1728556800000
    }
  ],
  "total": 50
}
```

---

### Get News Website Details

**GET** `/api/news-websites/:id`

Get detailed information about a news website.

**URL Parameters**:
- `id` (number, required) - Website ID

**Response** (200 OK):
```json
{
  "id": 1,
  "domain": "example.com",
  "name": "Example News",
  "enabled": true,
  "articleCount": 5000,
  "lastCrawled": 1728556800000,
  "sitemaps": [...],
  "stats": {
    "avgArticlesPerDay": 50,
    "totalArticles": 5000
  }
}
```

---

### Create News Website

**POST** `/api/news-websites`

Add a new news website to track.

**Request Body**:
```json
{
  "domain": "newnews.com",
  "name": "New News Site",
  "enabled": true
}
```

**Response** (201 Created):
```json
{
  "id": 51,
  "domain": "newnews.com",
  "name": "New News Site",
  "enabled": true
}
```

---

### Delete News Website

**DELETE** `/api/news-websites/:id`

Delete a tracked news website.

**URL Parameters**:
- `id` (number, required) - Website ID

**Response** (200 OK):
```json
{
  "ok": true,
  "deleted": true
}
```

---

### Toggle News Website Enabled

**PATCH** `/api/news-websites/:id/enabled`

Enable or disable a news website.

**URL Parameters**:
- `id` (number, required) - Website ID

**Request Body**:
```json
{
  "enabled": false
}
```

**Response** (200 OK):
```json
{
  "ok": true,
  "id": 1,
  "enabled": false
}
```

---

### Rebuild News Website Cache

**POST** `/api/news-websites/:id/rebuild-cache`

Rebuild stats cache for a specific news website.

**URL Parameters**:
- `id` (number, required) - Website ID

**Response** (200 OK):
```json
{
  "ok": true,
  "rebuilt": true,
  "stats": {...}
}
```

---

### Rebuild All News Website Caches

**POST** `/api/news-websites/rebuild-all-caches`

Rebuild stats caches for all news websites.

**Response** (200 OK):
```json
{
  "ok": true,
  "rebuilt": 50,
  "duration": 1234
}
```

---

## URL & Content

### List URLs

**GET** `/api/urls`

Get list of crawled URLs.

**Query Parameters**:
- `host` (string, optional) - Filter by host
- `status` (number, optional) - Filter by HTTP status
- `limit` (number, optional) - Max results (default: 100)
- `offset` (number, optional) - Offset for pagination

**Response** (200 OK):
```json
{
  "urls": [
    {
      "url": "https://example.com/article",
      "host": "example.com",
      "status": 200,
      "contentType": "text/html",
      "fetchedAt": 1728556800000
    }
  ],
  "total": 10000,
  "limit": 100,
  "offset": 0
}
```

---

### Get Fetch Body

**GET** `/api/fetch-body`

Get the raw body content of a fetched URL.

**Query Parameters**:
- `url` (string, required) - URL to retrieve content for

**Response** (200 OK):
```
<!DOCTYPE html>
<html>
<head>...</head>
<body>...</body>
</html>
```

**Content-Type**: Depends on original content (e.g., `text/html`, `text/plain`)

---

### Get URL Details

**GET** `/api/url-details`

Get detailed information about a URL.

**Query Parameters**:
- `url` (string, required) - URL to get details for

**Response** (200 OK):
```json
{
  "url": "https://example.com/article",
  "host": "example.com",
  "status": 200,
  "contentType": "text/html",
  "contentLength": 52428,
  "fetchedAt": 1728556800000,
  "headers": {...},
  "metadata": {...}
}
```

---

### Get Recent Domains

**GET** `/api/recent-domains`

Get recently crawled domains.

**Query Parameters**:
- `limit` (number, optional) - Max domains (default: 20)

**Response** (200 OK):
```json
{
  "domains": [
    {
      "domain": "example.com",
      "urlCount": 500,
      "lastFetch": 1728556800000
    }
  ]
}
```

---

### Get Domain Summary

**GET** `/api/domain-summary`

Get summary statistics for a domain.

**Query Parameters**:
- `domain` (string, required) - Domain to summarize

**Response** (200 OK):
```json
{
  "domain": "example.com",
  "urlCount": 500,
  "statusCodes": {
    "200": 450,
    "404": 30,
    "500": 20
  },
  "contentTypes": {
    "text/html": 480,
    "text/xml": 20
  },
  "avgResponseTime": 234,
  "firstFetch": 1728550000000,
  "lastFetch": 1728556800000
}
```

---

## Analysis

### List Analysis Runs

**GET** `/api/analysis`

Get list of analysis runs.

**Response** (200 OK):
```json
{
  "runs": [
    {
      "id": "analysis-123",
      "status": "completed",
      "startedAt": 1728556800000,
      "completedAt": 1728560400000,
      "duration": 3600000,
      "results": {...}
    }
  ],
  "total": 10
}
```

---

### Get Analysis Status

**GET** `/api/analysis/status`

Get current analysis run status.

**Response** (200 OK):
```json
{
  "running": true,
  "currentRun": {
    "id": "analysis-123",
    "status": "running",
    "progress": {
      "percent": 45,
      "current": 4500,
      "total": 10000
    }
  }
}
```

---

### Get Analysis Count

**GET** `/api/analysis/count`

Get count of analysis runs.

**Response** (200 OK):
```json
{
  "total": 10,
  "completed": 8,
  "running": 1,
  "failed": 1
}
```

---

### Get Analysis Run Details

**GET** `/api/analysis/:id`

Get detailed information about an analysis run.

**URL Parameters**:
- `id` (string, required) - Analysis run ID

**Response** (200 OK):
```json
{
  "id": "analysis-123",
  "status": "completed",
  "startedAt": 1728556800000,
  "completedAt": 1728560400000,
  "duration": 3600000,
  "results": {
    "totalArticles": 10000,
    "byLanguage": {...},
    "byTopic": {...}
  }
}
```

---

### Start Analysis (Foreground)

**POST** `/api/analysis/start`

Start an analysis run in the foreground (crawl system).

**Request Body**:
```json
{
  "type": "comprehensive",
  "options": {...}
}
```

**Response** (201 Created):
```json
{
  "ok": true,
  "runId": "analysis-123",
  "startedAt": 1728556800000
}
```

---

### Start Analysis (Background)

**POST** `/api/analysis/start-background`

Start an analysis run as a background task.

**Request Body**:
```json
{
  "type": "comprehensive",
  "config": {...}
}
```

**Response** (201 Created):
```json
{
  "ok": true,
  "taskId": "task-456",
  "task": {...}
}
```

---

## Planning

### Create Plan

**POST** `/api/crawl/plan`

Create a new crawl plan using GOFAI planner.

**Request Body**:
```json
{
  "goal": "crawl-domain",
  "domain": "example.com",
  "constraints": {...}
}
```

**Response** (201 Created):
```json
{
  "sessionId": "plan-abc123",
  "status": "planning",
  "goal": "crawl-domain"
}
```

---

### Get Plan Status

**GET** `/api/crawl/plan/:sessionId/status`

Get status of a planning session.

**URL Parameters**:
- `sessionId` (string, required) - Planning session ID

**Response** (200 OK):
```json
{
  "sessionId": "plan-abc123",
  "status": "ready",
  "plan": {
    "steps": [...],
    "estimatedDuration": 3600000
  }
}
```

---

### Cancel Plan

**POST** `/api/crawl/plan/:sessionId/cancel`

Cancel a planning session.

**URL Parameters**:
- `sessionId` (string, required) - Planning session ID

**Response** (200 OK):
```json
{
  "ok": true,
  "sessionId": "plan-abc123",
  "cancelled": true
}
```

---

### Confirm Plan

**POST** `/api/crawl/plan/:sessionId/confirm`

Confirm and execute a generated plan.

**URL Parameters**:
- `sessionId` (string, required) - Planning session ID

**Response** (200 OK):
```json
{
  "ok": true,
  "sessionId": "plan-abc123",
  "executionId": "exec-xyz789"
}
```

---

## Monitoring & Health

### Get Server Status

**GET** `/api/status`

Get server status and metadata.

**Response** (200 OK):
```json
{
  "status": "running",
  "version": "1.0.0",
  "uptime": 3600000,
  "activeJobs": 2,
  "activeTasks": 1
}
```

---

### Health Check

**GET** `/health`

Simple health check endpoint.

**Response** (200 OK):
```json
{
  "status": "ok",
  "timestamp": 1728556800000
}
```

---

### Get Metrics

**GET** `/metrics`

Get server metrics (Prometheus-compatible format).

**Response** (200 OK):
```
# HELP crawl_jobs_total Total number of crawl jobs
# TYPE crawl_jobs_total counter
crawl_jobs_total 42

# HELP crawl_jobs_active Current active crawl jobs
# TYPE crawl_jobs_active gauge
crawl_jobs_active 2
...
```

---

### Get Recent Errors

**GET** `/api/recent-errors`

Get recent error events.

**Query Parameters**:
- `limit` (number, optional) - Max errors (default: 50)

**Response** (200 OK):
```json
{
  "errors": [
    {
      "timestamp": 1728556800000,
      "message": "Connection timeout",
      "stack": "...",
      "context": {...}
    }
  ],
  "total": 5
}
```

---

### Get Crawl Types

**GET** `/api/crawl-types`

Get available crawl types.

**Response** (200 OK):
```json
{
  "types": [
    {
      "id": "standard",
      "name": "Standard Crawl",
      "description": "Basic web crawling"
    },
    {
      "id": "intelligent",
      "name": "Intelligent Crawl",
      "description": "AI-guided crawling"
    },
    {
      "id": "gazetteer",
      "name": "Geography Crawl",
      "description": "Wikidata geography ingestion"
    }
  ]
}
```

---

### Get Insights

**GET** `/api/insights`

Get system insights and recommendations.

**Response** (200 OK):
```json
{
  "insights": [
    {
      "type": "performance",
      "severity": "info",
      "message": "Average crawl speed: 50 pages/minute"
    },
    {
      "type": "storage",
      "severity": "warning",
      "message": "Database size: 2.5 GB (consider compression)"
    }
  ]
}
```

---

## Navigation & UI

### Get Navigation Links

**GET** `/api/navigation/links`

Get navigation menu links.

**Response** (200 OK):
```json
{
  "links": [
    {
      "label": "Crawls",
      "path": "/crawls",
      "active": false
    },
    {
      "label": "Background Tasks",
      "path": "/background-tasks.html",
      "active": false
    }
  ]
}
```

---

### Get Navigation Bar

**GET** `/api/navigation/bar`

Get navigation bar configuration.

**Response** (200 OK):
```json
{
  "title": "News Crawler",
  "logo": "/assets/logo.svg",
  "links": [...]
}
```

---

## Queues

### List Queues

**GET** `/api/queues`

Get list of job queues.

**Response** (200 OK):
```json
{
  "queues": [
    {
      "id": 1,
      "jobId": "abc123",
      "status": "active",
      "itemCount": 500,
      "createdAt": 1728556800000
    }
  ]
}
```

---

### Get Queue Events

**GET** `/api/queues/:id/events`

Get events for a specific queue.

**URL Parameters**:
- `id` (number, required) - Queue ID

**Query Parameters**:
- `limit` (number, optional) - Max events (default: 100)

**Response** (200 OK):
```json
{
  "events": [
    {
      "id": 1,
      "queueId": 1,
      "type": "enqueue",
      "url": "https://example.com/page",
      "depth": 2,
      "timestamp": 1728556800000
    }
  ],
  "total": 500
}
```

---

## Bootstrap Database

### Get Bootstrap Status

**GET** `/api/bootstrap-db/status`

Get status of database bootstrap process.

**Response** (200 OK):
```json
{
  "status": "completed",
  "lastRun": 1728556800000,
  "recordsImported": 50000
}
```

---

### Run Bootstrap

**POST** `/api/bootstrap-db/run`

Run database bootstrap process.

**Response** (200 OK):
```json
{
  "ok": true,
  "status": "running",
  "startedAt": 1728556800000
}
```

---

## Resume All

### Get Resume All Status

**GET** `/api/resume-all`

Get status of resume-all operation (resume all paused jobs).

**Response** (200 OK):
```json
{
  "canResume": true,
  "pausedJobs": 3,
  "pausedTasks": 2
}
```

---

### Resume All Jobs and Tasks

**POST** `/api/resume-all`

Resume all paused jobs and background tasks.

**Response** (200 OK):
```json
{
  "ok": true,
  "jobsResumed": 3,
  "tasksResumed": 2
}
```

---

## Benchmarks

### List Benchmarks

**GET** `/api/benchmarks`

Get list of performance benchmarks.

**Response** (200 OK):
```json
{
  "benchmarks": [
    {
      "id": 1,
      "name": "Compression Performance",
      "runAt": 1728556800000,
      "results": {...}
    }
  ]
}
```

---

### Get Benchmark Details

**GET** `/api/benchmarks/:id`

Get detailed results for a benchmark.

**URL Parameters**:
- `id` (number, required) - Benchmark ID

**Response** (200 OK):
```json
{
  "id": 1,
  "name": "Compression Performance",
  "runAt": 1728556800000,
  "results": {
    "gzip": { "ratio": 5.2, "time": 1234 },
    "brotli": { "ratio": 8.1, "time": 2345 }
  }
}
```

---

### Run Benchmark

**POST** `/api/benchmarks`

Run a new benchmark.

**Request Body**:
```json
{
  "name": "Compression Performance",
  "config": {...}
}
```

**Response** (201 Created):
```json
{
  "ok": true,
  "benchmarkId": 2,
  "status": "running"
}
```

---

## Problems

### Get Recent Problems

**GET** `/api/problems`

Get recent problem events (errors, warnings).

**Query Parameters**:
- `limit` (number, optional) - Max problems (default: 100)
- `severity` (string, optional) - Filter by severity: `error`, `warning`, `info`

**Response** (200 OK):
```json
{
  "problems": [
    {
      "id": 1,
      "jobId": "abc123",
      "kind": "network-error",
      "message": "Connection timeout",
      "severity": "error",
      "timestamp": 1728556800000,
      "details": {...}
    }
  ],
  "total": 50
}
```

---

## SSE (Server-Sent Events)

### Event Stream

**GET** `/events`

Subscribe to real-time server-sent events.

**Query Parameters**:
- `logs` (string, optional) - Include log messages (`1` = enabled)

**Response**: `text/event-stream`

**Event Types**:
```
event: jobs
data: {"count": 2, "items": [...]}

event: progress
data: {"jobId": "abc123", "percent": 50, "current": 500, "total": 1000}

event: milestone
data: {"jobId": "abc123", "kind": "discovery", "message": "Found sitemap"}

event: telemetry
data: {"jobId": "abc123", "kind": "performance", "value": 1234, "unit": "ms"}

event: log
data: {"jobId": "abc123", "message": "Crawling page...", "level": "info"}
```

---

## Error Responses

All endpoints follow consistent error response format:

**400 Bad Request**:
```json
{
  "error": "Invalid parameter: depth must be a positive number"
}
```

**404 Not Found**:
```json
{
  "error": "Job not found",
  "jobId": "abc123"
}
```

**409 Conflict**:
```json
{
  "error": "Crawl already running",
  "activeJobId": "xyz789"
}
```

**500 Internal Server Error**:
```json
{
  "error": "Internal server error",
  "message": "Database connection failed"
}
```

---

## Rate Limiting

**Current Implementation**: No rate limiting (local development server)

**Future Consideration**: When deploying to production, implement rate limiting on:
- POST endpoints (10 requests/minute per IP)
- GET endpoints (100 requests/minute per IP)
- SSE connections (5 concurrent connections per IP)

---

## Authentication

**Current Implementation**: None (local development server)

**Future Consideration**: When exposing to external networks:
- API key authentication (`X-API-Key` header)
- Session-based authentication for UI
- Role-based access control (read-only, operator, admin)

---

## Related Documentation

- **docs/SERVICE_LAYER_GUIDE.md** - Service layer architecture (maps routes to services)
- **ARCHITECTURE_CRAWLS_VS_BACKGROUND_TASKS.md** - Two-system architecture (crawls vs tasks)
- **docs/HTML_COMPOSITION_ARCHITECTURE.md** - UI and HTML composition patterns
- **RUNBOOK.md** - Operations guide for running the server

---

*Last Updated: October 10, 2025*
*Version: 1.0*
