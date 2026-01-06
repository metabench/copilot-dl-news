const { Pool } = require('pg');

/**
 * PostgisGazetteer
 * 
 * Provides access to the PostGIS 'planet1' database for place extraction.
 * Implements the async interface for the analysis pipeline.
 */
class PostgisGazetteer {
  constructor(options = {}) {
    this.pool = new Pool({
      connectionString: options.connectionString || process.env.POSTGIS_URL,
      host: options.host || process.env.POSTGIS_HOST || 'localhost',
      port: options.port || process.env.POSTGIS_PORT || 5432,
      database: options.database || process.env.POSTGIS_DB || 'planet1',
      user: options.user || process.env.POSTGIS_USER || 'postgres',
      password: options.password || process.env.POSTGIS_PASSWORD,
      max: options.max || 10,
      idleTimeoutMillis: 30000,
    });
    
    this.logger = options.logger || console;
  }

  async close() {
    await this.pool.end();
  }

  /**
   * Find place candidates for a set of normalized name tokens.
   * Equivalent to looking up keys in the in-memory nameMap.
   * 
   * @param {string[]} names - Array of normalized names/slugs to look up
   * @returns {Promise<Map<string, Array<Object>>>} - Map of name -> Place records
   */
  async findCandidates(names) {
    if (!names || names.length === 0) return new Map();

    // Dedupe names to reduce query size
    const uniqueNames = Array.from(new Set(names));
    
    // Batch query
    // We look in admin_areas (OSM data) and countries
    // Note: This assumes a specific schema structure common in osm2pgsql imports
    // or the custom schema defined in the book.
    // For this implementation, we'll assume the 'admin_areas' and 'countries' tables 
    // from the postgis-explore.js tool exist.
    
    const client = await this.pool.connect();
    try {
      const query = `
        SELECT 
          osm_id,
          name,
          admin_level,
          'admin_area' as kind,
          ST_AsText(ST_Centroid(way)) as centroid
        FROM admin_areas
        WHERE name = ANY($1)
        
        UNION ALL
        
        SELECT 
          -1 as osm_id,
          name,
          2 as admin_level,
          'country' as kind,
          ST_AsText(ST_Centroid(geom_wgs84)) as centroid
        FROM countries
        WHERE name = ANY($1) OR iso_a2 = ANY($1) OR iso_a3 = ANY($1)
      `;

      const result = await client.query(query, [uniqueNames]);
      
      const map = new Map();
      for (const row of result.rows) {
        const key = row.name.toLowerCase(); // Normalize key
        if (!map.has(key)) {
          map.set(key, []);
        }
        
        map.get(key).push({
          place_id: row.osm_id,
          name: row.name,
          kind: this.mapAdminLevelToKind(row.admin_level),
          country_code: null, // TODO: Spatial join to find country code
          population: 0, // Population data might need a separate join
          centroid: row.centroid
        });
      }
      
      return map;
    } catch (err) {
      this.logger.error('PostgisGazetteer query failed', err);
      return new Map();
    } finally {
      client.release();
    }
  }

  mapAdminLevelToKind(level) {
    switch (parseInt(level)) {
      case 2: return 'country';
      case 4: return 'region'; // State/Province
      case 6: return 'county';
      case 8: return 'city';
      default: return 'place';
    }
  }

  /**
   * Check if one place contains another spatially.
   * Used for hierarchy/coherence checks.
   */
  async isAncestor(parentId, childId) {
    // This would require a spatial join query
    // ST_Contains(parent.geom, child.geom)
    // For now, returning false as placeholder
    return false;
  }
}

module.exports = { PostgisGazetteer };
