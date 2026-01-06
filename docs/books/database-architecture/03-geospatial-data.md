# Chapter 3: Geospatial Data & PostGIS

## Overview

The system supports a dual-mode geospatial architecture:
1.  **SQLite (Local/Fast):** Used for unit tests, local development, and caching frequently accessed place data (top 5,000 cities).
2.  **PostGIS (Production/Scale):** Used for the "source of truth," distributed crawling, and complex spatial queries (e.g., "Find all places within 50km of this coordinate").

## The `planet1` Database

The PostGIS database (default name: `planet1`) stores the complete OpenStreetMap (OSM) dataset for the target regions.

### Key Tables

```sql
-- Countries (Polygons)
SELECT name, iso_a2, geom_wgs84 FROM countries;

-- Administrative Areas (Polygons/Points)
-- admin_level: 2=Country, 4=State/Province, 6=County, 8=City
SELECT name, admin_level, way FROM admin_areas;
```

## PostGIS Gazetteer Adapter

The `PostgisGazetteer` class provides an interface for the analysis pipeline to query the database directly, bypassing the memory limits of the SQLite implementation.

### Usage

```javascript
const { PostgisGazetteer } = require('../analysis/PostgisGazetteer');
const gazetteer = new PostgisGazetteer({
  connectionString: process.env.POSTGIS_URL
});

// Async lookup
const places = await gazetteer.findPlaces('London');
```

### Spatial Coherence

One of the primary benefits of PostGIS is **Spatial Coherence Scoring**. When an article mentions "Paris" and "Texas", the system can use PostGIS to calculate the distance between the candidates.

```sql
-- Check if Candidate A contains Candidate B
ST_Contains(candidate_a.geom, candidate_b.geom)

-- Calculate distance
ST_Distance(candidate_a.geom::geography, candidate_b.geom::geography)
```

## Migration & Sync

The `tools/schema-sync-postgres.js` tool handles the migration of the core application schema (articles, fetches) to Postgres, while the geospatial data is managed separately via OSM import tools (e.g., `osm2pgsql`).
