const { UrlPatternLearningService } = require('../../services/UrlPatternLearningService');
const { RegionHubGapAnalyzer } = require('../../services/RegionHubGapAnalyzer');
const { CityHubGapAnalyzer } = require('../../services/CityHubGapAnalyzer');
const { getDb } = require('../../db');

async function check() {
    console.log('Checking Batch 9 components...');

    // Ensure DB is initialized
    const db = getDb();
    if (!db) {
        console.error('Failed to get DB instance');
        process.exit(1);
    }

    // 1. UrlPatternLearningService
    try {
        console.log('Checking UrlPatternLearningService...');
        const service = new UrlPatternLearningService();
        if (service.db && typeof service.db.prepare === 'function') {
            console.log('  ✅ UrlPatternLearningService initialized with default DB');
        } else {
            console.error('  ❌ UrlPatternLearningService missing DB');
            process.exit(1);
        }
    } catch (err) {
        console.error('  ❌ UrlPatternLearningService failed:', err);
        process.exit(1);
    }

    // 2. RegionHubGapAnalyzer
    try {
        console.log('Checking RegionHubGapAnalyzer...');
        const analyzer = new RegionHubGapAnalyzer();
        // Access db via property if exposed, or check functionality
        // HubGapAnalyzerBase usually assigns this.db = options.db
        if (analyzer.db && typeof analyzer.db.prepare === 'function') {
            console.log('  ✅ RegionHubGapAnalyzer initialized with default DB');
        } else {
            console.error('  ❌ RegionHubGapAnalyzer missing DB');
            process.exit(1);
        }
    } catch (err) {
        console.error('  ❌ RegionHubGapAnalyzer failed:', err);
        process.exit(1);
    }

    // 3. CityHubGapAnalyzer
    try {
        console.log('Checking CityHubGapAnalyzer...');
        const analyzer = new CityHubGapAnalyzer();
        if (analyzer.db && typeof analyzer.db.prepare === 'function') {
            console.log('  ✅ CityHubGapAnalyzer initialized with default DB');
        } else {
            console.error('  ❌ CityHubGapAnalyzer missing DB');
            process.exit(1);
        }
    } catch (err) {
        console.error('  ❌ CityHubGapAnalyzer failed:', err);
        process.exit(1);
    }

    console.log('Batch 9 verification complete.');
}

check();
