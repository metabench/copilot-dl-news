# Deterministic Place Resolution for News

**A Practical Guide to Building a Gazetteer-Backed Disambiguation System**

*Working draft — January 2026*

---

## About This Book

This book is both a learning resource and an implementation guide. Each chapter explains concepts deeply enough to understand them, then shows exactly how to build them. Reading this book *is* part of the work.

**Target system**: A news crawler processing 10,000+ articles/day that must resolve ambiguous place names ("London", "Paris", "Victoria") to specific geographic entities with confidence scores and explanations.

**Constraints**:
- Deterministic (same input → same output)
- Explainable (human-readable reasoning)
- Fast (< 100ms per article after warm cache)
- No ML training required

---

## Table of Contents

### Foundation
0. [Architectural Principles](./chapters/00-architectural-principles.md) ⚠️ **READ FIRST**

### Part I: Understanding the Problem
1. [Why Place Names Are Hard](./chapters/01-why-place-names-are-hard.md)
2. [The Disambiguation Pipeline](./chapters/02-disambiguation-pipeline.md)
3. [Data Sources and Trade-offs](./chapters/03-data-sources.md)

### Part II: The Spatial Foundation
4. [PostGIS Fundamentals for Gazetteer Work](./chapters/04-postgis-fundamentals.md)
5. [Administrative Hierarchies](./chapters/05-admin-hierarchies.md)
6. [The SRID Problem (and How to Solve It)](./chapters/06-srid-problem.md)
7. [Building Containment Graphs](./chapters/07-containment-graphs.md)

### Part III: The Serving Layer
8. [SQLite as a Gazetteer Cache](./chapters/08-sqlite-cache.md)
9. [Schema Design for Fast Lookups](./chapters/09-schema-design.md)
10. [Syncing PostGIS → SQLite](./chapters/10-sync-pipeline.md)

### Part IV: The Disambiguation Algorithm
11. [Candidate Generation](./chapters/11-candidate-generation.md)
12. [Feature Engineering for Places](./chapters/12-feature-engineering.md)
13. [Scoring and Ranking](./chapters/13-scoring-ranking.md)
14. [The Coherence Pass](./chapters/14-coherence-pass.md)
15. [Confidence and Explanations](./chapters/15-confidence-explanations.md)

### Part V: Implementation
16. [Building the Disambiguation Service](./chapters/16-building-service.md)
17. [Testing and Validation](./chapters/17-testing-validation.md)
18. [Debugging Misclassifications](./chapters/18-debugging.md)
19. [Rerunning Analysis for Place Data](./chapters/19-rerunning-analysis.md) ⚡ **NEW**

### Appendices
- [A. SQL Recipes](./appendices/a-sql-recipes.md)
- [B. Weight Tuning Cookbook](./appendices/b-weight-tuning.md)
- [C. Publisher Priors Table](./appendices/c-publisher-priors.md)

---

## How to Use This Book

**If you're learning**: Read Part I first, then skim Part II before diving deep.

**If you're implementing**: Each chapter ends with "What to Build" — follow those sections in order.

**If you're debugging**: Jump to Chapter 18, then work backwards to the relevant concept chapter.

---

## Quick Reference

| Concept | Chapter |
|---------|---------|
| **SQL in adapters only** | 0 ⚠️ |
| Why "London" is ambiguous | 1 |
| repr_pt vs polygon intersects | 6, 7 |
| SRID 4326 vs 3857 | 6 |
| SQLite schema | 9 |
| Scoring weights | 13 |
| Coherence bonus | 14 |
