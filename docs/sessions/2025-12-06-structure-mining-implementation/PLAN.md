# Plan – Structure Mining Implementation

## Objective
Implement the **SkeletonHash** algorithm and **Structure Miner** tool to enable static analysis of page layouts, clustering pages by structural similarity to identify templates and content areas.

## User Requirements
1.  **Static Analysis**: Analyze HTML structure without headless rendering.
2.  **Space Efficiency**: Store compact signatures, not full trees.
3.  **Multi-Level**:
    *   **Level 1 (Template)**: Tags + Attributes (Specific templates).
    *   **Level 2 (Structure)**: Tags Only (Broad layout families).
4.  **Batch Processing**: Analyze batches (e.g., 1000 pages) to find patterns.
5.  **Substructure Identification**: Identify common (boilerplate) vs. varying (content) structures.

## Strategy
We will build this as a standalone module `src/analysis/structure/` first, then integrate it into the crawler.

### Phase 1: The SkeletonHash Algorithm
*   **Module**: `src/analysis/structure/SkeletonHash.js`
*   **Logic**:
    *   Input: Cheerio object or HTML string.
    *   **Pruning**: Remove text, comments, scripts, styles, meta, link.
    *   **Normalization**: Sort classes, strip non-semantic attributes.
    *   **Serialization**: DFS traversal to string (e.g., `div#main(article(h1))`).
    *   **Hashing**: MurmurHash3 (64-bit) or similar fast non-crypto hash.
*   **Deliverable**: Unit tests proving stability (same HTML = same hash) and distinctness.

### Phase 2: Database Schema
*   **Table**: `layout_signatures`
    *   `signature_hash` (PK, Int64)
    *   `level` (1 or 2)
    *   `first_seen_url` (Text, for debugging)
    *   `seen_count` (Int)
*   **Action**: Create migration and update schema definitions.

### Phase 3: The Structure Miner Tool
*   **Tool**: `tools/structure-miner.js`
*   **Input**: A list of URLs (or fetch from DB `articles` table).
*   **Process**:
    1.  Load HTML.
    2.  Compute L1 and L2 hashes.
    3.  Group by L2 Hash.
*   **Output**: JSON report showing clusters (e.g., "Cluster A: 850 pages, Signature: `...`").

### Phase 4: Substructure Diffing (Prototype)
*   **Goal**: Identify "Content" vs "Boilerplate".
*   **Logic**:
    *   Take 2 pages from the same L2 Cluster.
    *   Compare their serialized trees.
    *   Highlight nodes that differ (these are likely content).
    *   Highlight nodes that are identical (these are likely nav/footer).

## Change Set
- `src/analysis/structure/SkeletonHash.js` (New)
- `src/analysis/structure/__tests__/SkeletonHash.test.js` (New)
- `src/db/sqlite/migrations/YYYY-MM-DD-layout-signatures.sql` (New)
- `tools/structure-miner.js` (New)

## Risks & Mitigations
- **Hash Collisions**: 64-bit is large, but collisions are possible.
    *   *Mitigation*: Accept low risk for now; collisions just mean two layouts get grouped together.
- **Performance**: Parsing 1000s of pages might be slow.
    *   *Mitigation*: Use `cheerio`'s lightweight parsing; ensure pruning is aggressive.

## Tests / Validation
- **Unit**: `SkeletonHash` produces identical hashes for `<div><p>A</p></div>` and `<div><p>B</p></div>` (Level 2).
- **Integration**: Run `tools/structure-miner.js` on a sample of 100 existing DB articles and see if they cluster meaningfully.
