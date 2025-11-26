# Gazetteer Tools

This document describes the CLI tools available for interacting with the gazetteer database. These tools are designed for both human developers and AI agents to explore, query, and validate geography data.

## `gazetteer-scan.js`

The primary tool for querying the gazetteer. It supports searching by name, looking up details by ID, and filtering by country or kind.

### Usage

```bash
node src/tools/gazetteer-scan.js [options]
```

### Options

| Option | Description | Default |
|Str |---|---|
| `--search <term>` | Search for places by name (fuzzy match) | |
| `--lookup <id>` | Get full details for a specific place ID | |
| `--country <code>` | Filter by country code (ISO alpha-2) | |
| `--kind <kind>` | Filter by place kind (`country`, `region`, `city`) | |
| `--limit <n>` | Limit the number of results | 50 |
| `--stats` | Show database statistics (counts by kind) | |
| `--json` | Output structured JSON (for agents) | false |
| `--verbose` | Enable verbose logging | false |
| `--db <path>` | Path to SQLite database | `data/news.db` |

### Examples

#### 1. Search for a place
Find all places matching "Paris".
```bash
node src/tools/gazetteer-scan.js --search "Paris"
```

#### 2. Get place details
Get hierarchy, names, and attributes for a specific ID.
```bash
node src/tools/gazetteer-scan.js --lookup 12345
```

#### 3. List cities in a country
List top cities in France (FR).
```bash
node src/tools/gazetteer-scan.js --country FR --kind city --limit 20
```

#### 4. Agent Integration (JSON)
Get machine-readable output for analysis.
```bash
node src/tools/gazetteer-scan.js --search "London" --json
```

### Output Format (JSON)

**Search Results:**
```json
{
  "type": "search_results",
  "count": 10,
  "results": [
    {
      "id": 123,
      "kind": "city",
      "country_code": "GB",
      "canonical_name": "London",
      "population": 8900000
      ...
    }
  ]
}
```

**Place Details:**
```json
{
  "type": "place_details",
  "place": {
    "id": 123,
    "name": "London",
    "names": [...],
    "parents": [...],
    "children": [...],
    "attributes": [...]
  }
}
```

## `populate-gazetteer.js`

The tool used to seed and update the gazetteer from external sources (REST Countries, Wikidata).

### Usage

```bash
node src/tools/populate-gazetteer.js [options]
```

### Key Options

*   `--countries <csv>`: Limit import to specific countries (e.g., `US,GB,FR`).
*   `--import-cities`: Enable city import from Wikidata.
*   `--json-events`: Output progress as NDJSON events.

## `gazetteer-cleanup.js`

The primary tool for maintaining data quality in the gazetteer. It identifies and merges duplicate place records, backfills missing Wikidata QIDs, and removes low-quality orphan records.

### Usage

```bash
node src/tools/gazetteer-cleanup.js [options]
```

### Options

| Option | Description |
|--------|-------------|
| `--analyze` | Show duplicate analysis without making changes |
| `--merge` | Merge duplicate place records |
| `--dry-run` | Preview changes without applying them |
| `--backfill-qids` | Backfill `wikidata_qid` column from `place_external_ids` |
| `--remove-orphans` | Remove low-quality orphan records |
| `--all` | Run all cleanup operations |
| `--country=XX` | Filter by country code (e.g., `--country=GB`) |
| `--verbose, -v` | Show detailed output |
| `--json` | Output results as JSON |
| `--db <path>` | Path to SQLite database (default: `data/gazetteer.db`) |

### Examples

#### 1. Analyze duplicates
Show duplicate analysis for all countries.
```bash
node src/tools/gazetteer-cleanup.js --analyze
```

#### 2. Preview merge for a specific country
```bash
node src/tools/gazetteer-cleanup.js --merge --dry-run --country=GB
```

#### 3. Run full cleanup
```bash
node src/tools/gazetteer-cleanup.js --all
```

#### 4. Backfill Wikidata QIDs only
```bash
node src/tools/gazetteer-cleanup.js --backfill-qids
```

### Deduplication Algorithm

The cleanup tool uses a **quality-based scoring system** to determine which record to keep:

| Factor | Score |
|--------|-------|
| Has Wikidata QID | +1000 |
| Has population | +500 |
| Has coordinates | +200 |
| Each name variant | +10 |
| Each external ID | +50 |
| Source is `restcountries@v3.1` | -100 |

The highest-scoring record is kept, and all names, hierarchy relationships, attributes, and external IDs from duplicate records are merged into it.

### Safety Guards

- **Proximity threshold**: Only merges records within 0.1° (~11km) of each other
- **Dry-run mode**: Always preview with `--dry-run` before applying changes
- **Atomic transactions**: All merges are transactional (all-or-nothing)

---

## `gazetteer-dedupe.js` (Legacy)

> **Note**: This is the older deduplication tool. For most use cases, prefer `gazetteer-cleanup.js` above.

Advanced deduplication tool with spatial and hierarchy safety guards.

### Usage

```bash
# Scan for duplicates (list only)
node tools/gazetteer-dedupe.js --scan --limit 50

# Dry Run (Analyze and show plan)
node tools/gazetteer-dedupe.js --resolve --limit 50

# Execute merges
node tools/gazetteer-dedupe.js --execute --limit 50
```

See `docs/GAZETTEER_DEDUPLICATION_SUMMARY.md` for algorithm details.

---

## `validate-gazetteer.js`

Runs integrity checks on the database (orphaned records, missing names, circular hierarchy).

### Usage

```bash
node src/tools/validate-gazetteer.js
```

---

## Related Documentation

| Document | Description |
|----------|-------------|
| [`GAZETTEER_POPULATION_ARCHITECTURE.md`](../GAZETTEER_POPULATION_ARCHITECTURE.md) | Data flow and ingestion architecture |
| [`GAZETTEER_DEDUPLICATION_SUMMARY.md`](../GAZETTEER_DEDUPLICATION_SUMMARY.md) | Deduplication algorithm v2 details |
| [`GAZETTEER_DB_CACHE_PLAN.md`](../GAZETTEER_DB_CACHE_PLAN.md) | Database-backed caching strategy |
| [`DATABASE_SCHEMA_ERD.md`](../DATABASE_SCHEMA_ERD.md) | Database schema (places, place_names, etc.) |

## Architecture Diagrams

- [`GAZETTEER_ARCHITECTURE.svg`](../GAZETTEER_ARCHITECTURE.svg) - Overall system architecture
- [`GAZETTEER_DB_CACHE_ARCHITECTURE.svg`](../GAZETTEER_DB_CACHE_ARCHITECTURE.svg) - DB caching layer
- [`GAZETTEER_DEDUPLICATION_ALGORITHM.svg`](../GAZETTEER_DEDUPLICATION_ALGORITHM.svg) - Deduplication protocol v2
- [`GAZETTEER_DEDUPLICATION_PLAN.svg`](../GAZETTEER_DEDUPLICATION_PLAN.svg) - Merge strategy visualization
