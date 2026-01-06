# Crawl & Analysis Integration Book

**A comprehensive guide to building a smooth, AI-agent-friendly news crawling and analysis pipeline**

---

## Purpose

This book documents the architecture, workflows, and integration patterns for the news crawl and analysis system. It serves as:

1. **Reference documentation** for AI agents working with the codebase
2. **Architectural guide** for understanding how components fit together
3. **Implementation roadmap** for completing the integration vision
4. **Troubleshooting manual** for diagnosing common issues

---

## Book Structure

### Part I: Foundation
- [Chapter 1: System Overview](chapters/01-system-overview.md) — The big picture
- [Chapter 2: Data Flow](chapters/02-data-flow.md) — How data moves through the system
- [Chapter 3: Database Schema](chapters/03-database-schema.md) — Core tables and relationships

### Part II: Crawl System
- [Chapter 4: Crawl Architecture](chapters/04-crawl-architecture.md) — Components and patterns
- [Chapter 5: Crawl Daemon](chapters/05-crawl-daemon.md) — Background daemon for AI control
- [Chapter 6: Crawl Operations](chapters/06-crawl-operations.md) — Available operations and presets
- [Chapter 7: Crawl Telemetry](chapters/07-crawl-telemetry.md) — Monitoring and observability

### Part III: Analysis System
- [Chapter 8: Analysis Pipeline](chapters/08-analysis-pipeline.md) — Content analysis workflow
- [Chapter 9: Analysis Observable](chapters/09-analysis-observable.md) — Real-time progress streaming
- [Chapter 10: Place Disambiguation](chapters/10-place-disambiguation.md) — Geographic entity resolution

### Part IV: Integration
- [Chapter 11: Unified Workflow](chapters/11-unified-workflow.md) — Crawl → Analysis → Export
- [Chapter 12: AI Agent Patterns](chapters/12-ai-agent-patterns.md) — How agents interact with the system
- [Chapter 13: Error Recovery](chapters/13-error-recovery.md) — Handling failures gracefully

### Part V: Future Vision
- [Chapter 14: Development Roadmap](chapters/14-roadmap.md) — What's next
- [Chapter 15: Performance Targets](chapters/15-performance.md) — Benchmarks and goals

### Part VI: Implementation
- [Chapter 16: Implementation Guide](chapters/16-implementation-guide.md) — From current state to target

---

## Current vs Target State

| Component | Current State | Target State | Chapter |
|-----------|---------------|--------------|---------|
| Crawl Daemon | ✅ Production-ready | ✅ Done | [Ch. 5](chapters/05-crawl-daemon.md) |
| Crawl API | ✅ Complete | ✅ Done | [Ch. 5](chapters/05-crawl-daemon.md) |
| Analysis Observable | ⚠️ Lab prototype | Production module | [Ch. 9](chapters/09-analysis-observable.md) |
| Unified Pipeline | ⚠️ Lab only | `PipelineOrchestrator` class | [Ch. 11](chapters/11-unified-workflow.md) |
| Place Disambiguation | ⚠️ Basic scoring | Multi-feature scoring | [Ch. 10](chapters/10-place-disambiguation.md) |
| XPath Extractors | ⚠️ ~20 patterns | 100+ patterns | [Ch. 8](chapters/08-analysis-pipeline.md) |
| Multi-language | ❌ Not started | 10 languages | [Ch. 10](chapters/10-place-disambiguation.md) |

See [Chapter 16](chapters/16-implementation-guide.md) for detailed migration paths.

**→ [Start Here: FIRST_STEPS.md](FIRST_STEPS.md)** — Executable commands to begin implementation.

---

## Quick Start for AI Agents

```bash
# 1. Start the crawl daemon
node tools/dev/crawl-daemon.js start

# 2. Run a crawl job
node tools/dev/crawl-api.js jobs start basicArticleCrawl https://bbc.com -n 100 --json

# 3. Monitor job progress
node tools/dev/crawl-api.js jobs get <jobId> --json

# 4. Run analysis on new content
node labs/analysis-observable/run-all.js --limit 100 --headless

# 5. Stop daemon when done
node tools/dev/crawl-daemon.js stop
```

---

## Diagrams

Visual architecture diagrams are in the [diagrams/](diagrams/) folder:

| Diagram | Description |
|---------|-------------|
| [system-overview.svg](diagrams/system-overview.svg) | High-level system architecture |
| [data-flow.svg](diagrams/data-flow.svg) | Data flow through pipeline |
| [daemon-architecture.svg](diagrams/daemon-architecture.svg) | Crawl daemon internals |

---

## Version History

| Date | Version | Changes |
|------|---------|---------|
| 2026-01-05 | 1.1.0 | Added Chapter 16: Implementation Guide with current vs target state |
| 2026-01-05 | 1.0.0 | Initial book structure |

