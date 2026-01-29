# 5. The User: Modular UI

The final orbit of our architecture is the **User Interface**. In `v5`, we abandon the idea of a single, monolithic "Admin App" that does everything.

## The Problem with Monolithic UIs
As features grow, a single `admin-ui` becomes a tangled mess of unrelated concerns.
*   The "Crawl Status" widget needs live socket updates.
*   The "Billing" page needs Stripe integration.
*   The "Data Explorer" needs complex virtual scrolling.
*   The "Diagram Editor" needs SVG manipulation.

Bundling these together means a bug in the CSS of the Diagram Editor could theoretically break the layout of the Billing page.

## The Solution: Periphery UIs

We position UIs conceptually (and often physically in the repo structure) near the data they serve.

### 1. The Crawl Observer
*   **Purpose:** Watch the robot work.
*   **Features:** Real-time progress bars, log streams (`jsgui3-log-view`), queue visualizations.
*   **Backend:** Talks primarily to `news-crawler-core` (via API).

### 2. The Data Explorer
*   **Purpose:** Inspect the "Truth".
*   **Features:** Table views, JSON inspectors, SQL playgrounds.
*   **Backend:** Talks to `news-crawler-db` (via API).

### 3. The Analytics Hub
*   **Purpose:** Visualize Insights.
*   **Features:** Charts (`flexi-chart`), Trend Graphs, Topic Maps.
*   **Backend:** Talks to `news-intelligence` and `news-db-pure-analysis`.

## The Composite Dashboard

While deployment is modular, the *user experience* can still be unified. We use a **Shell Application** (likely the root `/` of `news-api`) that serves a navigation frame. This frame loads the Modular UIs into main content areas.

This gives us the best of both worlds:
*   **Development Isolation:** A dev can work on the "Analytics Hub" without running the "Crawl Observer".
*   **Unified UX:** The user sees one cohesive Tool.

> "The Interface should follow the contour of the Information."
