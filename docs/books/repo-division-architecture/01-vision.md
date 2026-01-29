# 1. Vision: The Radial API Architecture

The **Radial API Architecture** is the governing design pattern for the next evolution of the News Crawler system. It represents a shift from a "Layered Monolith" to a hub-and-spoke model where a stable Core grounds a rapidly evolving Periphery.

## The Problem with the Monolith

In the previous design (`v3`), features were tightly coupled. Adding a new "Trend Detection" feature often required touching the DB schema, the core crawler service, the API routes, and the monolithic Admin UI simultaneously.

*   **Risk:** Changes to experimental "intelligence" features could destabilize the mission-critical "crawler" engine.
*   **Cognitive Load:** Developers had to understand the entire stack to make small changes.
*   **Velocity:** Fast-moving experimental code was held back by the testing rigor required for the core storage engine.

## The Solution: Radial Division

The `v5` architecture divides the system into concentric circles of stability:

### 1. The Immutable Core (Center)
At the center sits **`news-crawler-core`** and **`news-crawler-db`**.
*   **Responsibility:** Fetch pages, store HTML, manage crawl queues.
*   **Change Rate:** Slow.
*   **Constraint:** Must never crash. High reliability.

### 2. The Pure Intelligence Layer (Orbit 1)
Surrounding the core are logic modules like **`news-intelligence`**, **`news-db-pure-analysis`**, and **`news-gazetteer`**.
*   **Responsibility:** Read data from Core, derive new insights (Topics, Trends, Geo-tags), and return structured data.
*   **Constraint:** Stateless. Pure functions. "read-compute-return".

### 3. The API Gateway (Orbit 2)
**`news-api`** acts as the unification layer.
*   **Responsibility:** Aggregates raw data from Core and derived data from Intelligence into clean JSON APIs.
*   **Constraint:** Standardization. Stable Contracts.

### 4. The Periphery UI (Outer Orbit)
Instead of one massive "Admin App", we have specialized UIs located conceptually near their backends:
*   **Crawl Observer:** Directly observes the Crawler.
*   **Data Explorer:** Visualizes the Database.
*   **Analytics Hub:** Visualizes the Intelligence.

## Key Principle: "Gravity"

In this architecture, **Data has Gravity**.
*   The DB is the heaviest object; it sits at the center.
*   The Crawler is attached tightly to the DB.
*   Analysis modules orbit the data—they come to the data, process it, and save lightweight results back (or just flux them to the API).
*   UI modules orbit the API.

## Success Metrics

1.  **Safety:** We can rewrite the entire Trend Detector without risking a Crawler outage.
2.  **Focus:** A dev working on "Place Matching" only creates `news-gazetteer` and doesn't load the Crawler code.
3.  **Clarity:** API Contracts enforce clear boundaries between "Raw Storage" and "Intepreted Meaning".
