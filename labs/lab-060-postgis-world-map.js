/**
 * Lab 060: PostGIS World Map Visualization
 * 
 * Interactive world map showing countries from PostGIS with:
 * - Dynamic country fills based on status (complete/in-progress/pending)
 * - Click to zoom into country details
 * - Hover tooltips
 * - Status legend
 * 
 * Run: node labs/lab-060-postgis-world-map.js
 * Opens: http://localhost:3060
 */

const express = require('express');
const { Client } = require('pg');
const path = require('path');

const PORT = 3060;

const DB_CONFIG = {
  host: 'localhost',
  database: 'planet1',
  user: 'postgres',
  password: 'pg1234'
};

async function getDbClient() {
  const client = new Client(DB_CONFIG);
  await client.connect();
  return client;
}

const app = express();

// Serve static files
app.use('/static', express.static(path.join(__dirname, '..', 'public')));

// API: Get all countries as GeoJSON
app.get('/api/countries', async (req, res) => {
  const simplify = parseFloat(req.query.simplify) || 0.5;
  let client;
  
  try {
    client = await getDbClient();
    
    const result = await client.query(`
      SELECT 
        name,
        iso_a2,
        iso_a3,
        wikidata,
        area_km2,
        ST_AsGeoJSON(ST_Simplify(geom_wgs84, $1)) as geojson
      FROM countries
      WHERE iso_a2 IS NOT NULL AND iso_a2 != ''
        AND geom_wgs84 IS NOT NULL
      ORDER BY name
    `, [simplify]);
    
    const features = result.rows
      .filter(row => row.geojson)
      .map(row => ({
        type: 'Feature',
        properties: {
          name: row.name,
          iso_a2: row.iso_a2,
          iso_a3: row.iso_a3,
          wikidata: row.wikidata,
          area_km2: row.area_km2 ? Math.round(row.area_km2) : null,
          // Mock status for demo - in real app this comes from gazetteer import state
          status: mockStatus(row.iso_a2)
        },
        geometry: JSON.parse(row.geojson)
      }));
    
    res.json({
      type: 'FeatureCollection',
      features,
      meta: {
        count: features.length,
        simplify
      }
    });
    
  } catch (err) {
    console.error('Error fetching countries:', err.message);
    res.status(500).json({ error: err.message });
  } finally {
    if (client) await client.end();
  }
});

// API: Get single country GeoJSON (detailed)
app.get('/api/country/:code', async (req, res) => {
  const code = req.params.code.toUpperCase();
  const simplify = parseFloat(req.query.simplify) || 0.01;
  let client;
  
  try {
    client = await getDbClient();
    
    const result = await client.query(`
      SELECT 
        name,
        iso_a2,
        iso_a3,
        wikidata,
        area_km2,
        ST_AsGeoJSON(ST_Simplify(geom_wgs84, $2)) as geojson,
        ST_XMin(geom_wgs84) as bbox_west,
        ST_YMin(geom_wgs84) as bbox_south,
        ST_XMax(geom_wgs84) as bbox_east,
        ST_YMax(geom_wgs84) as bbox_north
      FROM countries
      WHERE UPPER(iso_a2) = $1 OR UPPER(iso_a3) = $1
      LIMIT 1
    `, [code, simplify]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Country not found' });
    }
    
    const row = result.rows[0];
    res.json({
      type: 'Feature',
      properties: {
        name: row.name,
        iso_a2: row.iso_a2,
        iso_a3: row.iso_a3,
        wikidata: row.wikidata,
        area_km2: row.area_km2 ? Math.round(row.area_km2) : null
      },
      geometry: JSON.parse(row.geojson),
      bbox: [row.bbox_west, row.bbox_south, row.bbox_east, row.bbox_north]
    });
    
  } catch (err) {
    console.error('Error fetching country:', err.message);
    res.status(500).json({ error: err.message });
  } finally {
    if (client) await client.end();
  }
});

// API: Database stats
app.get('/api/stats', async (req, res) => {
  let client;
  
  try {
    client = await getDbClient();
    
    const [countries, adminAreas, version] = await Promise.all([
      client.query(`SELECT COUNT(*) as cnt FROM countries WHERE iso_a2 IS NOT NULL`),
      client.query(`SELECT admin_level, COUNT(*) as cnt FROM admin_areas GROUP BY admin_level ORDER BY admin_level`),
      client.query(`SELECT PostGIS_Version() as version`)
    ]);
    
    res.json({
      postgisVersion: version.rows[0].version,
      countryCount: parseInt(countries.rows[0].cnt, 10),
      adminLevels: adminAreas.rows.reduce((acc, r) => {
        acc[`level_${r.admin_level}`] = parseInt(r.cnt, 10);
        return acc;
      }, {})
    });
    
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    if (client) await client.end();
  }
});

// Mock status based on ISO code (for demo purposes)
function mockStatus(isoCode) {
  const complete = ['US', 'CA', 'GB', 'FR', 'DE', 'IT', 'ES', 'AU', 'JP', 'IN', 'BR', 'MX'];
  const inProgress = ['CN', 'RU', 'ZA', 'NG', 'EG', 'AR', 'CL'];
  
  if (complete.includes(isoCode)) return 'complete';
  if (inProgress.includes(isoCode)) return 'in-progress';
  return 'pending';
}

// Main HTML page
app.get('/', (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Lab 060: PostGIS World Map</title>
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { 
      font-family: system-ui, -apple-system, sans-serif;
      background: #0f172a;
      color: #e2e8f0;
    }
    #header {
      background: linear-gradient(to bottom, #1e3a5f, #0f172a);
      padding: 12px 20px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1px solid #334155;
    }
    #header h1 { font-size: 18px; color: #e2e8f0; }
    #header .stats { font-size: 12px; color: #94a3b8; }
    #map-container {
      display: flex;
      height: calc(100vh - 50px);
    }
    #map { 
      flex: 1;
      background: #1e293b;
    }
    #sidebar {
      width: 300px;
      background: #1e293b;
      border-left: 1px solid #334155;
      padding: 16px;
      overflow-y: auto;
    }
    #legend {
      margin-bottom: 20px;
    }
    #legend h3 { 
      font-size: 14px; 
      color: #94a3b8;
      margin-bottom: 12px;
    }
    .legend-item {
      display: flex;
      align-items: center;
      margin-bottom: 8px;
      font-size: 12px;
    }
    .legend-color {
      width: 20px;
      height: 20px;
      border-radius: 4px;
      margin-right: 10px;
    }
    .complete { background: #10b981; }
    .in-progress { background: #f59e0b; }
    .pending { background: #475569; }
    #country-info {
      background: #0f172a;
      border-radius: 8px;
      padding: 16px;
      display: none;
    }
    #country-info.visible { display: block; }
    #country-info h2 {
      font-size: 16px;
      margin-bottom: 12px;
      color: #e2e8f0;
    }
    #country-info .detail {
      display: flex;
      justify-content: space-between;
      padding: 6px 0;
      border-bottom: 1px solid #334155;
      font-size: 12px;
    }
    #country-info .detail:last-child { border-bottom: none; }
    #country-info .label { color: #64748b; }
    #country-info .value { color: #e2e8f0; }
    .leaflet-popup-content-wrapper {
      background: #1e293b;
      color: #e2e8f0;
      border-radius: 8px;
    }
    .leaflet-popup-tip { background: #1e293b; }
    .loading {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: rgba(15, 23, 42, 0.9);
      padding: 20px 40px;
      border-radius: 8px;
      z-index: 1000;
    }
  </style>
</head>
<body>
  <div id="header">
    <h1>🌍 PostGIS World Map — Gazetteer Import Progress</h1>
    <div class="stats" id="stats">Loading...</div>
  </div>
  <div id="map-container">
    <div id="map">
      <div class="loading" id="loading">Loading countries...</div>
    </div>
    <div id="sidebar">
      <div id="legend">
        <h3>Import Status</h3>
        <div class="legend-item">
          <div class="legend-color complete"></div>
          <span>Complete</span>
        </div>
        <div class="legend-item">
          <div class="legend-color in-progress"></div>
          <span>In Progress</span>
        </div>
        <div class="legend-item">
          <div class="legend-color pending"></div>
          <span>Pending</span>
        </div>
      </div>
      <div id="country-info">
        <h2 id="country-name">Country Name</h2>
        <div class="detail">
          <span class="label">ISO Code</span>
          <span class="value" id="country-iso">--</span>
        </div>
        <div class="detail">
          <span class="label">Wikidata</span>
          <span class="value" id="country-wikidata">--</span>
        </div>
        <div class="detail">
          <span class="label">Area</span>
          <span class="value" id="country-area">--</span>
        </div>
        <div class="detail">
          <span class="label">Status</span>
          <span class="value" id="country-status">--</span>
        </div>
      </div>
    </div>
  </div>
  
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script>
    // Initialize map
    const map = L.map('map', {
      center: [20, 0],
      zoom: 2,
      minZoom: 2,
      maxZoom: 8
    });
    
    // Dark tile layer
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
      subdomains: 'abcd',
      maxZoom: 20
    }).addTo(map);
    
    // Status colors
    const statusColors = {
      'complete': '#10b981',
      'in-progress': '#f59e0b',
      'pending': '#475569'
    };
    
    // Style function
    function style(feature) {
      const status = feature.properties.status || 'pending';
      return {
        fillColor: statusColors[status],
        weight: 1,
        opacity: 0.8,
        color: '#1e293b',
        fillOpacity: 0.6
      };
    }
    
    // Highlight style
    function highlightStyle(feature) {
      return {
        weight: 2,
        color: '#e2e8f0',
        fillOpacity: 0.8
      };
    }
    
    let geojsonLayer;
    
    // Show country info in sidebar
    function showCountryInfo(props) {
      const el = document.getElementById('country-info');
      el.classList.add('visible');
      document.getElementById('country-name').textContent = props.name;
      document.getElementById('country-iso').textContent = props.iso_a2 + ' / ' + props.iso_a3;
      document.getElementById('country-wikidata').textContent = props.wikidata || 'N/A';
      document.getElementById('country-area').textContent = props.area_km2 
        ? props.area_km2.toLocaleString() + ' km²' 
        : 'N/A';
      document.getElementById('country-status').textContent = props.status || 'pending';
      document.getElementById('country-status').style.color = statusColors[props.status || 'pending'];
    }
    
    // Feature interaction
    function onEachFeature(feature, layer) {
      layer.on({
        mouseover: (e) => {
          const layer = e.target;
          layer.setStyle(highlightStyle(feature));
          layer.bringToFront();
        },
        mouseout: (e) => {
          geojsonLayer.resetStyle(e.target);
        },
        click: (e) => {
          showCountryInfo(feature.properties);
          map.fitBounds(e.target.getBounds(), { padding: [50, 50] });
        }
      });
      
      // Tooltip
      layer.bindTooltip(feature.properties.name, {
        permanent: false,
        direction: 'center',
        className: 'country-tooltip'
      });
    }
    
    // Load countries
    async function loadCountries() {
      try {
        const response = await fetch('/api/countries?simplify=0.5');
        const geojson = await response.json();
        
        document.getElementById('loading').style.display = 'none';
        document.getElementById('stats').textContent = 
          \`\${geojson.meta.count} countries loaded\`;
        
        geojsonLayer = L.geoJSON(geojson, {
          style: style,
          onEachFeature: onEachFeature
        }).addTo(map);
        
      } catch (err) {
        document.getElementById('loading').textContent = 'Error: ' + err.message;
      }
    }
    
    loadCountries();
  </script>
</body>
</html>`);
});

app.listen(PORT, () => {
  console.log(`\n🌍 Lab 060: PostGIS World Map`);
  console.log(`   http://localhost:${PORT}\n`);
  console.log(`API endpoints:`);
  console.log(`   GET /api/countries?simplify=0.5`);
  console.log(`   GET /api/country/:code?simplify=0.01`);
  console.log(`   GET /api/stats\n`);
});
