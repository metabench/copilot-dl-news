'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const Database = require('better-sqlite3');
const { CountryHubGapAnalyzer } = require('../CountryHubGapAnalyzer');
const { RegionHubGapAnalyzer } = require('../RegionHubGapAnalyzer');
const { CityHubGapAnalyzer } = require('../CityHubGapAnalyzer');

function createSilentLogger() {
  return {
    log: () => {},
    warn: () => {},
    error: () => {}
  };
}

describe('HubGapAnalyzer DSPL integration', () => {
  let tempDir;
  let db;
  const logger = createSilentLogger();

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dspl-test-'));
    const dsplPayload = {
      'theguardian.com': {
        domain: 'theguardian.com',
        generated: new Date().toISOString(),
        countryHubPatterns: [
          { pattern: '/{slug}/culture', confidence: 1, verified: true, examples: 5 },
          { pattern: '/world/{slug}', confidence: 1, verified: false, examples: 10 }
        ],
        regionHubPatterns: [
          { pattern: '/regional/{regionSlug}', confidence: 1, verified: true, examples: 4 }
        ],
        cityHubPatterns: [
          { pattern: '/spotlight/{countryCode}/{citySlug}', confidence: 1, verified: true, examples: 3 },
          { pattern: '/events/{citySlug}', confidence: 1, verified: false, examples: 7 }
        ],
        stats: {
          totalPatterns: 1,
          verifiedPatterns: 1,
          totalExamples: 5
        }
      }
    };
    fs.writeFileSync(path.join(tempDir, 'guardian.json'), JSON.stringify(dsplPayload, null, 2), 'utf8');
    db = new Database(':memory:');
  });

  afterEach(() => {
    if (db) {
      db.close();
    }
    if (tempDir) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('country analyzer prioritises verified DSPL patterns', () => {
    const analyzer = new CountryHubGapAnalyzer({ db, dsplDir: tempDir, logger });
    const urls = analyzer.predictCountryHubUrls('www.theguardian.com', 'Brazil', 'BR');

    expect(urls).toContain('https://www.theguardian.com/brazil/culture');
    expect(urls).not.toContain('https://www.theguardian.com/world/brazil');
  });

  test('region analyzer surfaces DSPL-backed URLs', () => {
    const analyzer = new RegionHubGapAnalyzer({ db, dsplDir: tempDir, logger });
    const urls = analyzer.predictRegionHubUrls('www.theguardian.com', {
      name: 'Bavaria',
      code: 'DE-BY',
      countryCode: 'DE'
    });

    expect(urls).toContain('https://www.theguardian.com/regional/bavaria');
  });

  test('city analyzer honours DSPL patterns and filters unverified entries', () => {
    const analyzer = new CityHubGapAnalyzer({ db, dsplDir: tempDir, logger });
    const urls = analyzer.predictCityHubUrls('www.theguardian.com', {
      name: 'Munich',
      countryCode: 'DE'
    });

  expect(urls).toContain('https://www.theguardian.com/spotlight/de/munich');
  expect(urls).not.toContain('https://www.theguardian.com/events/munich');
  });
});
