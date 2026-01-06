# Chapter 20: Active Place Hub Discovery

While the core disambiguation pipeline (Chapters 11-15) focuses on extracting and resolving places from *existing* content, we often face a "bootstrapping" problem when entering a new geographic region or onboarding a new publisher. We don't have enough history to know where their "hubs" are—the section pages that aggregate content for specific cities or regions.

**Active Place Hub Discovery** flips the flow: instead of waiting to find URLs in sitemaps, we *predict* where they should be and probe for them.

## The Pattern Hypothesis

News publishers are surprisingly consistent. If they have a page for `bogota`, it's likely at:
- `/colombia/bogota`
- `/regiones/bogota`
- `/noticias/bogota`

If we know the "Place Parent" (e.g., Colombia) and a "Pattern" (e.g., `/colombia/{slug}`), we can generate hundreds of high-probability candidate URLs by iterating through the known children (cities, regions) of that parent in our Gazetteer.

## The Discovery Process

1.  **Selection**: The user selects a **Target Domain** (e.g., `eltiempo.com`) and a **Parent Place** (e.g., `Colombia`).
2.  **Expansion**: The system queries the Gazetteer for all significant children of the Parent Place (e.g., all cities in Colombia with >100k population).
3.  **Generation**: For each child place, we generate candidate URLs using the **Active Pattern**:
    *   Pattern: `/colombia/{slug}`
    *   Child: "Medellín" -> Slug: `medellin` -> URL: `eltiempo.com/colombia/medellin`
    *   Child: "Cartagena" -> Slug: `cartagena` -> URL: `eltiempo.com/colombia/cartagena`
4.  **Probing**: The crawler performs a `HEAD` or lightweight `GET` request to the candidate URL.
5.  **Validation**:
    *   **200 OK**: The hub exists. We classify the page kind (e.g., `city-hub`) and record it.
    *   **404 Not Found**: The hub does not exist. We record this negative evidence to avoid re-checking active hubs needlessly.
    *   **301 Redirect**: We follow to see if it normalizes (e.g., `.../Medellin` -> `.../medellin`).

## UI Integration

The Place Hub Guessing Dashboard (`/admin/place-hubs`) exposes this mode:

*   **Parent Place Input**: Filters the scope of generation (e.g., "Venezuela").
*   **Active Pattern Input**: Defines the URL structure (e.g., `/venezuela/{slug}`).
*   **Run Guessing**: Triggers the background job.

## Benefits

*   **Rapid Cold Start**: discover hundreds of category pages in minutes without scraping article pages.
*   **Canonical URL Discovery**: quickly learn how a publisher slugs their cities (e.g., do they include state codes? `city-state` vs `city`?).
*   **Topology Mapping**: Understand the depth and breadth of a publisher's geographic coverage (e.g., do they cover small towns or just capitals?).

## Implementation Details

The logic resides in `src/tools/guess-place-hubs.js` and `src/orchestration/placeHubGuessing.js`. It leverages the `PlaceHubDependency` graph to inject the probing logic into the standard batch processing pipeline, ensuring rate limits and `robots.txt` respect are maintained.
