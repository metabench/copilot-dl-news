# 📚 The Engineering Library

This directory contains the authoritative "books" for the Copilot DL News architecture. Each book covers a specific domain of the system, providing deep technical context, architectural decisions, and implementation guides.

## 📘 Book 1: The Crawler Handbook
**Status:** *Planned*
**Focus:** Distributed crawling architecture, queue management, and fetching strategies.
- **Key Concepts:** `IUrlQueue`, `PostgresUrlQueueAdapter`, Politeness, Retry Logic.
- **Goal:** Document how to scale from a single process to a distributed fleet.

## 📘 Book 2: Content Analysis & Classification
**Status:** *Active*
**Focus:** NLP, entity extraction, and topic classification.
- **Current Chapters:**
  - [Place Extraction & Matching](./content-analysis-classification-handbook/06-place-extraction-matching.md)
  - *Planned:* Topic Classification, Sentiment Analysis.

## 📘 Book 3: UI & Visualization Guide
**Status:** *Planned*
**Focus:** The `jsgui3` framework, dashboards, and SVG generation.
- **Key Concepts:** Server-side rendering, Client-side hydration, SVG spatial reasoning.
- **Goal:** Standardize the creation of interactive data tools.

## 📘 Book 4: Database & Architecture Guide
**Status:** *Planned*
**Focus:** Data persistence, schema management, and the transition to Postgres/PostGIS.
- **Key Concepts:**
  - SQLite (`better-sqlite3`) for local development and caching.
  - Postgres/PostGIS (`planet1`) for geospatial truth and distributed state.
  - Schema synchronization (`schema-sync`).

## 📘 Book 5: 2D SVG Spatial Reasoning
**Status:** *Active*
**Location:** [2d-svg-spatial-reasoning](./2d-svg-spatial-reasoning/README.md)
**Focus:** Algorithms for generating collision-free, semantic SVG diagrams.

---

## Contribution Guide
- **One Concept, One Chapter:** Keep chapters focused.
- **Code References:** Link to actual source files with line counts where helpful.
- **Diagrams:** Use Mermaid or SVG for architectural flows.
