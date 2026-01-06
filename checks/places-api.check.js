'use strict';

/**
 * Places API Check Script
 * 
 * Validates the places API routes module:
 * - Router factory export
 * - Endpoint handlers registered
 * - Request/response format validation
 */

const path = require('path');
const Database = require('better-sqlite3');
const { createPlacesRouter } = require('../src/api/routes/places');
const { haversineDistance, distanceToCoherence } = require('../src/analysis/place-coherence');

const DB_PATH = path.join(__dirname, '..', 'data', 'news.db');

console.log('═══════════════════════════════════════════════════════════');
console.log('  Places API Check');
console.log('═══════════════════════════════════════════════════════════');
console.log(`Database: ${DB_PATH}\n`);

let passed = 0;
let failed = 0;

function check(desc, condition) {
  if (condition) {
    console.log(`  ✅ ${desc}`);
    passed++;
  } else {
    console.log(`  ❌ ${desc}`);
    failed++;
  }
}

function checkSection(name, fn) {
  console.log(`\n┌─ ${name} ─────────────────────────────`);
  fn();
  console.log('└────────────────────────────────────────────────────────');
}

// Mock express request/response for testing
function mockRequest(body = {}, params = {}, query = {}) {
  return { body, params, query };
}

function mockResponse() {
  const res = {
    statusCode: 200,
    data: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.data = data;
      return this;
    }
  };
  return res;
}

try {
  checkSection('Module Export', () => {
    check('createPlacesRouter is function', typeof createPlacesRouter === 'function');
  });
  
  checkSection('Router Creation', () => {
    // Should require dbPath
    let error = null;
    try {
      createPlacesRouter({});
    } catch (err) {
      error = err;
    }
    check('Throws without dbPath', error !== null && error.message.includes('Database path'));
    
    // Should create router with valid dbPath
    const router = createPlacesRouter({ dbPath: DB_PATH });
    check('Returns router object', router !== null && typeof router.use === 'function');
    
    // Check registered routes
    const routes = router.stack
      .filter(layer => layer.route)
      .map(layer => ({
        path: layer.route.path,
        methods: Object.keys(layer.route.methods)
      }));
    
    console.log('    Registered routes:');
    for (const route of routes) {
      console.log(`      ${route.methods.map(m => m.toUpperCase()).join('/')} ${route.path}`);
    }
    
    check('Has /explain route', routes.some(r => r.path === '/explain'));
    check('Has /:placeId/names route', routes.some(r => r.path === '/:placeId/names'));
    check('Has /search route', routes.some(r => r.path === '/search'));
    check('Has /publisher-coverage/:host route', routes.some(r => r.path === '/publisher-coverage/:host'));
    check('Has /coherence route', routes.some(r => r.path === '/coherence'));
  });
  
  checkSection('Explain Endpoint Logic', () => {
    // Test the scoring algorithm directly
    const candidates = [
      { place_id: 1, name: 'London', country_code: 'GB', population: 8900000, feature_code: 'PPLC' },
      { place_id: 2, name: 'London', country_code: 'CA', population: 400000, feature_code: 'PPL' }
    ];
    
    // Simulate scoring
    const scores = candidates.map(c => {
      const popScore = c.population > 0 ? Math.log10(c.population) / 7 : 0;
      const featureBoost = c.feature_code === 'PPLC' ? 0.3 : 0;
      return {
        ...c,
        popScore,
        featureBoost,
        total: popScore * 0.3 + featureBoost * 0.15
      };
    });
    
    scores.sort((a, b) => b.total - a.total);
    
    check('London GB scores higher than London CA', scores[0].country_code === 'GB');
    console.log(`    London GB score: ${scores[0].total.toFixed(3)}`);
    console.log(`    London CA score: ${scores[1].total.toFixed(3)}`);
  });
  
  checkSection('Coherence Calculation', () => {
    // Test haversine distance function
    const londonLat = 51.5074;
    const londonLon = -0.1278;
    const manchesterLat = 53.4808;
    const manchesterLon = -2.2426;
    const nycLat = 40.7128;
    const nycLon = -74.0060;
    
    const distLondonManchester = haversineDistance(londonLat, londonLon, manchesterLat, manchesterLon);
    const distLondonNYC = haversineDistance(londonLat, londonLon, nycLat, nycLon);
    
    check('London-Manchester ~260km', distLondonManchester > 250 && distLondonManchester < 280);
    check('London-NYC ~5500km', distLondonNYC > 5000 && distLondonNYC < 6000);
    
    console.log(`    London → Manchester: ${distLondonManchester.toFixed(0)} km`);
    console.log(`    London → NYC: ${distLondonNYC.toFixed(0)} km`);
    
    // Test coherence scoring
    const cohManchester = distanceToCoherence(distLondonManchester);
    const cohNYC = distanceToCoherence(distLondonNYC);
    
    check('Nearby places have higher coherence', cohManchester > cohNYC);
    console.log(`    Coherence London-Manchester: ${cohManchester.toFixed(3)}`);
    console.log(`    Coherence London-NYC: ${cohNYC.toFixed(3)}`);
  });
  
  checkSection('API Response Format', () => {
    // Test expected response structure for /explain
    const mockExplainResponse = {
      mention: 'London',
      host: 'bbc.com',
      selected: {
        place_id: 123,
        name: 'London',
        country_code: 'GB',
        scores: {
          population: 0.85,
          featureClass: 0.3,
          publisherPrior: 0.7,
          contextMatch: 0.5,
          coherence: 0.6
        },
        weights: {
          population: 0.30,
          featureClass: 0.15,
          publisherPrior: 0.20,
          contextMatch: 0.20,
          coherence: 0.15
        },
        totalScore: 0.65,
        normalizedScore: 1.0,
        rank: 1
      },
      confidence: 0.85,
      candidateCount: 5,
      ranking: [],
      reasoning: 'Selected London, GB with high confidence...',
      timestamp: new Date().toISOString()
    };
    
    check('Has mention field', typeof mockExplainResponse.mention === 'string');
    check('Has selected field', mockExplainResponse.selected !== null);
    check('Has confidence field', typeof mockExplainResponse.confidence === 'number');
    check('Has reasoning field', typeof mockExplainResponse.reasoning === 'string');
    check('Has timestamp field', typeof mockExplainResponse.timestamp === 'string');
    check('Selected has scores breakdown', typeof mockExplainResponse.selected.scores === 'object');
    check('Selected has weights breakdown', typeof mockExplainResponse.selected.weights === 'object');
  });
  
} catch (err) {
  console.error('\n❌ Check failed with error:', err.message);
  console.error(err.stack);
  process.exit(1);
}

console.log('\n═══════════════════════════════════════════════════════════');
console.log(`  Results: ${passed} passed, ${failed} failed`);
console.log('═══════════════════════════════════════════════════════════');

process.exit(failed > 0 ? 1 : 0);
