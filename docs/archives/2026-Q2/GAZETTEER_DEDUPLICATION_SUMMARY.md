# Gazetteer Deduplication Tool & Algorithm

## Overview
We have implemented a robust deduplication system for the `gazetteer.db` to resolve duplicate place entries (e.g., multiple "Springfield" records, duplicate "Vaduz" entries). The system uses a safe, tiered approach to identify, verify, and merge duplicate records while preventing false positives (merging distinct entities).

## Available Tools

| Tool | Location | Purpose |
|------|----------|---------|
| `gazetteer-cleanup.js` | `src/tools/gazetteer-cleanup.js` | **Primary tool** - Quality-based scoring, backfill QIDs, remove orphans |
| `gazetteer-dedupe.js` | `tools/gazetteer-dedupe.js` | Legacy tool - Spatial/hierarchy guards, tiered scoring |

### Quick Start (Recommended)

```bash
# Analyze duplicates
node src/tools/gazetteer-cleanup.js --analyze

# Preview cleanup (dry-run)
node src/tools/gazetteer-cleanup.js --merge --dry-run

# Run full cleanup (backfill QIDs + merge + remove orphans)
node src/tools/gazetteer-cleanup.js --all
```

## Algorithm (v2)
The algorithm is visualized in `docs/GAZETTEER_DEDUPLICATION_ALGORITHM.svg`.

### 1. Grouping
Candidates are grouped by `Country Code` and `Normalized Name`.
- **Note**: We intentionally ignore `Place Kind` (e.g., PPL vs ADM1) to allow merging a City with its corresponding Administrative Region if they are duplicates.

### 2. Safety Guards
Before merging, we apply two strict checks:

#### A. Spatial Guard (Distance Check)
- **Rule**: If any two candidates have coordinates and are > **50km** apart, the merge is **ABORTED**.
- **Safety**: This prevents merging distinct cities with the same name (e.g., Springfield, IL vs Springfield, MA) even if parent data is missing.

#### B. Hierarchy Guard (Subset Constraint)
- **Rule**: For any two candidates with parent data, one's ancestry must be a **subset** of the other's.
- **Conflict**: If candidates have divergent ancestries (e.g., `{US, IL}` vs `{US, MA}`), the merge is **ABORTED**.

### 3. Tiered Scoring
Candidates are scored to select the "Survivor" (the record to keep).
1.  **External IDs** (50 pts): Records with more external links (Wikidata, OSM) are preferred.
2.  **Hierarchy** (10 pts): Records with more parents/children are preferred (better connected).
3.  **Attributes** (5 pts): Records with more metadata are preferred.
4.  **Source** (2 pts): Wikidata > RestCountries > Others.
5.  **Tiebreaker**: Lower ID wins (older record).

### 4. Atomic Merge
The merge operation is transactional:
1.  Migrate **External IDs** to Survivor.
2.  Migrate **Names** (aliases) to Survivor.
3.  Migrate **Hierarchy** (children/parents) to Survivor.
4.  Migrate **Attributes** to Survivor.
5.  **Delete** Victim records.

## CLI Tool

### Primary Tool: `gazetteer-cleanup.js`

The recommended tool is located at `src/tools/gazetteer-cleanup.js`.

```bash
# Analyze duplicates
node src/tools/gazetteer-cleanup.js --analyze

# Preview cleanup (dry-run)
node src/tools/gazetteer-cleanup.js --merge --dry-run

# Run full cleanup
node src/tools/gazetteer-cleanup.js --all

# Filter by country
node src/tools/gazetteer-cleanup.js --all --country=GB
```

### Legacy Tool: `gazetteer-dedupe.js`

The older tool is located at `tools/gazetteer-dedupe.js`.

```bash
# Scan for duplicates (list only)
node tools/gazetteer-dedupe.js --scan --limit 50

# Dry Run (Analyze and show plan, but DO NOT modify DB)
node tools/gazetteer-dedupe.js --resolve --limit 50

# Execute (Apply merges to DB)
node tools/gazetteer-dedupe.js --execute --limit 50
```

### Recent Improvements
- **Empty Name Filter**: Excludes records with empty normalized names from clustering.
- **ID Deduplication**: Ensures the same ID isn't processed multiple times in a cluster.
- **Strict Conflict Detection**: Implemented the "Subset Constraint" to handle partial hierarchy data safely.

## Validation
- **SVG Documentation**: Validated with `tools/dev/svg-validate.js`.
- **Dry Runs**: Verified on `gazetteer.db` with real data. The tool correctly skips ambiguous clusters (e.g., `ramat-gan`, `alcazar`) while resolving safe ones.
- **Execution (2025-11-24)**: Successfully merged **1,872** duplicate clusters. **809** clusters were skipped due to safety guards (spatial/hierarchy conflicts).
