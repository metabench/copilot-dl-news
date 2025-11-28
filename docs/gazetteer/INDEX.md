# Gazetteer Documentation Hub

> **Purpose**: Comprehensive documentation for the place name resolution system that powers geographic news discovery and URL-to-place matching.

## Quick Links

| Document | Description | Status |
|----------|-------------|--------|
| [Current State](./CURRENT_STATE.md) | Architecture, tables, data sources, known issues | ✅ Complete |
| [Data Sources](./DATA_SOURCES.md) | Detailed comparison of GeoNames, Wikidata, OSM/PostGIS | ✅ Complete |
| [Multi-Source Attribution](./MULTI_SOURCE_ATTRIBUTION.md) | How to handle conflicting data from multiple sources | ✅ Complete |
| [PostGIS Integration](./POSTGIS_INTEGRATION.md) | Leveraging local OSM PostgreSQL database | ✅ Complete |
| [Implementation Plan](./IMPLEMENTATION_PLAN.md) | Phased roadmap for improvements | ✅ Complete |
| [Troubleshooting](./TROUBLESHOOTING.md) | Common issues and diagnostic commands | ✅ Complete |

## System Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        GAZETTEER SYSTEM                                  │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────┐                │
│  │   Wikidata   │   │   GeoNames   │   │  OSM/PostGIS │                │
│  │   (SPARQL)   │   │   (Files)    │   │   (Local)    │                │
│  └──────┬───────┘   └──────┬───────┘   └──────┬───────┘                │
│         │                  │                  │                         │
│         └────────┬─────────┴─────────┬────────┘                         │
│                  │                   │                                  │
│                  ▼                   ▼                                  │
│         ┌────────────────────────────────────┐                         │
│         │    Multi-Source Attribution Layer   │                         │
│         │  (Tracks provenance per attribute)  │                         │
│         └────────────────┬───────────────────┘                         │
│                          │                                              │
│                          ▼                                              │
│         ┌────────────────────────────────────┐                         │
│         │           SQLite Gazetteer          │                         │
│         │  places | place_names | hierarchy   │                         │
│         └────────────────┬───────────────────┘                         │
│                          │                                              │
│                          ▼                                              │
│         ┌────────────────────────────────────┐                         │
│         │          PlaceLookup (Runtime)      │                         │
│         │   In-memory index for URL matching  │                         │
│         └────────────────────────────────────┘                         │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

## Core Concepts

### 1. Place Identity
A **place** is a geographic entity with a stable identity across sources. We use external IDs (Wikidata QID, GeoNames ID, OSM ID) as primary identifiers to deduplicate across sources.

### 2. Place Names
Each place can have many names:
- **Canonical name**: Primary display name (e.g., "New York City")
- **Official names**: Government-recognized names
- **Alternate names**: Variants, translations, historical names
- **URL slugs**: Computed at runtime for URL matching

### 3. Attribution
Every piece of data tracks its source:
- Which source provided it (wikidata, geonames, osm)
- When it was last updated
- Confidence/priority for conflict resolution

### 4. Hierarchy
Places exist in hierarchical relationships:
- Country → Region (ADM1) → City
- Enables contextual disambiguation ("Paris, Texas" vs "Paris, France")

## Key Metrics (Current State)

| Metric | Current | Target |
|--------|---------|--------|
| Total places | ~11,500 | ~30,000 |
| Countries | 250 | 250 |
| Cities | ~8,000 | ~25,000 |
| Regions (ADM1) | ~3,200 | ~4,000 |
| URL match rate | ~40% | ~95% |
| Major US cities | 195 (partial) | ~4,000 |
| Major UK cities | 1 (London only!) | ~300 |

## Known Issues

1. **UK cities missing**: Only London exists; Manchester, Birmingham, etc. absent
2. **Wikidata timeouts**: SPARQL queries fail for large countries
3. **No GeoNames integration**: Planned but not implemented
4. **No PostGIS/OSM integration**: Local data unused
5. **Canonical name gaps**: Many places have `canonical_name_id = NULL`

## Related Files

### Database
- `data/news.db` → `places`, `place_names`, `place_external_ids`, `place_hierarchy`
- `src/db/sqlite/v1/schema-definitions.js` → Schema definitions

### Ingestors
- `src/crawler/gazetteer/ingestors/WikidataCitiesIngestor.js`
- `src/crawler/gazetteer/ingestors/WikidataAdm1Ingestor.js`
- `src/crawler/gazetteer/ingestors/WikidataCountryIngestor.js`
- `src/tools/populate-gazetteer.js`

### Runtime
- `src/knowledge/PlaceLookup.js` → In-memory lookup service
- `src/knowledge/toUrlSlug.js` → URL slug computation

### Tools
- `tools/gazetteer/gazetteer-summary.js` → Database statistics
- `tools/gazetteer/list-cities.js` → Query cities by country

## Version History

| Date | Change |
|------|--------|
| 2025-11-28 | Added POSTGIS_INTEGRATION.md with full adapter code |
| 2025-11-28 | Added IMPLEMENTATION_PLAN.md with 4-phase roadmap |
| 2025-11-28 | Added TROUBLESHOOTING.md with diagnostic commands |
| 2025-11-28 | Created gazetteer documentation hub |
| 2025-11-28 | Removed url_slug column (computed at runtime) |
| 2025-11-27 | Implemented migrate-schema.js for canonical names |
