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

The Place Hub Guessing Dashboard (`/admin/place-hubs`) exposes this mode through a sophisticated matrix interface:

### Matrix View

The main view displays a **places × hosts** matrix where:
- **Rows**: Geographic places (countries, regions, cities) from the Gazetteer
- **Columns**: News publisher hosts (e.g., `bbc.com`, `theguardian.com`)
- **Cells**: Show verification status with distinct visual states

### Cell States (6-state model)

| State | Glyph | Color | Meaning |
|-------|-------|-------|---------|
| Unchecked | (empty) | Gray | No data yet |
| Guessed | `?` | Amber | Candidate URL predicted, not verified |
| Pending | `•` | Gray | Verification in progress |
| Verified Present | `✓` | Green | Hub confirmed to exist |
| **Deep Hub** | `✓` + depth | Green + underline | Hub with 10+ pages of historical content |
| Verified Absent | `×` | Red | Hub confirmed NOT to exist |

### Deep Hub Indicators

When a verified hub has been depth-probed and found to have significant archive depth (10+ pages), it displays:
- **Visual**: Green underline on the cell
- **Glyph**: Checkmark plus page count (e.g., `✓1.9k` for 1924 pages)
- **Tooltip**: Includes `depth=X pages`, `oldest=YYYY-MM-DD`, and `depth_checked=Xd ago`

This helps identify high-value hubs that should be prioritized for historical archiving.

### Cell Detail Page

Clicking a cell opens a detail page with:

1. **Status Card**: Current verification state with evidence JSON
2. **Place Name Variants**: Multi-language names from gazetteer (English, local, official)
3. **Possible URL Patterns**: Generated candidate URLs with individual "Check" buttons
4. **Bulk Check Controls**: "Check All Patterns" button with progress indicator
5. **Hub Check**: Manual URL input for custom verification
6. **Discovered Host Patterns**: Patterns found in existing crawled URLs
7. **Analysis Freshness**: How recently articles from this host were analyzed

### Interactive Hub Probing

The cell detail page includes real-time URL verification:

```javascript
// Pattern check with visual feedback
async function checkSinglePattern(idx, url) {
  // Shows spinner, makes HEAD/GET request via /api/probe-hub
  // Updates status indicator (✓/✗) and enables "Use ↑" button on success
}

// Bulk check with stop capability
async function checkAllPatterns() {
  // Iterates through all patterns with 300ms delay
  // Shows progress: "Checking 3 of 12... (Found: 2, Not found: 1)"
  // Supports abort via stopBulkCheck()
}
```

### API Endpoint

```javascript
POST /api/probe-hub
Body: { url: "https://example.com/world/germany" }
Response: {
  url: "...",
  status: 200,
  statusText: "OK",
  exists: true,
  contentType: "text/html",
  redirected: false,
  finalUrl: "..."
}
```

## Diagram

See [06-place-hub-matrix-flow.svg](../diagrams/06-place-hub-matrix-flow.svg) for a visual overview of the UI flow.

## Benefits

*   **Rapid Cold Start**: discover hundreds of category pages in minutes without scraping article pages.
*   **Canonical URL Discovery**: quickly learn how a publisher slugs their cities (e.g., do they include state codes? `city-state` vs `city`?).
*   **Topology Mapping**: Understand the depth and breadth of a publisher's geographic coverage (e.g., do they cover small towns or just capitals?).
*   **Evidence-Based Verification**: Each probe result is recorded, preventing redundant checks.
*   **Multi-Language Support**: Name variants from gazetteer enable pattern generation for non-English publishers.

## Implementation Details

The logic resides in:
- `src/tools/guess-place-hubs.js` — Core prediction logic
- `src/orchestration/placeHubGuessing.js` — Background job orchestration
- `src/ui/server/placeHubGuessing/server.js` — Express routes and API
- `src/ui/server/placeHubGuessing/controls/PlaceHubGuessingMatrixControl.js` — Matrix UI
- `src/ui/server/placeHubGuessing/controls/PlaceHubGuessingCellControl.js` — Cell detail UI
- `src/db/sqlite/v1/queries/placeHubGuessingUiQueries.js` — Query layer

It leverages the `PlaceHubDependency` graph to inject the probing logic into the standard batch processing pipeline, ensuring rate limits and `robots.txt` respect are maintained.

## Crawler Integration

Once hubs are verified and depth-probed, they feed into the **Hub Archive Crawl** system for systematic historical content retrieval. See [Chapter 8: Crawler Integration](../../2026-01-07-place-hub-deepening/book/08-crawler-integration.md) in the Place Hub Deepening book for:

- **HubTaskGenerator Service**: Bridges place hub discovery with the crawler
- **Hub Archive Operations**: Crawl operations for historical page retrieval
- **IntelligentCrawlServer API**: HTTP endpoints for programmatic archive control
- **Task Generation Pipeline**: How depth-probed hubs become crawl tasks

## Hub Index Discovery ("Hub of Hubs")

In addition to guessing individual slugs, we can discover large sets of hubs by finding and parsing "Index" pages—special "Hub of Hubs" pages that list available sections.

Examples:
- The Guardian: `https://www.theguardian.com/world/all` (A-Z list of countries)
- BBC: `https://www.bbc.com/news/world` (Links to Africa, Asia, etc.)

### Strategy

1.  **Seed**: Start with a known high-level index (e.g., `/world`, `/topics`).
2.  **Scan**: Parse all links on the page.
3.  **Pattern Match**: Look for **Depth 2** links—URLs that look like direct children of the section (e.g., `/world/france`, `/world/japan`).
4.  **Filter**: Exclude deep paths (articles with dates) and unrelated sections.
5.  **Candidates**: Treat successful matches as high-probability Hub Candidates.

### Tooling

The CLI tool `tools/dev/hub-discover-indices.js` automates this process:

```bash
node tools/dev/hub-discover-indices.js https://www.theguardian.com/world/all
```

This output can potentially feed into the Verification API to bulk-confirm thousands of hubs in a single pass, bypassing the need to guess permutations for every single city one by one.

