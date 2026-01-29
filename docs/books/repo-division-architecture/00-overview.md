---
title: Repository Division: Radial API Architecture
description: A comprehensive guide to the architectural transformation of the News Crawler system into a modular, radial system.
status: in-progress
---

# Repository Division: Radial API Architecture

This book documents the architectural shift from a monolithic application to a modular, "Radial API" validation architecture.

## Table of Contents

### 1. [Vision & Architecture](./01-vision.md)
Understanding the "Radial API" concept, the goal of modularity without microservice complexity, and the role of API contracts.

### 2. [The Core Engine](./02-core-engine.md)
Deep dive into `news-crawler-core` and `news-crawler-db`. The immutable foundation that simply acquires and stores data.

### 3. [The Brain: Intelligence & Analysis](./03-intelligence.md)
How `news-intelligence`, `news-db-pure-analysis`, and `news-gazetteer` extract meaning from raw content using pure functions and stateless logic.

### 4. [The Gateway: API Layer](./04-api-gateway.md)
The role of `news-api` as the unified aggregation layer, handling auth, rate-limiting, and SSE streaming.

### 5. [The User: Modular UI](./05-modular-ui.md)
Moving from a monolithic UI to specialized "Periphery UIs" that sit close to their data sources.

### 6. [Supporting Services](./06-supporting-services.md)
Identity, Billing, and the foundational libraries (`jsgui3`, `lang-tools`) that power the ecosystem.

---

> "The goal is to allow the Brain to evolve 10x faster than the Engine, without breaking it."
