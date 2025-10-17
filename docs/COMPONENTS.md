# System Components Overview

**Status**: COMPLETE  
**Last Updated**: October 10, 2025  
**When to Read**: You need a high-level overview of system architecture and main components

This document describes the main components of the crawl news system and their responsibilities.

## UI Server (`src/ui/express/server.js`)
- Express server for APIs, Server-Sent Events (SSE), and static HTML/JS/CSS
- Spawns crawler child processes and relays structured output to clients
- Hosts navigation service and exposes `/api/navigation/*` endpoints
- Provides SSR pages for queues, analysis, problems, and milestones

## Crawler Core (`src/crawl.js`)
- Fetches and parses web pages, respects robots.txt and sitemaps
- Implements per-domain pacing, backoff, and cache prioritization
- Emits structured progress, queue, problem, and milestone events via the `CrawlerTelemetry` facade (`crawler.telemetry.*`)
- Writes crawl results and telemetry to SQLite database

## Database Layer (`src/db.js`)
- Manages SQLite schema, migrations, and helpers for all tables
- Handles articles, fetches, links, URLs, domains, categories, jobs, queues, problems, milestones, and analysis runs
- Provides read/write access for crawler and read-only access for UI server

## Analysis Modules (`src/analysis/*`)
- `page-analyzer.js`: Orchestrates article and hub analysis
- `place-extraction.js`: Gazetteer matching and place context helpers
- `deep-analyzer.js`: Pluggable deep analysis (key phrases, sentiment)

## Static UI (`src/ui/express/public/*`)
- HTML, JS, and CSS for the web interface
- Subscribes to SSE for live updates (progress, logs, jobs, milestones)
- Hydrates navigation bar and renders dashboards, queues, and analysis views

## Test Infrastructure (`ui/__tests__/`)
- Jest test suites for API, SSE, UI, and crawler logic
- Uses fake runner for deterministic, fast test cycles

## Tools & Scripts
- `src/tools/analyse-pages.js`: Batch page analysis and milestone awarding
- `src/tools/analysis-run.js`: Offline analysis pipeline and event tracking

## Supporting Services
- `src/ui/express/services/navigation.js`: Global navigation registry and HTML rendering
- `src/ui/express/services/buildArgs.js`: Translates API requests to crawler CLI arguments

---

For API details, see `API.md`. For database schema, see `PERSISTENCE.md`. For change history, see `CHANGELOG.md`. For agent guidance, see `AGENTS.md`.