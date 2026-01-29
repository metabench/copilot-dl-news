# 4. The Gateway: API Layer

The **API Layer** (`news-api`) is the unifying force in the Radial Architecture. It is the single point of entry for the outside world (UIs, CLIs, 3rd party tools) to access both the Core Data and the Intelligence Insights.

## The Role of the Gateway

In a partitioned system, it is tempting to have each module expose its own API.
*   `news-crawler-db` exposes port 3001
*   `news-intelligence` exposes port 3002
*   `news-gazetteer` exposes port 3003

**We explicitly reject this.** This leads to "Microservice Sprawl" and makes the frontend client complex (it needs to know 3 different base URLs).

Instead, `news-api` aggregates everything into a single, cohesive namespace:

*   `GET /api/v1/articles` (proxies to Core)
*   `GET /api/v1/trends` (proxies to Intelligence)
*   `GET /api/v1/places` (proxies to Gazetteer)

## Unified Capabilities

By funneling everything through one gateway, we gain centralized control over cross-cutting concerns:

1.  **Authentication:** One login system (OAuth/JWT) protects all data.
2.  **Rate Limiting:** One `RateLimiter` ensures no user abuses the system, regardless of which backend module they are hitting.
3.  **SSE Streaming:** The gateway manages the persistent connections for Server-Sent Events (`/events`), broadcasting signals from the deep core (progress) and intelligence layers (alerts) over a single pipe.

## The Contract

The critical deliverable of this layer is **The Contract**.
All return types are strictly typed (TypeScript interfaces sharing a common package `@news/protocol` or similar).

*   **Request:** `CrawlOptions`
*   **Response:** `CrawlResult`
*   **Event:** `CrawlProgress`

This ensures that the "Periphery UIs" (Chapter 5) can be built against a stable spec, even if we completely rewrite the underlying Core engine.

> "The Gateway transforms internal complexity into external simplicity."
