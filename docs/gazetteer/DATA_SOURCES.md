# Data Sources for Gazetteer

> **Purpose**: Detailed comparison of available data sources and how to integrate them.

## Source Comparison Matrix

| Attribute | Wikidata | GeoNames | OSM/PostGIS |
|-----------|----------|----------|-------------|
| **Access** | SPARQL API | File download | Local PostgreSQL |
| **License** | CC0 | CC BY 4.0 | ODbL |
| **Cities** | ~500K | ~200K (all), 25K (pop>15K) | Millions |
| **Update frequency** | Real-time | Daily | Weekly (planet) |
| **Reliability** | Query timeouts | Stable files | Local = instant |
| **Names** | Excellent multilingual | Good multilingual | Variable quality |
| **Coordinates** | Good | Excellent | Excellent |
| **Population** | Patchy | Comprehensive | Limited |
| **Boundaries** | Limited | None | Excellent (polygons) |
| **Admin hierarchy** | Good | Excellent | Excellent |

## 1. Wikidata

### Strengths
- **Richest linked data**: Connects to Wikipedia, OpenStreetMap, GeoNames
- **Multilingual**: Native support for 300+ languages
- **Structured relationships**: Capital of, located in, part of
- **External IDs**: Links to GeoNames, OSM, FIPS, ISO codes

### Weaknesses
- **SPARQL timeouts**: Complex queries fail after 20-60 seconds
- **Rate limiting**: Query service has strict limits
- **Data quality**: User-edited, can have errors
- **No bulk download**: Must query incrementally

### Best Used For
- Cross-referencing (get GeoNames ID from Wikidata QID)
- Metadata enrichment (official languages, currencies)
- Relationship discovery (twin cities, historical names)

### Sample Query
```sparql
# Get UK cities with population > 100K
SELECT ?city ?cityLabel ?pop ?geonames WHERE {
  ?city wdt:P31/wdt:P279* wd:Q515.     # Instance of city
  ?city wdt:P17 wd:Q145.                # Country: UK
  ?city wdt:P1082 ?pop.                 # Population
  FILTER(?pop > 100000)
  OPTIONAL { ?city wdt:P1566 ?geonames. }  # GeoNames ID
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}
ORDER BY DESC(?pop)
```

---

## 2. GeoNames

### Strengths
- **Pre-curated files**: No API calls, no timeouts
- **Comprehensive cities**: cities15000.txt has all cities > 15K population
- **Daily updates**: Delta files available for sync
- **Stable IDs**: GeoNames ID is widely used as reference
- **Rich admin hierarchy**: admin1, admin2, admin3, admin4 codes

### Weaknesses
- **No boundaries**: Points only, no polygons
- **English-centric**: alternateNames needed for full multilingual
- **Large files**: allCountries.zip is 396MB compressed

### Key Files

| File | Records | Size | Description |
|------|---------|------|-------------|
| `cities15000.txt` | ~25,000 | 2.9 MB | Cities with pop > 15K or capitals |
| `cities5000.txt` | ~50,000 | 4.9 MB | Cities with pop > 5K |
| `cities1000.txt` | ~130,000 | 9.5 MB | Cities with pop > 1K |
| `admin1CodesASCII.txt` | ~3,900 | 142 KB | First-level admin regions |
| `admin2Codes.txt` | ~45,000 | 2.3 MB | Second-level admin regions |
| `alternateNamesV2.zip` | ~15M | 189 MB | All alternate names |
| `countryInfo.txt` | 252 | 31 KB | Country metadata |
| `hierarchy.zip` | ~400K | 2.0 MB | Parent-child relationships |

### Record Format (cities15000.txt)
```
geonameid         : integer id (e.g., 5128581)
name              : UTF-8 name (e.g., "New York City")
asciiname         : ASCII name (e.g., "New York City")
alternatenames    : comma-separated variants
latitude          : decimal degrees (e.g., 40.71427)
longitude         : decimal degrees (e.g., -74.00597)
feature_class     : P = populated place
feature_code      : PPL, PPLA, PPLC, etc.
country_code      : ISO 3166-1 alpha-2 (e.g., "US")
cc2               : alternate country codes
admin1_code       : FIPS/ISO code for state/province
admin2_code       : county/district code
admin3_code       : 
admin4_code       : 
population        : integer
elevation         : meters
dem               : digital elevation model
timezone          : IANA timezone ID
modification_date : YYYY-MM-DD
```

### Feature Codes (P = Populated Place)
```
PPL     : populated place
PPLA    : seat of first-order admin division (state capital)
PPLA2   : seat of second-order admin division (county seat)
PPLC    : capital of a political entity (national capital)
PPLG    : seat of government (if different from capital)
PPLS    : populated places (plural)
PPLX    : section of populated place
```

### Best Used For
- **Primary city data**: Reliable, comprehensive, pre-filtered
- **Admin region codes**: Consistent coding scheme
- **Batch loading**: No network dependencies after download
- **Cross-referencing**: GeoNames ID links to Wikidata, Wikipedia

---

## 3. OpenStreetMap (via PostGIS)

### Strengths
- **Local database**: No network latency, no rate limits
- **Boundary polygons**: Full admin boundaries available
- **Freshest data**: Can update from planet weekly
- **Spatial queries**: PostGIS enables geographic search
- **Street-level detail**: Can resolve specific locations

### Weaknesses
- **Schema complexity**: OSM data model is tag-based
- **Variable quality**: Contributor-dependent
- **Large storage**: Full planet = 1TB+ in PostgreSQL
- **Update complexity**: Requires osm2pgsql for imports

### Available in Your Local Database

Based on standard OSM PostgreSQL imports, you likely have:

```sql
-- Admin boundaries (admin_level 2 = country, 4 = state, 6 = county, 8 = city)
SELECT name, admin_level, ST_Area(way::geography) as area_sqm
FROM planet_osm_polygon
WHERE boundary = 'administrative'
  AND admin_level IN ('2', '4', '6', '8')
ORDER BY admin_level, area_sqm DESC;

-- Cities and towns
SELECT name, place, population, ST_AsText(way) as point
FROM planet_osm_point
WHERE place IN ('city', 'town', 'village')
ORDER BY population::integer DESC NULLS LAST;

-- Or from polygon table for larger places
SELECT name, place, population, ST_Centroid(way) as center
FROM planet_osm_polygon
WHERE place IN ('city', 'town')
ORDER BY ST_Area(way) DESC;
```

### OSM Tags for Places

| Tag | Values | Description |
|-----|--------|-------------|
| `place` | city, town, village, hamlet | Settlement type |
| `admin_level` | 2, 4, 6, 8, 10 | Admin hierarchy depth |
| `boundary` | administrative | Marks admin regions |
| `name` | (text) | Primary name |
| `name:en` | (text) | English name |
| `name:*` | (text) | Localized names |
| `population` | (integer) | Population count |
| `wikidata` | Q* | Wikidata QID |
| `geonames:id` | (integer) | GeoNames ID |

### Best Used For
- **Boundary polygons**: "Is this point in Manchester?"
- **Spatial disambiguation**: Nearest city to coordinates
- **Local verification**: Ground-truth for coordinates
- **Missing data**: OSM often has places GeoNames lacks

---

## Integration Strategy

### Priority Order

1. **GeoNames** (Primary for cities)
   - Load cities15000.txt for comprehensive city coverage
   - Load admin1CodesASCII.txt for region names
   - Use GeoNames ID as primary external reference

2. **PostGIS/OSM** (Boundaries + Enrichment)
   - Query for admin boundary polygons
   - Fill gaps in GeoNames data
   - Add OSM IDs for cross-referencing

3. **Wikidata** (Enrichment + Cross-reference)
   - Get multilingual names not in GeoNames
   - Link to Wikipedia articles
   - Discover relationships (capital of, etc.)

### Deduplication Keys

```
Priority 1: wikidata_qid    (most universal)
Priority 2: geonames_id     (most stable for places)
Priority 3: osm_id          (osm_type + osm_id)
Priority 4: name + country  (fallback, risk of collisions)
```

### Attribute Priority by Source

| Attribute | Best Source | Fallback |
|-----------|-------------|----------|
| Canonical name | GeoNames (English) | Wikidata label |
| Population | GeoNames | Wikidata |
| Coordinates | GeoNames | OSM centroid |
| Timezone | GeoNames | — |
| Admin codes | GeoNames | — |
| Boundaries | OSM/PostGIS | — |
| Multilingual names | Wikidata | GeoNames alternates |
| Historical names | Wikidata | — |

---

## Data Source Configuration

### Environment Variables

```bash
# GeoNames (files downloaded to local cache)
GEONAMES_CACHE_DIR=./data/cache/geonames

# PostGIS (local OSM database)
POSTGIS_HOST=localhost
POSTGIS_PORT=5432
POSTGIS_DATABASE=osm
POSTGIS_USER=osm
POSTGIS_PASSWORD=osm

# Wikidata (remote SPARQL endpoint)
WIKIDATA_SPARQL_ENDPOINT=https://query.wikidata.org/sparql
WIKIDATA_TIMEOUT_MS=20000
```

### Source Metadata Table

```sql
CREATE TABLE place_sources (
    id INTEGER PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,      -- 'geonames', 'wikidata', 'osm'
    version TEXT,                   -- '2025-11-28', 'latest'
    url TEXT,                       -- Source URL
    license TEXT,                   -- 'CC BY 4.0', 'CC0', 'ODbL'
    last_sync TEXT,                 -- ISO timestamp
    record_count INTEGER
);
```

---

## Recommended Loading Sequence

```
Step 1: Bootstrap from GeoNames (offline, fast)
├── Load countryInfo.txt          → countries
├── Load cities15000.txt          → cities (25K)
├── Load admin1CodesASCII.txt     → regions (4K)
└── Load alternateNames (filtered) → names (100K)

Step 2: Enrich from PostGIS/OSM (local, fast)
├── Match by name + country       → add osm_id
├── Query boundary polygons       → add bbox
└── Fill missing populations      → update population

Step 3: Cross-reference Wikidata (remote, slow, batched)
├── Query by GeoNames ID          → add wikidata_qid
├── Fetch multilingual labels     → add names
└── Fetch relationships           → add hierarchy

Step 4: Reconcile conflicts
├── Apply attribute priority rules
├── Log conflicts for review
└── Set canonical names
```
