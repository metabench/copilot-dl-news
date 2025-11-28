# PostGIS/OSM Integration

> **Purpose**: Leverage the local OpenStreetMap PostgreSQL database for boundary polygons, additional places, and spatial queries.

## Overview

You have a local OSM database in PostgreSQL with PostGIS extensions. This is a **goldmine** for:
- Admin boundary polygons (countries, states, cities)
- Additional places not in GeoNames
- Spatial queries ("find all cities within 50km")
- Ground-truth verification of coordinates

## Prerequisites

### Verify PostGIS Installation

```sql
-- Check PostGIS version
SELECT PostGIS_Version();

-- Check available extensions
SELECT * FROM pg_extension WHERE extname LIKE 'postgis%';
```

### Connection Configuration

```javascript
// config/postgis.json
{
  "host": "localhost",
  "port": 5432,
  "database": "osm",
  "user": "osm",
  "password": "osm",
  "ssl": false
}
```

### Environment Variables

```bash
POSTGIS_HOST=localhost
POSTGIS_PORT=5432
POSTGIS_DATABASE=osm
POSTGIS_USER=osm
POSTGIS_PASSWORD=osm
```

## OSM Database Schema

Standard osm2pgsql imports create these tables:

### `planet_osm_point`
Point features (cities, villages, POIs)

```sql
\d planet_osm_point

     Column      |           Type           | 
-----------------+--------------------------+
 osm_id          | bigint                   |  -- OSM node ID
 access          | text                     |
 admin_level     | text                     |
 amenity         | text                     |
 boundary        | text                     |
 capital         | text                     |  -- 'yes' for capitals
 name            | text                     |
 name:en         | text                     |  -- English name
 name:de         | text                     |  -- German name, etc.
 place           | text                     |  -- city, town, village, etc.
 population      | text                     |  -- Often present
 wikidata        | text                     |  -- Q123456
 wikipedia       | text                     |  -- en:Article_name
 way             | geometry(Point,3857)     |  -- EPSG:3857 (Web Mercator)
```

### `planet_osm_polygon`
Polygon features (boundaries, buildings, areas)

```sql
\d planet_osm_polygon

     Column      |           Type           |
-----------------+--------------------------+
 osm_id          | bigint                   |  -- OSM way/relation ID
 admin_level     | text                     |  -- 2=country, 4=state, 6=county, 8=city
 boundary        | text                     |  -- 'administrative'
 name            | text                     |
 name:en         | text                     |
 place           | text                     |
 population      | text                     |
 wikidata        | text                     |
 way             | geometry(Geometry,3857)  |  -- Polygon or MultiPolygon
```

### Admin Levels

| Level | Typical Use |
|-------|-------------|
| 2 | Country |
| 3 | Large region (rare) |
| 4 | State/Province/Region |
| 5 | Region subdivision (rare) |
| 6 | County/District |
| 7 | Municipality (some countries) |
| 8 | City/Town |
| 9 | City subdivision |
| 10 | Neighborhood |

## Query Recipes

### Find All Countries

```sql
SELECT 
    osm_id,
    name,
    "name:en" as name_en,
    wikidata,
    ST_Area(way::geography) / 1000000 as area_km2,
    ST_AsGeoJSON(ST_Transform(way, 4326)) as geojson
FROM planet_osm_polygon
WHERE boundary = 'administrative'
  AND admin_level = '2'
  AND name IS NOT NULL
ORDER BY area_km2 DESC;
```

### Find Cities/Towns with Boundaries

```sql
SELECT 
    osm_id,
    name,
    "name:en" as name_en,
    place,
    population::integer as pop,
    wikidata,
    ST_X(ST_Transform(ST_Centroid(way), 4326)) as lng,
    ST_Y(ST_Transform(ST_Centroid(way), 4326)) as lat,
    ST_AsGeoJSON(ST_Transform(ST_Simplify(way, 100), 4326)) as boundary_geojson
FROM planet_osm_polygon
WHERE place IN ('city', 'town')
  AND name IS NOT NULL
ORDER BY pop DESC NULLS LAST
LIMIT 1000;
```

### Find Cities from Points (No Boundary)

```sql
SELECT 
    osm_id,
    name,
    "name:en" as name_en,
    place,
    population::integer as pop,
    wikidata,
    ST_X(ST_Transform(way, 4326)) as lng,
    ST_Y(ST_Transform(way, 4326)) as lat
FROM planet_osm_point
WHERE place IN ('city', 'town', 'village')
  AND name IS NOT NULL
ORDER BY pop DESC NULLS LAST
LIMIT 5000;
```

### Find UK Cities Specifically

```sql
-- First get UK boundary
WITH uk_boundary AS (
    SELECT way 
    FROM planet_osm_polygon 
    WHERE boundary = 'administrative' 
      AND admin_level = '2'
      AND (name = 'United Kingdom' OR "ISO3166-1" = 'GB')
)
SELECT 
    p.osm_id,
    p.name,
    p."name:en",
    p.place,
    p.population::integer as pop,
    p.wikidata
FROM planet_osm_polygon p, uk_boundary uk
WHERE p.place IN ('city', 'town')
  AND ST_Within(p.way, uk.way)
ORDER BY pop DESC NULLS LAST;
```

### Get Admin Region for a Point

```sql
-- Find what admin regions contain a given point
SELECT 
    name,
    admin_level,
    boundary
FROM planet_osm_polygon
WHERE boundary = 'administrative'
  AND ST_Contains(way, ST_Transform(ST_SetSRID(ST_MakePoint(-2.2426, 53.4808), 4326), 3857))
ORDER BY admin_level::integer DESC;

-- Result for Manchester coordinates:
-- Greater Manchester (admin_level 6)
-- England (admin_level 4)
-- United Kingdom (admin_level 2)
```

### Spatial Search: Cities Within Distance

```sql
-- Find cities within 50km of Manchester
SELECT 
    name,
    place,
    population::integer as pop,
    ST_Distance(
        way::geography,
        ST_Transform(ST_SetSRID(ST_MakePoint(-2.2426, 53.4808), 4326), 3857)::geography
    ) / 1000 as distance_km
FROM planet_osm_point
WHERE place IN ('city', 'town')
  AND ST_DWithin(
        way::geography,
        ST_Transform(ST_SetSRID(ST_MakePoint(-2.2426, 53.4808), 4326), 3857)::geography,
        50000  -- 50km in meters
      )
ORDER BY distance_km;
```

## Integration Implementation

### PostGIS Adapter

```javascript
// src/db/postgis/index.js
'use strict';

const { Pool } = require('pg');
const path = require('path');
const fs = require('fs');

class PostGISAdapter {
  constructor(config = {}) {
    this.config = {
      host: config.host || process.env.POSTGIS_HOST || 'localhost',
      port: config.port || process.env.POSTGIS_PORT || 5432,
      database: config.database || process.env.POSTGIS_DATABASE || 'osm',
      user: config.user || process.env.POSTGIS_USER || 'osm',
      password: config.password || process.env.POSTGIS_PASSWORD || 'osm',
      max: 10,  // Connection pool size
      idleTimeoutMillis: 30000
    };
    
    this.pool = new Pool(this.config);
    this.connected = false;
  }
  
  async connect() {
    try {
      const client = await this.pool.connect();
      const result = await client.query('SELECT PostGIS_Version()');
      client.release();
      this.connected = true;
      console.log(`[PostGIS] Connected, version: ${result.rows[0].postgis_version}`);
      return true;
    } catch (err) {
      console.error('[PostGIS] Connection failed:', err.message);
      return false;
    }
  }
  
  async query(sql, params = []) {
    const client = await this.pool.connect();
    try {
      const result = await client.query(sql, params);
      return result.rows;
    } finally {
      client.release();
    }
  }
  
  async close() {
    await this.pool.end();
    this.connected = false;
  }
  
  // ─────────────────────────────────────────────────────────────
  // Place Queries
  // ─────────────────────────────────────────────────────────────
  
  /**
   * Get all cities from OSM
   * @param {Object} options - Query options
   * @param {number} options.minPopulation - Minimum population filter
   * @param {string} options.countryCode - Filter by country (ISO 3166-1 alpha-2)
   * @param {number} options.limit - Maximum results
   */
  async getCities(options = {}) {
    const { minPopulation = 0, countryCode = null, limit = 10000 } = options;
    
    let sql = `
      SELECT 
        osm_id,
        name,
        "name:en" as name_en,
        place,
        population::integer as population,
        wikidata,
        ST_X(ST_Transform(COALESCE(ST_Centroid(way), way), 4326)) as lng,
        ST_Y(ST_Transform(COALESCE(ST_Centroid(way), way), 4326)) as lat
      FROM (
        SELECT osm_id, name, "name:en", place, population, wikidata, way
        FROM planet_osm_polygon
        WHERE place IN ('city', 'town')
          AND name IS NOT NULL
        UNION ALL
        SELECT osm_id, name, "name:en", place, population, wikidata, way
        FROM planet_osm_point
        WHERE place IN ('city', 'town')
          AND name IS NOT NULL
      ) combined
      WHERE TRUE
    `;
    
    const params = [];
    
    if (minPopulation > 0) {
      params.push(minPopulation);
      sql += ` AND population::integer >= $${params.length}`;
    }
    
    sql += ` ORDER BY population::integer DESC NULLS LAST`;
    
    if (limit) {
      params.push(limit);
      sql += ` LIMIT $${params.length}`;
    }
    
    return this.query(sql, params);
  }
  
  /**
   * Get admin boundaries for a country
   */
  async getAdminBoundaries(countryCode, adminLevel = null) {
    const sql = `
      WITH country AS (
        SELECT way FROM planet_osm_polygon
        WHERE boundary = 'administrative'
          AND admin_level = '2'
          AND ("ISO3166-1" = $1 OR "ISO3166-1:alpha2" = $1)
      )
      SELECT 
        p.osm_id,
        p.name,
        p."name:en" as name_en,
        p.admin_level,
        p.wikidata,
        p."ISO3166-2" as iso_code,
        ST_X(ST_Transform(ST_Centroid(p.way), 4326)) as lng,
        ST_Y(ST_Transform(ST_Centroid(p.way), 4326)) as lat,
        ST_Area(p.way::geography) / 1000000 as area_km2
      FROM planet_osm_polygon p, country c
      WHERE p.boundary = 'administrative'
        AND p.admin_level = COALESCE($2, p.admin_level)
        AND ST_Within(ST_Centroid(p.way), c.way)
      ORDER BY p.admin_level::integer, area_km2 DESC
    `;
    
    return this.query(sql, [countryCode, adminLevel]);
  }
  
  /**
   * Get boundary polygon for a place by OSM ID
   */
  async getBoundary(osmId, simplifyTolerance = 100) {
    const sql = `
      SELECT 
        osm_id,
        name,
        ST_AsGeoJSON(
          ST_Transform(
            ST_Simplify(way, $2),
            4326
          )
        ) as geojson,
        ST_AsText(
          ST_Transform(
            ST_Envelope(way),
            4326
          )
        ) as bbox_wkt
      FROM planet_osm_polygon
      WHERE osm_id = $1
    `;
    
    const rows = await this.query(sql, [osmId, simplifyTolerance]);
    if (rows.length === 0) return null;
    
    const row = rows[0];
    return {
      osmId: row.osm_id,
      name: row.name,
      boundary: JSON.parse(row.geojson),
      bbox: this._parseBboxWkt(row.bbox_wkt)
    };
  }
  
  /**
   * Find which admin region contains a point
   */
  async reverseGeocode(lat, lng) {
    const sql = `
      SELECT 
        osm_id,
        name,
        "name:en" as name_en,
        admin_level,
        place,
        wikidata
      FROM planet_osm_polygon
      WHERE boundary = 'administrative'
        AND ST_Contains(
          way,
          ST_Transform(ST_SetSRID(ST_MakePoint($2, $1), 4326), 3857)
        )
      ORDER BY admin_level::integer DESC
    `;
    
    return this.query(sql, [lat, lng]);
  }
  
  /**
   * Match OSM places to existing gazetteer places
   */
  async matchByWikidataId(wikidataQid) {
    const sql = `
      SELECT 
        osm_id,
        name,
        place,
        boundary,
        admin_level,
        population::integer as population,
        ST_X(ST_Transform(COALESCE(ST_Centroid(way), way), 4326)) as lng,
        ST_Y(ST_Transform(COALESCE(ST_Centroid(way), way), 4326)) as lat
      FROM (
        SELECT * FROM planet_osm_polygon WHERE wikidata = $1
        UNION ALL
        SELECT * FROM planet_osm_point WHERE wikidata = $1
      ) combined
      LIMIT 1
    `;
    
    const rows = await this.query(sql, [wikidataQid]);
    return rows.length > 0 ? rows[0] : null;
  }
  
  _parseBboxWkt(wkt) {
    // Parse "POLYGON((minx miny, maxx miny, maxx maxy, minx maxy, minx miny))"
    const match = wkt.match(/POLYGON\(\(([^)]+)\)\)/);
    if (!match) return null;
    
    const coords = match[1].split(',').map(c => {
      const [x, y] = c.trim().split(' ').map(Number);
      return [x, y];
    });
    
    const xs = coords.map(c => c[0]);
    const ys = coords.map(c => c[1]);
    
    return {
      minLng: Math.min(...xs),
      maxLng: Math.max(...xs),
      minLat: Math.min(...ys),
      maxLat: Math.max(...ys)
    };
  }
}

module.exports = { PostGISAdapter };
```

### OSM Ingestor

```javascript
// src/crawler/gazetteer/ingestors/OsmIngestor.js
'use strict';

const { PostGISAdapter } = require('../../../db/postgis');
const ingestQueries = require('../../../db/sqlite/queries/gazetteer.ingest');

class OsmIngestor {
  constructor({ db, logger = console, postgisConfig = {} }) {
    this.db = db;
    this.logger = logger;
    this.postgis = new PostGISAdapter(postgisConfig);
    this.stmts = ingestQueries.createIngestionStatements(db);
    
    this.id = 'osm';
    this.name = 'OpenStreetMap Ingestor';
  }
  
  async execute({ signal = null, emitProgress = null } = {}) {
    const startedAt = Date.now();
    let recordsProcessed = 0;
    let recordsUpserted = 0;
    let errors = 0;
    
    // Connect to PostGIS
    const connected = await this.postgis.connect();
    if (!connected) {
      throw new Error('Failed to connect to PostGIS database');
    }
    
    try {
      // Phase 1: Get cities from OSM
      this.logger.info('[OsmIngestor] Fetching cities from PostGIS...');
      const cities = await this.postgis.getCities({ minPopulation: 15000, limit: 50000 });
      
      this.logger.info(`[OsmIngestor] Found ${cities.length} cities`);
      
      for (const city of cities) {
        if (signal?.aborted) break;
        
        try {
          await this._upsertPlace(city, 'city');
          recordsUpserted++;
        } catch (err) {
          this.logger.error(`[OsmIngestor] Error upserting ${city.name}:`, err.message);
          errors++;
        }
        
        recordsProcessed++;
        
        if (recordsProcessed % 1000 === 0) {
          this._emitProgress(emitProgress, {
            phase: 'cities',
            processed: recordsProcessed,
            upserted: recordsUpserted,
            errors
          });
        }
      }
      
      // Phase 2: Add boundaries for existing places
      // (Match by Wikidata ID and add OSM boundary)
      
      return {
        recordsProcessed,
        recordsUpserted,
        errors,
        durationMs: Date.now() - startedAt
      };
      
    } finally {
      await this.postgis.close();
    }
  }
  
  async _upsertPlace(osmPlace, kind) {
    // Try to find existing place by Wikidata ID
    let placeId = null;
    
    if (osmPlace.wikidata) {
      const existing = ingestQueries.findByExternalId(this.db, 'wikidata', osmPlace.wikidata);
      if (existing) {
        placeId = existing.id;
      }
    }
    
    if (placeId) {
      // Update existing place with OSM data
      ingestQueries.updatePlaceFromOsm(this.db, placeId, {
        lat: osmPlace.lat,
        lng: osmPlace.lng,
        population: osmPlace.population
      });
      
      // Add OSM external ID
      ingestQueries.insertExternalId(this.stmts, 'osm', String(osmPlace.osm_id), placeId);
      
    } else {
      // Create new place
      const { placeId: newId } = ingestQueries.upsertPlace(this.db, this.stmts, {
        osmId: String(osmPlace.osm_id),
        kind,
        countryCode: null,  // Would need reverse geocode
        population: osmPlace.population,
        lat: osmPlace.lat,
        lng: osmPlace.lng,
        source: 'osm'
      });
      
      placeId = newId;
      
      // Add names
      if (osmPlace.name) {
        ingestQueries.insertPlaceName(this.stmts, placeId, {
          text: osmPlace.name,
          lang: 'und',
          kind: 'official',
          isPreferred: 1,
          source: 'osm'
        });
      }
      
      if (osmPlace.name_en && osmPlace.name_en !== osmPlace.name) {
        ingestQueries.insertPlaceName(this.stmts, placeId, {
          text: osmPlace.name_en,
          lang: 'en',
          kind: 'official',
          isPreferred: 0,
          source: 'osm'
        });
      }
      
      // Set canonical name
      ingestQueries.setCanonicalName(this.stmts, placeId);
    }
    
    return placeId;
  }
  
  _emitProgress(emitProgress, payload) {
    if (typeof emitProgress === 'function') {
      emitProgress(payload);
    }
  }
}

module.exports = { OsmIngestor };
```

## Boundary Enrichment

### Add Boundaries to Existing Places

```javascript
// scripts/gazetteer/enrich-boundaries.js
async function enrichBoundaries(sqliteDb, postgis) {
  // Get all places with Wikidata IDs
  const places = sqliteDb.prepare(`
    SELECT p.id, p.kind, e.ext_id as wikidata_qid
    FROM places p
    JOIN place_external_ids e ON p.id = e.place_id
    WHERE e.source = 'wikidata'
      AND p.bbox IS NULL
  `).all();
  
  console.log(`Found ${places.length} places without boundaries`);
  
  let enriched = 0;
  for (const place of places) {
    const osmPlace = await postgis.matchByWikidataId(place.wikidata_qid);
    
    if (osmPlace && osmPlace.osm_id) {
      const boundary = await postgis.getBoundary(osmPlace.osm_id);
      
      if (boundary) {
        sqliteDb.prepare(`
          UPDATE places SET bbox = ? WHERE id = ?
        `).run(JSON.stringify(boundary.bbox), place.id);
        
        // Also add OSM ID
        sqliteDb.prepare(`
          INSERT OR IGNORE INTO place_external_ids (place_id, source, ext_id)
          VALUES (?, 'osm', ?)
        `).run(place.id, String(osmPlace.osm_id));
        
        enriched++;
      }
    }
  }
  
  console.log(`Enriched ${enriched} places with boundaries`);
}
```

## Best Practices

### 1. Use Wikidata as Bridge
OSM and GeoNames both link to Wikidata. Use `wikidata` QID to match records across sources.

```sql
-- Find OSM places that match GeoNames via Wikidata
SELECT 
    g.geonameid,
    g.name as geonames_name,
    o.osm_id,
    o.name as osm_name,
    o.wikidata
FROM geonames g
JOIN planet_osm_polygon o ON o.wikidata = 'Q' || g.wikidata_qid
WHERE g.feature_class = 'P';
```

### 2. Prefer OSM for Boundaries, GeoNames for Attributes
- **OSM**: Boundary polygons, precise coordinates
- **GeoNames**: Population, timezone, admin codes, alternate names

### 3. Handle Coordinate Systems
OSM uses EPSG:3857 (Web Mercator). Always transform to EPSG:4326 (WGS84) for storage.

```sql
ST_Transform(way, 4326)  -- 3857 → 4326
ST_Transform(ST_SetSRID(ST_MakePoint(lng, lat), 4326), 3857)  -- 4326 → 3857
```

### 4. Simplify Boundaries for Storage
Full OSM boundaries are detailed. Simplify for storage.

```sql
ST_Simplify(way, 100)  -- Tolerance in projection units (meters for 3857)
```

### 5. Index Your Queries
If running custom queries frequently, add indexes:

```sql
CREATE INDEX idx_osm_polygon_wikidata ON planet_osm_polygon(wikidata) WHERE wikidata IS NOT NULL;
CREATE INDEX idx_osm_polygon_place ON planet_osm_polygon(place) WHERE place IS NOT NULL;
CREATE INDEX idx_osm_point_place ON planet_osm_point(place) WHERE place IS NOT NULL;
```
