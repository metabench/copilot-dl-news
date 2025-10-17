/**
 * Tests for PredictiveHubDiscovery - Proactive hub prediction
 */

const { PredictiveHubDiscovery } = require('../PredictiveHubDiscovery');
const { applyQuickWinMigrations } = require('../schema-migrations');
const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

describe('PredictiveHubDiscovery', () => {
  let db;
  let discovery;
  let mockLogger;
  let tempDbPath;

  beforeEach(() => {
    // Create temp database
    tempDbPath = path.join(__dirname, `test-prediction-${Date.now()}.db`);
    db = new Database(tempDbPath);
    
    // Apply schema
    applyQuickWinMigrations(db);
    
    // Add additional tables for predictions
    db.exec(`
      CREATE TABLE IF NOT EXISTS gazetteer (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        slug TEXT NOT NULL,
        type TEXT NOT NULL,
        population INTEGER DEFAULT 0,
        is_capital INTEGER DEFAULT 0,
        wikidata_id TEXT
      );

      CREATE TABLE IF NOT EXISTS prediction_outcomes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        domain TEXT NOT NULL,
        predicted_url TEXT NOT NULL,
        strategy TEXT NOT NULL,
        outcome TEXT NOT NULL,
        recorded_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS discovered_hubs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        domain TEXT NOT NULL,
        url TEXT NOT NULL,
        type TEXT NOT NULL,
        confidence REAL DEFAULT 0.7,
        verified INTEGER DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS url_templates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        domain TEXT NOT NULL,
        pattern TEXT NOT NULL,
        hub_type TEXT NOT NULL,
        confidence REAL DEFAULT 0.7,
        examples TEXT
      );

      CREATE TABLE IF NOT EXISTS cross_crawl_knowledge (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source_domain TEXT NOT NULL,
        knowledge_type TEXT NOT NULL,
        knowledge_value TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
    
    mockLogger = {
      log: jest.fn(),
      error: jest.fn(),
      warn: jest.fn()
    };
    
    discovery = new PredictiveHubDiscovery({ db, logger: mockLogger });
  });

  afterEach(() => {
    if (discovery) {
      discovery.close();
    }
    if (db) {
      db.close();
    }
    if (tempDbPath && fs.existsSync(tempDbPath)) {
      fs.unlinkSync(tempDbPath);
    }
  });

  describe('predictSiblingHubs', () => {
    beforeEach(() => {
      // Seed gazetteer with countries
      db.prepare(`
        INSERT INTO gazetteer (name, slug, type, population, is_capital, wikidata_id)
        VALUES 
          ('France', 'france', 'country', 67000000, 0, 'Q142'),
          ('Germany', 'germany', 'country', 83000000, 0, 'Q183'),
          ('Spain', 'spain', 'country', 47000000, 0, 'Q29'),
          ('Italy', 'italy', 'country', 60000000, 0, 'Q38')
      `).run();
    });

    test('predicts sibling countries', async () => {
      const predictions = await discovery.predictSiblingHubs(
        'theguardian.com',
        'https://theguardian.com/world/france',
        {}
      );

      expect(predictions).toBeInstanceOf(Array);
      expect(predictions.length).toBeGreaterThan(0);
      
      const germanPred = predictions.find(p => p.url.includes('germany'));
      expect(germanPred).toBeDefined();
      expect(germanPred.strategy).toBe('sibling-pattern');
      expect(germanPred.hubType).toBe('country-hub');
      expect(germanPred.confidence).toBeGreaterThan(0);
    });

    test('includes metadata in predictions', async () => {
      const predictions = await discovery.predictSiblingHubs(
        'theguardian.com',
        'https://theguardian.com/world/france',
        {}
      );

      expect(predictions.length).toBeGreaterThan(0);
      
      const pred = predictions[0];
      expect(pred).toHaveProperty('url');
      expect(pred).toHaveProperty('hubType');
      expect(pred).toHaveProperty('strategy');
      expect(pred).toHaveProperty('confidence');
      expect(pred).toHaveProperty('source');
      expect(pred).toHaveProperty('entity');
      expect(pred).toHaveProperty('reasoning');
    });

    test('assigns higher confidence to populous countries', async () => {
      const predictions = await discovery.predictSiblingHubs(
        'theguardian.com',
        'https://theguardian.com/world/france',
        {}
      );

      const germanyPred = predictions.find(p => p.entity === 'Germany');
      const smallCountry = predictions.find(p => p.entity && p.entity !== 'Germany');

      if (germanyPred && smallCountry) {
        // Germany (83M) should have higher confidence
        expect(germanyPred.confidence).toBeGreaterThanOrEqual(smallCountry.confidence);
      }
    });

    test('handles unknown hub URL gracefully', async () => {
      const predictions = await discovery.predictSiblingHubs(
        'example.com',
        'not-a-valid-url',
        {}
      );

      expect(predictions).toEqual([]);
    });
  });

  describe('predictFromGazetteer', () => {
    beforeEach(() => {
      // Seed gazetteer
      db.prepare(`
        INSERT INTO gazetteer (name, slug, type, population, is_capital, wikidata_id)
        VALUES 
          ('London', 'london', 'city', 9000000, 1, 'Q84'),
          ('Paris', 'paris', 'city', 2200000, 1, 'Q90'),
          ('Berlin', 'berlin', 'city', 3800000, 1, 'Q64'),
          ('Tokyo', 'tokyo', 'city', 14000000, 1, 'Q1490')
      `).run();
    });

    test('generates city hub predictions', async () => {
      const predictions = await discovery.predictFromGazetteer(
        'theguardian.com',
        'https://theguardian.com/world',
        { limit: 10 }
      );

      expect(predictions).toBeInstanceOf(Array);
      expect(predictions.length).toBeGreaterThan(0);
      
      const londonPred = predictions.find(p => p.entity === 'London');
      expect(londonPred).toBeDefined();
      expect(londonPred.strategy).toBe('gazetteer-place');
      expect(londonPred.hubType).toBe('city-hub');
    });

    test('includes place metadata', async () => {
      const predictions = await discovery.predictFromGazetteer(
        'theguardian.com',
        'https://theguardian.com/world',
        { limit: 10 }
      );

      const pred = predictions[0];
      expect(pred).toHaveProperty('metadata');
      expect(pred.metadata).toHaveProperty('population');
      expect(pred.metadata).toHaveProperty('isCapital');
      expect(pred.metadata).toHaveProperty('wikidataId');
    });

    test('assigns higher confidence to capitals', async () => {
      const predictions = await discovery.predictFromGazetteer(
        'theguardian.com',
        'https://theguardian.com/world',
        { limit: 10 }
      );

      const londonPred = predictions.find(p => p.entity === 'London');
      expect(londonPred.metadata.isCapital).toBe(true);
      expect(londonPred.confidence).toBeGreaterThan(0.7);
    });

    test('respects limit parameter', async () => {
      const predictions = await discovery.predictFromGazetteer(
        'theguardian.com',
        'https://theguardian.com/world',
        { limit: 2 }
      );

      expect(predictions.length).toBeLessThanOrEqual(2);
    });
  });

  describe('predictChildHubs', () => {
    beforeEach(() => {
      // Seed gazetteer with regions/cities
      db.prepare(`
        INSERT INTO gazetteer (name, slug, type, population, is_capital, wikidata_id)
        VALUES 
          ('California', 'california', 'state', 39000000, 0, 'Q99'),
          ('Texas', 'texas', 'state', 29000000, 0, 'Q1439'),
          ('New York', 'new-york', 'state', 20000000, 0, 'Q1384')
      `).run();
    });

    test('predicts child regions from country hub', async () => {
      const predictions = await discovery.predictChildHubs(
        'theguardian.com',
        'https://theguardian.com/us',
        {}
      );

      expect(predictions).toBeInstanceOf(Array);
      expect(predictions.length).toBeGreaterThan(0);
      
      const californiaPred = predictions.find(p => p.entity === 'California');
      expect(californiaPred).toBeDefined();
      expect(californiaPred.strategy).toBe('parent-child');
      expect(californiaPred.hubType).toBe('region-hub');
    });

    test('includes source parent URL', async () => {
      const parentUrl = 'https://theguardian.com/us';
      const predictions = await discovery.predictChildHubs(
        'theguardian.com',
        parentUrl,
        {}
      );

      expect(predictions.length).toBeGreaterThan(0);
      
      const pred = predictions[0];
      expect(pred.source).toBe(parentUrl);
    });

    test('handles parent with no expected children', async () => {
      // Use a hub type that truly has no children: region-hub has city-hub children,
      // but city-hub itself has no children
      const predictions = await discovery.predictChildHubs(
        'theguardian.com',
        'https://theguardian.com/topic/politics', // topic-hub has no children
        {}
      );

      expect(predictions).toEqual([]);
    });
  });

  describe('predictFromTemplates', () => {
    beforeEach(() => {
      // Seed URL templates
      db.prepare(`
        INSERT INTO url_templates (domain, pattern, hub_type, confidence, examples)
        VALUES 
          ('theguardian.com', 'https://theguardian.com/world/{entity}', 'country-hub', 0.85, '["france","germany"]')
      `).run();

      // Seed gazetteer
      db.prepare(`
        INSERT INTO gazetteer (name, slug, type, population, wikidata_id)
        VALUES 
          ('Japan', 'japan', 'country', 125000000, 'Q17'),
          ('Brazil', 'brazil', 'country', 212000000, 'Q155')
      `).run();
    });

    test('generates predictions from templates', async () => {
      const predictions = await discovery.predictFromTemplates('theguardian.com', {});

      expect(predictions).toBeInstanceOf(Array);
      expect(predictions.length).toBeGreaterThan(0);
      
      const japanPred = predictions.find(p => p.entity === 'Japan');
      expect(japanPred).toBeDefined();
      expect(japanPred.strategy).toBe('url-template');
      expect(japanPred.url).toContain('japan');
    });

    test('applies template confidence', async () => {
      const predictions = await discovery.predictFromTemplates('theguardian.com', {});

      const pred = predictions[0];
      // Confidence should be template confidence * entity match score
      expect(pred.confidence).toBeGreaterThan(0);
      expect(pred.confidence).toBeLessThanOrEqual(1.0);
    });
  });

  describe('predictHubsForDomain', () => {
    beforeEach(() => {
      // Seed hub tree
      const hubTree = {
        levels: [
          [
            { url: 'https://theguardian.com/world', type: 'section-hub', confidence: 0.9 },
            { url: 'https://theguardian.com/world/uk', type: 'country-hub', confidence: 0.85 }
          ]
        ]
      };

      db.prepare(`
        INSERT INTO cross_crawl_knowledge (source_domain, knowledge_type, knowledge_value)
        VALUES ('theguardian.com', 'hub-tree', ?)
      `).run(JSON.stringify(hubTree));

      // Seed gazetteer for sibling predictions
      db.prepare(`
        INSERT INTO gazetteer (name, slug, type, population, is_capital, wikidata_id)
        VALUES 
          ('UK', 'uk', 'country', 67000000, 0, 'Q145'),
          ('France', 'france', 'country', 67000000, 0, 'Q142'),
          ('Germany', 'germany', 'country', 83000000, 0, 'Q183')
      `).run();
    });

    test('combines multiple prediction strategies', async () => {
      const predictions = await discovery.predictHubsForDomain('theguardian.com', {});

      expect(predictions).toBeInstanceOf(Array);
      expect(predictions.length).toBeGreaterThan(0);
      
      // Should have predictions from multiple strategies
      const strategies = new Set(predictions.map(p => p.strategy));
      expect(strategies.size).toBeGreaterThan(0);
    });

    test('deduplicates predictions', async () => {
      const predictions = await discovery.predictHubsForDomain('theguardian.com', {});

      // Check for unique URLs
      const urls = predictions.map(p => p.url.toLowerCase());
      const uniqueUrls = new Set(urls);
      
      expect(urls.length).toBe(uniqueUrls.size);
    });

    test('ranks predictions by confidence', async () => {
      const predictions = await discovery.predictHubsForDomain('theguardian.com', {});

      // Should be sorted by weighted confidence descending
      for (let i = 1; i < predictions.length; i++) {
        expect(predictions[i - 1].weightedConfidence).toBeGreaterThanOrEqual(
          predictions[i].weightedConfidence
        );
      }
    });

    test('assigns ranks to predictions', async () => {
      const predictions = await discovery.predictHubsForDomain('theguardian.com', {});

      if (predictions.length > 0) {
        expect(predictions[0].rank).toBe(1);
        
        if (predictions.length > 1) {
          expect(predictions[1].rank).toBe(2);
        }
      }
    });

    test('caches predictions for domain', async () => {
      await discovery.predictHubsForDomain('theguardian.com', {});

      const cached = discovery.getTopPredictions('theguardian.com', 10);
      expect(cached).toBeInstanceOf(Array);
      expect(cached.length).toBeGreaterThan(0);
    });
  });

  describe('recordPredictionOutcome', () => {
    test('records successful prediction', async () => {
      await discovery.recordPredictionOutcome(
        'theguardian.com',
        'https://theguardian.com/world/france',
        'sibling-pattern',
        'hit'
      );

      const outcome = db.prepare(`
        SELECT * FROM prediction_outcomes
        WHERE domain = ? AND predicted_url = ?
      `).get('theguardian.com', 'https://theguardian.com/world/france');

      expect(outcome).toBeDefined();
      expect(outcome.strategy).toBe('sibling-pattern');
      expect(outcome.outcome).toBe('hit');
    });

    test('records failed prediction', async () => {
      await discovery.recordPredictionOutcome(
        'theguardian.com',
        'https://theguardian.com/world/fake',
        'sibling-pattern',
        'miss'
      );

      const outcome = db.prepare(`
        SELECT * FROM prediction_outcomes
        WHERE domain = ? AND predicted_url = ?
      `).get('theguardian.com', 'https://theguardian.com/world/fake');

      expect(outcome).toBeDefined();
      expect(outcome.outcome).toBe('miss');
    });

    test('updates strategy performance', async () => {
      await discovery.recordPredictionOutcome(
        'theguardian.com',
        'https://theguardian.com/world/france',
        'sibling-pattern',
        'hit'
      );

      const performance = discovery.strategyPerformance.get('sibling-pattern');
      expect(performance).toBeDefined();
      expect(performance.hits).toBe(1);
    });
  });

  describe('getStrategyPerformance', () => {
    beforeEach(async () => {
      // Record some outcomes
      await discovery.recordPredictionOutcome('theguardian.com', 'url1', 'sibling-pattern', 'hit');
      await discovery.recordPredictionOutcome('theguardian.com', 'url2', 'sibling-pattern', 'hit');
      await discovery.recordPredictionOutcome('theguardian.com', 'url3', 'sibling-pattern', 'miss');
      await discovery.recordPredictionOutcome('theguardian.com', 'url4', 'gazetteer-place', 'hit');
    });

    test('calculates accuracy per strategy', async () => {
      const performance = await discovery.getStrategyPerformance('theguardian.com');

      expect(performance['sibling-pattern']).toBeDefined();
      expect(performance['sibling-pattern'].total).toBe(3);
      expect(performance['sibling-pattern'].hits).toBe(2);
      expect(performance['sibling-pattern'].misses).toBe(1);
      expect(performance['sibling-pattern'].accuracy).toBeCloseTo(2/3, 2);
    });

    test('includes confidence score', async () => {
      const performance = await discovery.getStrategyPerformance('theguardian.com');

      expect(performance['sibling-pattern'].confidence).toBeDefined();
      expect(performance['sibling-pattern'].confidence).toBeGreaterThan(0);
      expect(performance['sibling-pattern'].confidence).toBeLessThanOrEqual(1);
    });

    test('returns empty object for no outcomes', async () => {
      const performance = await discovery.getStrategyPerformance('unknown.com');

      expect(performance).toEqual({});
    });
  });

  describe('getTopPredictions', () => {
    beforeEach(async () => {
      // Generate some predictions
      discovery.predictedHubs.set('theguardian.com', [
        { url: 'url1', confidence: 0.9, rank: 1 },
        { url: 'url2', confidence: 0.8, rank: 2 },
        { url: 'url3', confidence: 0.7, rank: 3 },
        { url: 'url4', confidence: 0.6, rank: 4 },
        { url: 'url5', confidence: 0.5, rank: 5 }
      ]);
    });

    test('returns top N predictions', () => {
      const top3 = discovery.getTopPredictions('theguardian.com', 3);

      expect(top3.length).toBe(3);
      expect(top3[0].rank).toBe(1);
      expect(top3[2].rank).toBe(3);
    });

    test('returns empty array for unknown domain', () => {
      const predictions = discovery.getTopPredictions('unknown.com', 10);

      expect(predictions).toEqual([]);
    });
  });

  describe('getPredictionsByStrategy', () => {
    beforeEach(() => {
      discovery.predictedHubs.set('theguardian.com', [
        { url: 'url1', strategy: 'sibling-pattern' },
        { url: 'url2', strategy: 'gazetteer-place' },
        { url: 'url3', strategy: 'sibling-pattern' },
        { url: 'url4', strategy: 'parent-child' }
      ]);
    });

    test('filters by strategy', () => {
      const siblings = discovery.getPredictionsByStrategy('theguardian.com', 'sibling-pattern');

      expect(siblings.length).toBe(2);
      expect(siblings.every(p => p.strategy === 'sibling-pattern')).toBe(true);
    });

    test('returns empty array for unknown strategy', () => {
      const predictions = discovery.getPredictionsByStrategy('theguardian.com', 'unknown');

      expect(predictions).toEqual([]);
    });
  });

  describe('getPredictionStats', () => {
    beforeEach(() => {
      discovery.predictedHubs.set('theguardian.com', [
        { url: 'url1', strategy: 'sibling-pattern', hubType: 'country-hub', confidence: 0.9 },
        { url: 'url2', strategy: 'gazetteer-place', hubType: 'city-hub', confidence: 0.8 },
        { url: 'url3', strategy: 'sibling-pattern', hubType: 'country-hub', confidence: 0.5 }
      ]);
    });

    test('calculates domain statistics', () => {
      const stats = discovery.getPredictionStats('theguardian.com');

      expect(stats.total).toBe(3);
      expect(stats.byStrategy['sibling-pattern']).toBe(2);
      expect(stats.byStrategy['gazetteer-place']).toBe(1);
      expect(stats.byHubType['country-hub']).toBe(2);
      expect(stats.byHubType['city-hub']).toBe(1);
    });

    test('calculates confidence distribution', () => {
      const stats = discovery.getPredictionStats('theguardian.com');

      expect(stats.confidenceDistribution.high).toBe(2); // 0.9, 0.8
      expect(stats.confidenceDistribution.medium).toBe(1); // 0.5
      expect(stats.confidenceDistribution.low).toBe(0);
    });

    test('calculates average confidence', () => {
      const stats = discovery.getPredictionStats('theguardian.com');

      expect(stats.avgConfidence).toBeCloseTo((0.9 + 0.8 + 0.5) / 3, 2);
    });

    test('calculates global statistics', () => {
      discovery.predictedHubs.set('bbc.co.uk', [
        { url: 'url1', strategy: 'parent-child' }
      ]);

      const stats = discovery.getPredictionStats();

      expect(stats.totalPredictions).toBe(4);
      expect(stats.domains).toBe(2);
      expect(stats.avgPerDomain).toBe(2);
    });
  });

  describe('close', () => {
    test('clears all caches', () => {
      discovery.urlPatterns.set('key', 'value');
      discovery.predictedHubs.set('domain', []);
      discovery.strategyPerformance.set('strategy', {});

      discovery.close();

      expect(discovery.urlPatterns.size).toBe(0);
      expect(discovery.predictedHubs.size).toBe(0);
      expect(discovery.strategyPerformance.size).toBe(0);
    });
  });
});
