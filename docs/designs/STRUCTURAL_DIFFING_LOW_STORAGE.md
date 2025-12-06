# Design: Low-Storage Structural Diffing (Level 3)

## 1. Problem Statement
We have implemented **Level 1** (Template) and **Level 2** (Structure) hashing, which allows us to group pages by their DOM layout. However, knowing that two pages share a layout doesn't tell us *which parts* of the page are content (dynamic) and which are boilerplate (static).

Traditional diffing (storing the difference between Page A and Page B) is storage-intensive ($O(N)$ per page). We need a method to identify dynamic regions that scales to millions of pages with minimal storage overhead.

## 2. Core Concept: Template Masking
Instead of diffing every pair of pages, we derive a **Mask** for each unique Layout Signature.

1.  **Sampling**: For a given Layout Signature $S$, we collect a small sample of pages (e.g., $K=5$).
2.  **Parallel Traversal**: We traverse the DOM trees of all $K$ samples simultaneously.
3.  **Stability Check**: For each node position:
    - If the text/attributes are identical across all samples, the node is **Static** (Boilerplate).
    - If they differ, the node is **Dynamic** (Content).
4.  **Mask Generation**: We generate a list of paths (e.g., child-index chains) that point to the Dynamic nodes.

## 3. Storage Strategy
We store **one mask per template**, not per page.

-   **Table**: `layout_masks`
-   **Columns**:
    -   `signature_hash` (FK to `layout_signatures`)
    -   `mask_json` (Compressed list of dynamic paths)
    -   `sample_count` (How many pages were used to build this mask)

**Storage Impact**:
-   If a site has 1,000,000 pages but only 50 unique layouts, we store **50 masks**.
-   Storage cost is negligible (bytes per template).

## 4. Algorithm: Parallel Tree Traversal

```javascript
function generateMask(samples) {
    const mask = [];
    const depth = 0;
    
    // Recursive function walking all trees in lock-step
    function walk(nodes, path) {
        // 1. Check Node Consistency
        const reference = nodes[0];
        const isDynamic = nodes.some(n => !isEqual(n, reference));
        
        if (isDynamic) {
            mask.push(path);
            // If the node itself is dynamic (e.g. different text), we might stop here 
            // or continue if we want granular attribute diffs.
        }
        
        // 2. Recurse to children
        // Since they share a Layout Signature, they MUST have the same child structure (tags).
        const childCount = reference.children.length;
        for (let i = 0; i < childCount; i++) {
            const childNodes = nodes.map(n => n.children[i]);
            walk(childNodes, [...path, i]);
        }
    }
    
    walk(samples.map(s => s.root), []);
    return mask;
}
```

## 5. Data Structures

### Path Notation
To save space, we can use a compact binary or string representation for paths instead of verbose XPaths.
-   **Array**: `[0, 1, 4]` (Child 0 -> Child 1 -> Child 4)
-   **String**: `"0.1.4"`

### Database Schema
```sql
CREATE TABLE layout_masks (
    signature_hash TEXT PRIMARY KEY REFERENCES layout_signatures(signature_hash),
    dynamic_paths TEXT, -- JSON: ["0.1.2", "0.4.1"]
    static_paths TEXT,  -- JSON: Optional, inverse of dynamic
    sample_size INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

## 6. Use Cases

### A. Boilerplate Removal (Content Extraction)
When crawling a new page with signature $S$:
1.  Load Mask $M_S$.
2.  Ignore all nodes *not* in `dynamic_paths`.
3.  Extract text only from `dynamic_paths`.
4.  Result: Clean content without nav, footer, or ads.

### B. Change Detection
If we re-crawl a URL:
1.  Compare the new content *only* at the `dynamic_paths`.
2.  If the dynamic content is identical, the page hasn't changed (even if a timestamp in the footer changed, provided the footer was correctly identified as dynamic... wait).

*Refinement*: We might need two types of Dynamic nodes:
1.  **Content** (Headline, Body) - Changes per page, valuable.
2.  **Noise** (Ads, "Time since X") - Changes per page/request, ignore.

To distinguish these, we might need cross-time analysis (same URL, different time) vs cross-page analysis (different URL, same template).
-   **Cross-Page Diff**: Identifies "Slots" (Content + Noise).
-   **Cross-Time Diff**: Identifies "Jitter" (Noise).

## 7. Implementation Plan

### Phase 1: The `SkeletonDiff` Class
-   Implement the parallel traversal logic in `src/analysis/structure/SkeletonDiff.js`.
-   Input: Array of Cheerio roots.
-   Output: Array of dynamic paths.

### Phase 2: Database & Tooling
-   Create `layout_masks` table.
-   Update `tools/structure-miner.js` to support a `--mask` mode:
    -   Select top 10 signatures.
    -   For each, fetch 5 random content blobs.
    -   Compute mask.
    -   Save to DB.

### Phase 3: Visualization
-   Create a script `tools/visualize-mask.js` that takes a URL, fetches its mask, and outputs an HTML file where:
    -   Static regions are grayed out.
    -   Dynamic regions are highlighted (Red).

### Phase 4: Integration
-   Expose `isContent(node)` API in the crawler based on the mask.
