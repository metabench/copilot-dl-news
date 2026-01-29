# 2. The Core Engine

The **Core Engine** is the dense center of our radial architecture. It consists of two primary packages: `news-crawler-core` and `news-crawler-db`.

## The Philosophy of "Core"

In many systems, business logic creeps into the lowest layers. Validation rules for "Trending Topics" end up in the Database models. This makes the database layer brittle—changing a trend algorithm shouldn't break the storage layer.

The **Core Engine** rejects this. It has a single, simple mandate: **Preserve Reality.**

*   It fetches what *is* (the HTML on the web).
*   It stores it faithfully.
*   It allows retrieving it efficiently.
*   **It does NOT interpret.** (Interpretation is for the Intelligence layer).

## Components

### 1. `news-crawler-core`

This package drives the mechanical act of crawling. It is an "Engine" in the literal sense: it takes fuel (URLs) and produces motion (HTTP requests and storage operations).

**Key Responsibilities:**
*   **Queue Management:** `PriorityQueue<T>` logic.
*   **Rate Limiting:** Ensuring we don't hammer servers (politeness).
*   **Fetch Loop:** Request -> Response -> Store.
*   **Telemetry:** Emitting raw signals (progress, errors) via `telemetry` events.

**What is EXCLUDED:**
*   Deciding "Is this article interesting?" (That's *Planning*).
*   Extracting "Who is mentioned?" (That's *Intelligence*).

### 2. `news-crawler-db`

This is the persistence layer. It provides **The Truth**.

**The 14 Access Modules:**
We have strictly defined 14 "Access Modules" that govern all data I/O. No ad-hoc SQL queries are allowed outside these modules.

*   `adapter.articles`: CRUD for HTML content.
*   `adapter.urls`: The known universe of links.
*   `adapter.fetches`: The history of our network attempts.
*   `adapter.links`: The graph connections between pages.
*   ...and 10 others.

**Design Pattern: The Adapter Interface**
We use a strict Interface (`DbAdapter`) that decouples the implementation (Sqlite, Postgres) from the usage.

```typescript
// The Contract
interface ArticleAdapter {
  upsert(article: Article): number;
  findById(id: number): Article | null;
}
```

## The Immutable Foundation

Because the Core does not interpret, it rarely needs to change.
*   HTML is always HTML.
*   A URL is always a URL.
*   A Timestamp is always a Timestamp.

By keeping the Core "dumb" but robust, we ensure that the experimental and volatile "Intelligence" layers can crash, change, or be rewritten without ever risking the system's ability to crawl and store data.

> "The Core remembers everything, but understands nothing."
