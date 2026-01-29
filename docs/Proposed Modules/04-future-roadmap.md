# Future Module Extraction Roadmap

**Status**: Proposed
**Date**: 2026-01-20
**Context**: Transitioning `copilot-dl-news` from monorepo to modular ecosystem.

---

## Strategic Alignment with AGI Documentation

This roadmap aligns with `docs/agi/PATTERNS.md` specifically:
- **"Modularize God Class via Service Extraction"**: Decomposing the monolithic `src/` folder.
- **"Skills as Capability Packs"**: Creating focused modules that agents can master individually.
- **"Lesson: Backsliding Prevention"**: Enforcing strict boundaries (e.g., UI only talks to API, Classifiers are pure logic).

## Candidate Modules for Extraction

### 1. News Platform UI (`news-platform-ui`)
**Current Location**: `src/ui/`, `src/deprecated-ui/`, `src/admin/`
**Role**: Single-Page Application (SPA) for managing the platform.
**Why Extract**:
- Decouples frontend build tools (Vite/Webpack) from backend worker logic.
- Allows agents to focus purely on "Visual Design" and "User Experience" without distraction from crawler internals.
- Enforces API-first design (UI must consume `news-crawler-db` API).

> [!TIP]
> **Bootstrap Prompt**
> ```text
> Create a strictly typed React+Vite admin dashboard "news-platform-ui".
> Tech Stack: React 18, TypeScript, TailwindCSS, TanStack Query, Zustand.
> Features:
> 1. Dashboard (stats widgets from /api/stats)
> 2. Crawler Control (start/stop/pause via /api/crawler)
> 3. Data Explorer (ag-grid table for articles)
> 4. Log Viewer (virtualized list for logs)
> Structure: src/ (components, hooks, stores, services).
> Requirements:
> - No direct DB access (REST API only).
> - Mock API service for local dev.
> - "WLILO" (White Leather/Industrial Luxury) theme support.
> ```

### 2. News Gazetteer (`news-gazetteer`)
**Current Location**: `src/geo/`, `src/services/Geo*`, `data/db/**/gazetteer.*.js`
**Role**: Place intelligence, hub discovery, and geospatial query engine.
**Why Extract**:
- High complexity domain (spatial queries, disambiguation, place matching).
- Needs specialized GIS dependencies (turf.js, etc.) not needed by the crawler.
- Can be shared/imported by analysis agents independently.

> [!TIP]
> **Bootstrap Prompt**
> ```text
> Create a TypeScript package "news-gazetteer" for geospatial intelligence.
> Features:
> 1. PlaceDisambiguator (text -> place candidate)
> 2. HubDiscoverer (url pattern -> place hub)
> 3. GeoSpatialIndex (in-memory R-tree or localized lookups)
> 4. Curated country/city datasets (embedded JSON/CSV).
> API:
> - resolvePlace(text: string): PlaceCandidate[]
> - identifyHub(url: string): PlaceHub | null
> - findNearby(lat, lon, radius): Place[]
> Structure: src/ (index, disambiguation, hubs, data).
> Tests: Vitest with heavy fixture coverage for global cities/hubs.
> ```

### 3. News Intelligence (`news-intelligence`)
**Current Location**: `src/intelligence/`, `src/classifiers/`, `src/services/*Classification*`
**Role**: Pure logic library for NLP, Classification, and Pattern Recognition.
**Why Extract**:
- **Separation of Concerns**: Logic (classifiers) vs Execution (crawler helpers).
- Enables rapid iteration on improved AI models without redeploying the database layer.
- Zero dependencies on the Database (Pure Input -> Pure Output).

> [!TIP]
> **Bootstrap Prompt**
> ```text
> Create a pure TypeScript processing library "news-intelligence".
> Focus: Stateless classification and text analysis.
> Modules:
> 1. classifiers/ (Stage1Url, Stage2Content, Stage3Visual)
> 2. extractors/ (DateExtractor, AuthorExtractor, ContentExtractor)
> 3. nlp/ (KeywordExtraction, SummaryGenerator - via simple heuristics or optional AI hook)
> API:
> - classifyUrl(url): ClassificationResult
> - extractMetadata(html): ArticleMetadata
> - detectTrend(text[]): TrendScore
> Requirements:
> - Input: raw strings/HTML/objects. Output: typed result objects.
> - NO database dependencies. NO network calls (unless configured).
> - 100% test coverage with fixture HTML files.
> ```

---

## Migration Strategy

1. **Bootstrap**: Initialize empty repos using prompts.
2. **Move Logic**: Copy code from `copilot-dl-news/src/...` to new repos.
3. **Publish/Link**: Use `npm link` or local file deps to consume in monolithic app during transition.
4. **Delete**: Remove original code from `copilot-dl-news`, replacing with imports.

## Agent Workflow Impact
- **Crawler Agent**: Focuses on `copilot-dl-news` (orchestration).
- **UI Agent**: Focuses on `news-platform-ui` (React/CSS).
- **Data Scientist**: Focuses on `news-db-analysis` (SQL/Aggregations).
- **NLP Engineer**: Focuses on `news-intelligence` (Algorithms).
