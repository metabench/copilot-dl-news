const { Client } = require('pg');
const EventEmitter = require('events');
const fs = require('fs');
const path = require('path');

// Simple .env loader
try {
    const envPath = path.join(__dirname, '.env');
    if (fs.existsSync(envPath)) {
        const envConfig = fs.readFileSync(envPath, 'utf8');
        envConfig.split('\n').forEach(line => {
            const [key, value] = line.split('=');
            if (key && value) {
                process.env[key.trim()] = value.trim();
            }
        });
    }
} catch (e) {
    console.warn('Could not load .env file', e);
}

class PostgisImporter extends EventEmitter {
    constructor() {
        super();
        this.config = {
            user: process.env.POSTGIS_USER || 'postgres',
            host: process.env.POSTGIS_HOST || 'localhost',
            database: process.env.POSTGIS_DB || 'planet1',
            password: process.env.POSTGIS_PASSWORD,
            port: process.env.POSTGIS_PORT || 5432,
        };
    }

    async start() {
        this.emit('log', { level: 'info', msg: 'Connecting to PostGIS...' });
        const client = new Client(this.config);

        try {
            await client.connect();
            this.emit('log', { level: 'info', msg: 'Connected to PostGIS' });

            // 1. Fetch Canada
            this.emit('progress', { step: 'Fetching Country', details: 'Canada (CA)' });
            const countryRes = await client.query(`
                SELECT name, iso_a2, area_km2, ST_NPoints(geom_wgs84) as points 
                FROM countries 
                WHERE iso_a2 = 'CA'
            `);
            
            if (countryRes.rows.length === 0) {
                throw new Error('Canada not found in DB');
            }
            
            const country = countryRes.rows[0];
            this.emit('data', { type: 'country', data: country });
            this.emit('log', { level: 'info', msg: `Found Country: ${country.name}`, data: country });

            // 2. Fetch ADM1s (Provinces)
            this.emit('progress', { step: 'Fetching Regions', details: 'ADM1 (Provinces/Territories)' });
            
            // Note: Using the query logic from postgis-explore.js
            // We need the country geometry to find contained regions
            const countryGeomRes = await client.query(`SELECT geom_wgs84 FROM countries WHERE iso_a2 = 'CA'`);
            const countryGeom = countryGeomRes.rows[0].geom_wgs84;

            const adm1Res = await client.query(`
                SELECT 
                    a.name, 
                    a.admin_level,
                    ST_Area(ST_Transform(a.way, 4326)::geography) / 1000000 as area_km2
                FROM admin_areas a
                WHERE a.admin_level = 4
                AND ST_Contains(ST_Transform($1::geometry, 3857), ST_Centroid(a.way))
                ORDER BY a.name
            `, [countryGeom]);

            this.emit('log', { level: 'info', msg: `Found ${adm1Res.rows.length} ADM1 regions` });

            for (const region of adm1Res.rows) {
                this.emit('data', { type: 'region', data: region });
                // Simulate some processing time
                await new Promise(r => setTimeout(r, 200));
                
                // If it's Ontario, let's fetch some ADM2s (Counties/Districts)
                if (region.name === 'Ontario') {
                    this.emit('progress', { step: 'Deep Dive', details: 'Fetching Ontario Sub-regions' });
                    await this.fetchSubRegions(client, region.name);
                }
            }

            this.emit('complete');

        } catch (err) {
            this.emit('log', { level: 'error', msg: err.message });
            this.emit('error', err);
        } finally {
            await client.end();
        }
    }

    async fetchSubRegions(client, parentName) {
        // Find the parent geometry first
        const parentRes = await client.query(`
            SELECT way FROM admin_areas WHERE name = $1 AND admin_level = 4 LIMIT 1
        `, [parentName]);
        
        if (parentRes.rows.length === 0) return;
        const parentWay = parentRes.rows[0].way;

        const adm2Res = await client.query(`
            SELECT name, admin_level 
            FROM admin_areas 
            WHERE admin_level = 8 
            AND ST_Contains($1::geometry, ST_Centroid(way))
            LIMIT 10
        `, [parentWay]);

        for (const sub of adm2Res.rows) {
            this.emit('data', { type: 'subregion', parent: parentName, data: sub });
            await new Promise(r => setTimeout(r, 100));
        }
    }
}

module.exports = PostgisImporter;
