# Place Hub Hierarchy

**When to Read**: When working with geographic place hubs; when understanding the continent/country/region/city taxonomy; when implementing place-based crawling logic.

## Overview

**Place hubs** are news website sections dedicated to geographic locations. They follow a hierarchical structure from large regions down to specific cities.

## Terminology

- **Place Hub**: General term for any geographic hub (continent, country, region, city, etc.)
- **Country Hub**: A specific type of place hub for countries (e.g., `/world/france`, `/uk`, `/australia`)
- **Continent Hub**: A specific type of place hub for continents (e.g., `/africa`, `/asia`, `/europe`)
- **Region Hub**: A specific type of place hub for administrative regions (e.g., `/california`, `/scotland`). Constituent countries of the United Kingdom (England, Scotland, Wales, Northern Ireland) are treated as region hubs so they appear alongside traditional states and provinces.
- **City Hub**: A specific type of place hub for cities (e.g., `/newyork`, `/london`, `/tokyo`)

## Hierarchy

```
Place Hubs
├── Continent Hubs (7 continents)
│   ├── Africa
│   ├── Antarctica
│   ├── Asia
│   ├── Europe
│   ├── North America
│   ├── Oceania
│   └── South America
├── Country Hubs (250 countries)
│   └── Each country is within a continent
├── Region Hubs (states, provinces, etc.)
│   └── Each region is within a country
└── City Hubs
    └── Each city is within a region/country
```

## Implementation

### Current Status (October 2025)

1. **Continent Hubs**: ✅ Implemented
   - 7 continents tracked
   - Detection via URL patterns and gazetteer
   - Displayed in intelligent plan output

2. **Country Hubs**: ✅ Fully Implemented
   - ~250 countries from gazetteer
   - Gap analysis service (`CountryHubGapService`)
   - Pattern learning and prioritization
   - Completion detection

3. **Region Hubs**: ⚠️ Partially Implemented
   - Database support exists
   - UK constituent countries are imported via the ADM1 ingestor
   - `guess-place-hubs` CLI can propose URLs using heuristics (DSPL + fallbacks)
   - Not yet integrated into intelligent planner
   
4. **City Hubs**: ⚠️ Partially Implemented
   - Database support exists (~257 cities)
   - `guess-place-hubs` CLI can propose URLs using heuristics (DSPL + fallbacks)
   - Not yet integrated into intelligent planner

### Code References

**Continent Data**: `src/data/continents.js`
- Continent list with codes and slugs
- Helper functions for lookupby name/slug

**Country Hub Gap Service**: `src/crawler/CountryHubGapService.js`
- Detects missing country hubs
- Generates gap predictions
- Learns URL patterns
- Emits completion milestone

**Hub Categorization**: `src/crawler/planner/HubSeeder.js`
- `_categorizeHubsByType()` - Classifies hubs by type
- `seedPlan()` - Seeds hubs with categorization
- Displays breakdown: `🗺️ N place (X continent, Y country) + 📂 N topic`

### Database Schema

**places table**:
```sql
CREATE TABLE places (
  id INTEGER PRIMARY KEY,
  kind TEXT NOT NULL,  -- 'country', 'city', 'region'
  country_code TEXT,
      wikidata_admin_level INTEGER, -- Wikidata admin level (P2959)
  population INTEGER,
  -- ... other fields
);
```

**Current place kinds**:
- `country` (250 rows)
- `city` (257 rows)
- `region` (11 rows)

**Note**: Continents are not stored in the database yet. They're defined in `src/data/continents.js`.

## Usage in Crawling

### Intelligent Plan Output

When an intelligent crawl starts, it displays the hub breakdown:

```
Intelligent plan: seeded 46 hub(s) — 🗺️  30 place (1 continent, 29 country) + 📂 20 topic
```

This shows:
- Total hubs: 46
- Place hubs: 30 (broken down by type)
  - Continent hubs: 1
  - Country hubs: 29
- Topic hubs: 20

### Priority

Place hubs have different priorities based on their scope:

1. **Continent Hubs**: Priority bias 20 (high - broad coverage)
2. **Country Hubs**: Priority bias 20 (high - comprehensive coverage goal)
3. **Region Hubs**: TBD (when implemented)
4. **City Hubs**: TBD (when implemented)

## Future Enhancements

1. **Store continents in database**
   - Add `kind='continent'` to places table
   - Populate from `src/data/continents.js`

3. **Region Hub Integration**
   - Add region hub gap service
   - Integrate into intelligent planner
   - Add URL pattern detection
   - Extend coverage checks to ensure UK constituent countries remain present

3. **City Hub Integration**
   - Add city hub gap service
   - Integrate into intelligent planner
   - Priority system for major cities

4. **Place-Topic Combinations**
   - Track hubs like `/world/politics` (country + topic)
   - Special categorization for combined hubs
   - Enhanced coverage tracking

## Related Documentation

- **HIERARCHICAL_PLANNING_INTEGRATION.md** - Multi-level strategic planning
- **GEOGRAPHY_CRAWL_TYPE.md** - Geographic crawl patterns
- **INTELLIGENT_CRAWL_OUTPUT_LIMITING.md** - Startup analysis and hub reporting
- **CountryHubGapService.js** - Country hub gap detection (reference implementation for other place types)
