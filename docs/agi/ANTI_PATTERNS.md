# Anti-Patterns Catalog

AGI-accumulated knowledge catalog.

---


## Factory That Just Wraps Constructor

**Added**: 2025-12-03
**Context**: CrawlerFactory.js analysis

**When to use**: Symptoms: Factory class with single create() method that just calls new Target()

**Steps/Details**:
1. Why it's bad: Adds indirection without value
1. Better approach: Use constructor injection directly (new Target(url, options, services))

**Example**: See session 2025-11-21-crawler-refactor

---

## Breaking Public API During Extraction

**Added**: 2025-12-03
**Context**: NewsCrawler.js refactoring, any large class modularization

**When to use**: Symptoms: Changing method signatures, removing methods, requiring callers to import extracted modules directly, breaking existing tests

**Steps/Details**:
1. Why it's bad: Extraction should be invisible to callers. Breaking changes create cascading work across the codebase and risk regressions. The original class becomes a facade that delegates to extracted services.
1. Better approach: Keep public API stable. New code delegates to extracted services. Old tests keep passing. Add new tests for extracted service. Example: NewsCrawler.processPage() still works but internally calls this.pageExecutionService.processPage()

**Example**: Moving NewsCrawler.crawlConcurrent to a separate file but changing its signature or requiring callers to import the new module

---
