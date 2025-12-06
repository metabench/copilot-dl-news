# Design: Hybrid Crawler Architecture (Teacher/Worker Model)

> **Goal**: Combine the speed of static fetching with the intelligence of headless browsing to achieve high-quality extraction on long-tail news sites without sacrificing throughput.

## 1. The Problem
- **Static Fetching (`fetch` + `cheerio`)**: Fast (100s/sec), cheap, but blind to layout, rendered styles, and JS-injected content. Struggles with "Is this the main article or the sidebar?"
- **Headless Browsing (Puppeteer)**: Smart (sees what user sees), accurate, but slow (1s/sec) and resource-heavy.
- **Requirement**: "Accurately judge layouts without headless browsing on every download."

## 2. The Solution: Teacher/Worker Model

We introduce a **Layout Learning Loop**.

### A. The Components

1.  **The Worker (Fast Path)**
    *   **Stack**: Node.js `fetch`, `cheerio`, `Readability`.
    *   **Role**: Bulk crawling. Downloads HTML, applies *Templates*, extracts content.
    *   **Behavior**:
        *   Calculates a **Structural Fingerprint** of the page (e.g., DOM tree shape, class distribution).
        *   Checks if a matching **Layout Template** exists for this fingerprint/domain.
        *   If YES: Uses the template to extract content with high confidence.
        *   If NO (or low confidence): Flags for "Analysis" (or falls back to generic Readability).

2.  **The Teacher (Smart Path)**
    *   **Stack**: Puppeteer / Playwright.
    *   **Role**: Analysis & Template Generation.
    *   **Trigger**: New domain encountered, low extraction confidence, or explicit "Learn" command.
    *   **Behavior**:
        *   Renders the page fully.
        *   Uses visual heuristics (bounding boxes, font sizes, centrality) to identify the *true* article container, title, date, and author.
        *   Generates a **Layout Template** (CSS selectors + logic) that maps the visual truth to the static HTML structure.
        *   Saves the template to the database.

### B. The Workflow

1.  **Discovery**: Worker finds `example.com/story/1`.
2.  **Check**: Do we have a template for `example.com`? No.
3.  **Fallback**: Worker uses generic Readability. Result is "Okay" but maybe includes the "Read Next" links.
4.  **Learning (Async)**: The URL is queued for the **Teacher**.
5.  **Analysis**: Teacher renders `example.com/story/1`.
    *   It sees the "Read Next" links are visually separate (sidebar).
    *   It sees the main text is in `div.content-body`.
6.  **Template Gen**: Teacher creates a rule: `Domain: example.com, Selector: div.content-body, Exclude: .sidebar`.
7.  **Application**: Next time Worker hits `example.com/story/2`:
    *   It applies the rule.
    *   Extraction is perfect.
    *   No headless browser used for `/story/2`.

## 3. Structural Fingerprinting (Static Analysis)

To avoid headless rendering on every page, we need a **fast, space-efficient signature** that uniquely identifies a page's layout. We use a **Multi-Level Signature** approach to capture both specific templates and broad layout families.

### A. The "Skeleton Hash" Algorithms

We define two levels of abstraction:

1.  **Level 1: Template Signature (Tags + Attributes)**
    *   **Purpose**: Identifies specific page templates (e.g., "The Guardian Article", "BBC Live Blog").
    *   **Method**:
        *   Prune text, scripts, styles.
        *   Keep semantic tags.
        *   Keep `id` and `class` attributes (sorted/normalized).
        *   Hash: `MurmurHash(Serialize(Tag + Attrs))`
    *   **Use Case**: Exact matching for extraction rules.

2.  **Level 2: Structural Signature (Tags Only)**
    *   **Purpose**: Identifies broad layout families (e.g., "3-Column Layout", "Feed Layout").
    *   **Method**:
        *   Prune text, scripts, styles.
        *   **Prune ALL attributes** (no IDs, no classes).
        *   Keep only the tag hierarchy (`div > article > h1`).
        *   Hash: `MurmurHash(Serialize(Tags))`
    *   **Use Case**: Clustering disparate pages to find common architectural patterns (e.g., "These 500 pages look different but share the same skeleton").

### B. Batch Analysis & Clustering (The "Structure Miner")

Instead of analyzing pages one-by-one, we process them in **Batches (e.g., 1000 pages)** to discover patterns.

1.  **Collection**: Crawler fetches 1000 pages.
2.  **Fingerprinting**: Compute L1 and L2 signatures for all pages.
3.  **Clustering**: Group pages by L2 Signature.
    *   *Cluster A (800 pages)*: The "Standard Article" layout.
    *   *Cluster B (150 pages)*: The "Section Front" layout.
    *   *Cluster C (50 pages)*: The "404/Error" layout.
4.  **Common Substructure Identification**:
    *   Compare the DOM trees within a cluster.
    *   Identify sub-trees that are identical across *all* pages (e.g., Header, Footer, Sidebar).
    *   Identify sub-trees that *vary* (e.g., The Main Content Area).
5.  **Inference**: The varying sub-tree is likely the **Content**. The common sub-trees are **Boilerplate**.

### C. Space-Efficient Storage
We store the signatures and their counts to track the "evolution" of a site's structure.

```sql
-- Stores the mapping between a Layout Signature and a Template
CREATE TABLE layout_signatures (
    signature_hash INTEGER PRIMARY KEY, -- 64-bit integer (signed in SQLite)
    level INTEGER,                      -- 1 (Template) or 2 (Structure)
    template_id INTEGER,                -- FK to layout_templates (if mapped)
    seen_count INTEGER DEFAULT 1,       -- How many times have we seen this layout?
    last_seen_at TEXT,
    FOREIGN KEY(template_id) REFERENCES layout_templates(id)
);
```

### D. The Lookup Flow
1.  **Worker** fetches HTML.
2.  **Worker** computes `SkeletonHash(html)`.
3.  **Worker** queries DB: `SELECT template_id FROM layout_signatures WHERE signature_hash = ?`.
4.  **If Found**: Load selectors from `layout_templates` and extract.
5.  **If Not Found**:
    *   Insert/Update `layout_signatures` (increment `seen_count`).
    *   If `seen_count > Threshold` (e.g., 5), flag for **Teacher Analysis**.
    *   (This prevents the Teacher from wasting time on unique 404s or one-off pages).

## 4. Reliability & Tenacity

To ensure the crawler "gets on with it":

*   **Archive Discovery**: If the queue is empty, the Planner (Intelligent Crawl) explicitly looks for "Archive" or "Sitemap" links in the footer/nav.
*   **Pagination Prediction**: If we see `?page=1`, we speculatively enqueue `?page=2` to check for existence.
*   **Stall Detection**: If throughput drops to 0 for N minutes, a "Resilience Monitor" fires:
    *   Checks internet connection.
    *   Checks if the target site is blocking (403/429).
    *   Rotates User-Agent or Proxy (if configured).
    *   Restarts the worker process if it's hung.

## 5. Data Structures (Draft)

```sql
CREATE TABLE layout_templates (
    id INTEGER PRIMARY KEY,
    domain_id INTEGER,
    url_pattern TEXT,       -- Regex for URL matching
    fingerprint_hash TEXT,  -- Structural hash
    selectors JSON,         -- { title: "h1.headline", content: "div.story", ... }
    confidence REAL,        -- 0.0 - 1.0
    created_at TEXT
);
```

## 6. Roadmap

*   **Phase 1: Headless Integration**: Add Puppeteer as a dev-dependency/optional tool. Create a script `tools/analyze-layout.js` that takes a URL and outputs a screenshot + visual bounding boxes.
*   **Phase 2: Fingerprinting**: Implement the `StructuralFingerprint` logic in the fast crawler.
*   **Phase 3: The Loop**: Connect the two. Worker flags -> Teacher learns -> Worker applies.
