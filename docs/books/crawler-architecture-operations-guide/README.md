# Crawler Architecture & Operations Guide

**Version:** 1.0
**Audience:** Developers extending the crawler
**Last Updated:** January 2026

## Overview

This book provides comprehensive documentation for the copilot-dl-news crawler system. The crawler is a sophisticated, modular system with 50+ specialized services designed for large-scale news article discovery and acquisition.

## Table of Contents

1. [Architecture Overview](./01-architecture-overview.md) - Service-oriented design, wiring pattern, event flow
2. [The Fetch Pipeline](./02-fetch-pipeline.md) - HTTP fetching, fallbacks, caching, retries
3. [Priority Queue System](./03-priority-queue-system.md) - PriorityScorer, bonuses, weights, ConfigManager
4. [Intelligent Planning](./04-intelligent-planning.md) - HierarchicalPlanner, problem clustering, gap analysis
5. [Classification Cascade](./05-classification-cascade.md) - Stage1 (URL) → Stage2 (Content) → Stage3 (Puppeteer)
6. [Decision Tree Configuration](./06-decision-tree-configuration.md) - Writing and testing URL classification trees
7. [Telemetry & Monitoring](./07-telemetry-monitoring.md) - CrawlTelemetryBridge, SSE broadcast, event schema
8. [Crawl Modes](./08-crawl-modes.md) - Basic, Intelligent, Gazetteer, Structure-only
9. [Operations Runbook](./09-operations-runbook.md) - Starting crawls, monitoring, troubleshooting

## Quick Start

```javascript
const { NewsCrawler } = require('./src/crawler/NewsCrawler');

const crawler = new NewsCrawler('https://www.theguardian.com', {
  maxDownloads: 100,
  crawlType: 'intelligent',
  dbPath: './data/news.db'
});

await crawler.init();
await crawler.crawl();
```

## Key Concepts

| Concept | Description |
|---------|-------------|
| **Service Wiring** | IoC container pattern connecting 50+ services |
| **Fetch Pipeline** | Multi-layer HTTP fetching with fallbacks |
| **Priority Queue** | Min-heap based priority queue with configurable scoring |
| **Telemetry Bridge** | Real-time SSE event streaming to connected clients |
| **Classification Cascade** | Three-stage URL/content classification |

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                         NewsCrawler                                  │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │              CrawlerServiceWiring (IoC Container)            │   │
│  │  ┌──────────────┐ ┌──────────────┐ ┌──────────────────────┐ │   │
│  │  │ FetchPipeline│ │ QueueManager │ │ PageExecutionService │ │   │
│  │  └──────────────┘ └──────────────┘ └──────────────────────┘ │   │
│  │  ┌──────────────┐ ┌──────────────┐ ┌──────────────────────┐ │   │
│  │  │ArticleProcess│ │  LinkExtract │ │ NavigationDiscovery  │ │   │
│  │  └──────────────┘ └──────────────┘ └──────────────────────┘ │   │
│  │  ┌──────────────┐ ┌──────────────┐ ┌──────────────────────┐ │   │
│  │  │ PriorityScore│ │HierarchicalPl│ │ TelemetryBridge      │ │   │
│  │  └──────────────┘ └──────────────┘ └──────────────────────┘ │   │
│  └─────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

## File Structure

```
src/crawler/
├── NewsCrawler.js          # Main orchestrator (2305 lines)
├── CrawlerServiceWiring.js # IoC container (448 lines)
├── core/
│   └── Crawler.js          # Base crawler class
├── FetchPipeline.js        # HTTP fetching (1532 lines)
├── QueueManager.js         # Priority queue (812 lines)
├── PriorityScorer.js       # Scoring logic (610 lines)
├── HierarchicalPlanner.js  # Planning system (683 lines)
├── telemetry/
│   ├── CrawlTelemetryBridge.js   # SSE broadcast
│   ├── CrawlTelemetrySchema.js   # Event schemas
│   └── TelemetryIntegration.js   # Express integration
└── ... (50+ more services)
```

## Related Documentation

- [JSGUI3 UI Architecture Guide](../guides/JSGUI3_UI_ARCHITECTURE_GUIDE.md)
- [Database Quick Reference](../DATABASE_QUICK_REFERENCE.md)
- [Testing Quick Reference](../TESTING_QUICK_REFERENCE.md)
