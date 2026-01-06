# Chapter 6: Spatial Data Strategy (No PostGIS Required)

*Reading time: 10 minutes*

---

## The "SRID Problem" We Avoided

In traditional GIS systems (like PostGIS), a common source of pain is the **SRID (Spatial Reference System Identifier)** mismatch:
-   **SRID 4326 (WGS84)**: Longitude/Latitude in degrees. Used by GPS and GeoJSON.
-   **SRID 3857 (Web Mercator)**: Meters from the equator. Used by web maps (Google, OSM).

Queries fail silently or return garbage if you mix them. `ST_Contains(geometry_3857, point_4326)` is a classic footgun.

**We solve this by removing the complexity entirely.**

Our architecture uses **SQLite** as the runtime store, which doesn't have a native geometry engine enabled by default. Instead of fighting projection transforms at query time, we standardize everything on **WGS84 (SRID 4326)** and pre-compute relationships.

---

## The Schema Strategy

We store spatial data in three simple, universally understood formats within the `places` table:

| Column | Type | Description |
|--------|------|-------------|
| `lat` | `REAL` | Latitude in decimal degrees (WGS84) |
| `lng` | `REAL` | Longitude in decimal degrees (WGS84) |
| `bbox` | `TEXT` | JSON array `[west, south, east, north]` |

### Why No Geometry Column?

1.  **Portability**: `lat`/`lng` works in every language, database, and frontend without special libraries.
2.  **Performance**: Bounding box checks on float columns are incredibly fast and index-friendly.
3.  **Simplicity**: No need for `ST_Transform`, `ST_SetSRID`, or GEOS dependencies.

---

## Query Patterns

### 1. The "Nearby" Query (Bounding Box)

Instead of `ST_DWithin`, we use simple arithmetic to find candidates, then refine in application logic if needed.

```sql
-- Find places within roughly +/- 0.1 degrees of a point
SELECT name, lat, lng
FROM places
WHERE lat BETWEEN ? - 0.1 AND ? + 0.1
  AND lng BETWEEN ? - 0.1 AND ? + 0.1;
```

### 2. The "Containment" Query (Hierarchy)

In PostGIS, you might run `ST_Contains(admin_poly, point)` to see if a city is in a region. This is expensive.

In our system, **containment is pre-computed** into the `place_hierarchy` table during ingestion.

```sql
-- Find all cities in 'California' (id 123)
SELECT child.*
FROM place_hierarchy ph
JOIN places child ON ph.child_id = child.id
WHERE ph.parent_id = 123
  AND child.kind = 'city';
```

This turns a complex spatial join ($O(N \log M)$) into a trivial integer lookup ($O(1)$).

---

## Handling Complex Geometries

We *do* sometimes need polygon boundaries (e.g., for rendering maps or precise point-in-polygon checks during ingestion).

### Storage
We don't store complex polygons in the main `places` table to keep it light. If we need them (e.g., for a map UI), we store them in a separate `place_geometries` table (or external GeoJSON files keyed by ID) loaded only on demand.

### Ingestion Pipeline
The complexity is moved to the **Ingestion Pipeline** (Chapter 10).
1.  **Import**: Read source data (OSM PBF, Shapefiles, GeoJSON).
2.  **Normalize**: Convert everything to WGS84.
3.  **Compute**: Use libraries like `turf.js` or `osmtogeojson` to calculate centroids (`lat`/`lng`) and bounding boxes (`bbox`).
4.  **Link**: Determine hierarchy (e.g., "This point is inside that polygon") and write rows to `place_hierarchy`.
5.  **Discard**: Throw away the heavy polygon data unless explicitly needed for UI.

---

## Summary

| Feature | Traditional GIS (PostGIS) | Our Approach (SQLite) |
|---------|---------------------------|-----------------------|
| **Coordinates** | `geometry(Point, 3857)` | `lat`, `lng` (REAL) |
| **Projections** | Many (must transform) | Always WGS84 |
| **Containment** | `ST_Contains()` at runtime | `place_hierarchy` table |
| **Performance** | Heavy CPU usage | Fast integer joins |
| **Dependencies** | libgeos, libproj | None (Standard SQL) |

By accepting that **we are a gazetteer, not a GIS**, we simplify our architecture dramatically. We answer "Where is Paris?" and "What is inside France?", not "What is the intersection area of these two arbitrary polygons?".

---

*Next: [Chapter 7 — Building Containment Graphs](./07-containment-graphs.md)*
