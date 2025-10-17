const { CrawlPlaybookService } = require('../CrawlPlaybookService');
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const os = require('os');

function createTempDb() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'playbook-test-'));
  const dbPath = path.join(tmpDir, 'test.db');
  const db = new Database(dbPath);
  
  // Create required schema
  db.exec(`
    CREATE TABLE IF NOT EXISTS cross_crawl_knowledge (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_domain TEXT NOT NULL,
      knowledge_type TEXT NOT NULL,
      knowledge_key TEXT NOT NULL,
      knowledge_value TEXT NOT NULL,
      confidence_level REAL NOT NULL,
      usage_count INTEGER DEFAULT 0,
      last_used TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE(source_domain, knowledge_type, knowledge_key)
    );
  `);
  
  return { db, dbPath, tmpDir };
}

function cleanupDb({ db, tmpDir }) {
  try {
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch (error) {
    // Ignore cleanup errors
  }
}

describe('CrawlPlaybookService', () => {
  let dbHandle, service;

  beforeEach(() => {
    dbHandle = createTempDb();
    
    const mockPlannerKnowledge = {
      learnFromHubDiscovery: jest.fn(),
      getLearnedPatterns: jest.fn().mockResolvedValue([]),
      generateCandidateHubs: jest.fn().mockResolvedValue([])
    };

    const mockProblemClustering = {
      processProblem: jest.fn().mockReturnValue({
        occurrenceCount: 1,
        priorityBoost: 0
      })
    };

    service = new CrawlPlaybookService({
      db: dbHandle.db,
      plannerKnowledgeService: mockPlannerKnowledge,
      problemClusteringService: mockProblemClustering,
      problemResolutionService: null,
      logger: { info: () => {}, error: () => {}, warn: () => {} }
    });
  });

  afterEach(() => {
    service.close();
    cleanupDb(dbHandle);
  });

  test('loads empty playbook for new domain', async () => {
    const playbook = await service.loadPlaybook('example.com');
    
    expect(playbook).toBeDefined();
    expect(playbook.domain).toBe('example.com');
    expect(playbook.hubTree).toBeDefined();
    expect(playbook.patterns).toEqual([]);
    expect(playbook.avoidanceRules).toEqual([]);
  });

  test('learns from hub discovery and updates hub tree', async () => {
    await service.learnFromDiscovery({
      domain: 'example.com',
      hubUrl: 'https://example.com/world/france',
      discoveryMethod: 'intelligent-seed',
      hubType: 'country-hub',
      placeChain: ['world'],
      metadata: { confidence: 0.85 }
    });

    // Load playbook to verify update
    const playbook = await service.loadPlaybook('example.com');
    
    expect(playbook.hubTree).toBeDefined();
    expect(playbook.hubTree.levels).toBeDefined();
    expect(playbook.hubTree.levels.length).toBeGreaterThan(0);
  });

  test('learns from problem and creates avoidance rule', async () => {
    await service.learnFromProblem({
      domain: 'example.com',
      problemKind: 'robots-blocked',
      url: 'https://example.com/admin/settings',
      scope: 'example.com',
      details: { message: 'Blocked by robots.txt' },
      shouldAvoid: true
    });

    const playbook = await service.loadPlaybook('example.com');
    
    expect(playbook.avoidanceRules.length).toBeGreaterThan(0);
    expect(playbook.avoidanceRules[0].kind).toBe('robots-blocked');
  });

  test('generates candidate actions from hub tree', async () => {
    // Seed the hub tree first
    await service.learnFromDiscovery({
      domain: 'example.com',
      hubUrl: 'https://example.com/world',
      discoveryMethod: 'sitemap',
      hubType: 'section-hub',
      placeChain: [],
      metadata: {}
    });

    await service.learnFromDiscovery({
      domain: 'example.com',
      hubUrl: 'https://example.com/world/france',
      discoveryMethod: 'intelligent-seed',
      hubType: 'country-hub',
      placeChain: ['world'],
      metadata: {}
    });

    // Generate actions
    const actions = await service.generateCandidateActions('example.com', {
      currentPlaceDepth: 0,
      maxActions: 10
    });

    expect(Array.isArray(actions)).toBe(true);
    expect(actions.length).toBeGreaterThan(0);
  });

  test('filters actions by avoidance rules', async () => {
    // Add avoidance rule
    await service.learnFromProblem({
      domain: 'example.com',
      problemKind: 'paywall',
      url: 'https://example.com/premium/article',
      scope: 'example.com',
      details: {},
      shouldAvoid: true
    });

    const shouldAvoid = await service.shouldAvoidUrl('example.com', 'https://example.com/premium/article');
    expect(shouldAvoid).toBe(true);

    const shouldNotAvoid = await service.shouldAvoidUrl('example.com', 'https://example.com/free/article');
    expect(shouldNotAvoid).toBe(false);
  });

  test('provides adaptive retry strategy', async () => {
    // Learn from multiple failures
    for (let i = 0; i < 6; i++) {
      await service.learnFromProblem({
        domain: 'example.com',
        problemKind: 'timeout',
        url: `https://example.com/slow/${i}`,
        scope: 'example.com',
        details: { jobId: 'test-job' },
        shouldAvoid: false
      });
    }

    const strategy = service.getRetryStrategy('example.com', 'https://example.com/slow/test', 'timeout');
    
    expect(strategy).toBeDefined();
    expect(strategy.maxAttempts).toBeGreaterThan(0);
    expect(Array.isArray(strategy.backoffMs)).toBe(true);
  });

  test('exports and imports playbook', async () => {
    // Create playbook with some data
    await service.learnFromDiscovery({
      domain: 'example.com',
      hubUrl: 'https://example.com/world',
      discoveryMethod: 'sitemap',
      hubType: 'section-hub',
      placeChain: [],
      metadata: {}
    });

    await service.learnFromProblem({
      domain: 'example.com',
      problemKind: 'robots-blocked',
      url: 'https://example.com/admin',
      scope: 'example.com',
      details: {},
      shouldAvoid: true
    });

    // Export
    const exported = await service.exportPlaybook('example.com');
    
    expect(exported).toBeDefined();
    expect(exported.domain).toBe('example.com');
    expect(exported.playbook).toBeDefined();

    // Import to a new domain
    const importData = {
      ...exported,
      domain: 'newsite.com'
    };
    
    const imported = await service.importPlaybook(importData);
    expect(imported).toBe(true);

    // Verify imported
    const newPlaybook = await service.loadPlaybook('newsite.com');
    expect(newPlaybook.domain).toBe('newsite.com');
  });

  test('caches playbook for performance', async () => {
    // First load
    const playbook1 = await service.loadPlaybook('example.com');
    
    // Second load should use cache
    const playbook2 = await service.loadPlaybook('example.com');
    
    expect(playbook1).toBe(playbook2); // Same object reference
  });

  test('invalidates cache after learning', async () => {
    // Load initial playbook
    const playbook1 = await service.loadPlaybook('example.com');
    
    // Learn something new
    await service.learnFromDiscovery({
      domain: 'example.com',
      hubUrl: 'https://example.com/world',
      discoveryMethod: 'sitemap',
      hubType: 'section-hub',
      placeChain: [],
      metadata: {}
    });
    
    // Load again - should be fresh
    const playbook2 = await service.loadPlaybook('example.com');
    
    expect(playbook1).not.toBe(playbook2); // Different object reference
  });
});
