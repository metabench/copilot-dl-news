# 3. The Brain: Intelligence & Analysis

If the Core Engine is the "Body" that acts and remembers, the **Intelligence Layer** is the "Brain" that thinks and interprets.

## The Logic Loop

The Intelligence layer operates on a simple cycle:
1.  **Read:** Fetch raw data (HTML, URLs) from the Core.
2.  **Think:** Apply pure functions, classifiers, and heuristics.
3.  **Write:** Save the derived meaning (Tags, Topics, Locations) back or flux it to the API.

## Components

### 1. `news-db-pure-analysis` (The Logic Library)
This is an extracted, standalone repository containing *pure business logic*.
*   **No Database:** It doesn't know what SQL is.
*   **No I/O:** It doesn't fetch webpages.
*   **Just Input -> Output.**

Examples:
*   `detectTrends(topicCounts[]) -> TrendScore`
*   `computeSimHash(text) -> HexString`
*   `analyzeSentiment(text) -> Score`

By isolating this, we make the "science" of the system unit-testable in milliseconds.

### 2. `news-intelligence` (The Classifier)
This module acts as the bridge between raw data and pure logic. It sits in the first orbit.
*   **Classifiers:** `ArticleClassifier`, `HubClassifier`.
*   **Planner:** `CrawlPlanner` (decides *what* to fetch next based on gaps).

It answers questions like: *"Is this page an article or a homepage?"* or *"What entities are mentioned here?"*

### 3. `news-gazetteer` (The Geographer)
Specialized intelligence for places.
*   **Responsibility:** scans text for "Paris", "London", "The White House" and resolves them to canonical Place IDs.
*   **Hub Prediction:** Uses geographic models to predict where to find local news for a specific region.

## Verification of Knowledge

The Intelligence layer is where **Confidence** comes into play.
*   The Core deals in Absolutes (This HTML *was* downloaded).
*   The Brain deals in Probabilities (This is *likely* an article about Politics, 85% confidence).

By separating these, we can handle "False Positives" in the intelligence layer without corrupting the underlying "Truth" in the storage layer. We can re-run analysis (Correction) without re-crawling (Refetching).

> "The Brain evolves 10x faster than the Body."
