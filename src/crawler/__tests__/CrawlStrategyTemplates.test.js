/**
 * Tests for CrawlStrategyTemplates - Specialized strategies per use case
 */

const { CrawlStrategyTemplates } = require('../CrawlStrategyTemplates');
const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

describe('CrawlStrategyTemplates', () => {
  let db;
  let templates;
  let mockLogger;
  let tempDbPath;

  beforeEach(() => {
    // Create temp database
    tempDbPath = path.join(__dirname, `test-templates-${Date.now()}.db`);
    db = new Database(tempDbPath);
    
    // Create strategy_templates table
    db.exec(`
      CREATE TABLE IF NOT EXISTS strategy_templates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        description TEXT,
        use_case TEXT,
        template_config TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT
      );
    `);
    
    mockLogger = {
      log: jest.fn(),
      error: jest.fn(),
      warn: jest.fn()
    };
    
    templates = new CrawlStrategyTemplates({ db, logger: mockLogger });
  });

  afterEach(() => {
    if (templates) {
      templates.close();
    }
    if (db) {
      db.close();
    }
    if (tempDbPath && fs.existsSync(tempDbPath)) {
      fs.unlinkSync(tempDbPath);
    }
  });

  describe('Built-in Templates', () => {
    test('initializes with built-in templates', () => {
      const stats = templates.getStats();
      
      expect(stats.builtInTemplates).toBeGreaterThan(0);
      expect(stats.templateNames.builtIn).toContain('fast-breadth-scan');
      expect(stats.templateNames.builtIn).toContain('deep-quality-crawl');
      expect(stats.templateNames.builtIn).toContain('update-check');
      expect(stats.templateNames.builtIn).toContain('gap-filling');
    });

    test('fast-breadth-scan has correct configuration', () => {
      const template = templates.getTemplate('fast-breadth-scan');
      
      expect(template).toBeDefined();
      expect(template.name).toBe('fast-breadth-scan');
      expect(template.description).toContain('quickly');
      expect(template.config.maxDepth).toBeLessThanOrEqual(3);
      expect(template.config.maxConcurrency).toBeGreaterThan(5);
      expect(template.config.prioritizeHubDiscovery).toBe(true);
    });

    test('deep-quality-crawl has correct configuration', () => {
      const template = templates.getTemplate('deep-quality-crawl');
      
      expect(template).toBeDefined();
      expect(template.name).toBe('deep-quality-crawl');
      expect(template.description.toLowerCase()).toContain('thorough');
      expect(template.config.maxDepth).toBeGreaterThan(4);
      expect(template.config.extractContent).toBe(true);
      expect(template.config.maxConcurrency).toBeLessThan(5);
    });

    test('update-check has correct configuration', () => {
      const template = templates.getTemplate('update-check');
      
      expect(template).toBeDefined();
      expect(template.name).toBe('update-check');
      expect(template.description.toLowerCase()).toContain('revisit');
      expect(template.config.targetKnownHubs).toBe(true);
      expect(template.config.filters.onlyNewArticles).toBe(true);
    });

    test('gap-filling has correct configuration', () => {
      const template = templates.getTemplate('gap-filling');
      
      expect(template).toBeDefined();
      expect(template.name).toBe('gap-filling');
      expect(template.description).toContain('missing');
      expect(template.config.targetSparseAreas).toBe(true);
      expect(template.config.filters.targetLowCoverageHubs).toBe(true);
    });
  });

  describe('listTemplates', () => {
    test('lists all built-in templates', () => {
      const list = templates.listTemplates(false);
      
      expect(list.length).toBeGreaterThan(0);
      expect(list.every(t => t.type === 'built-in')).toBe(true);
      
      const names = list.map(t => t.name);
      expect(names).toContain('fast-breadth-scan');
      expect(names).toContain('deep-quality-crawl');
    });

    test('includes user templates when requested', async () => {
      await templates.createTemplate('my-strategy', {
        description: 'Custom strategy',
        maxDepth: 4,
        maxConcurrency: 6
      });

      const list = templates.listTemplates(true);
      
      const userTemplates = list.filter(t => t.type === 'user-defined');
      expect(userTemplates.length).toBe(1);
      expect(userTemplates[0].name).toBe('my-strategy');
    });
  });

  describe('createTemplate', () => {
    test('creates a custom template', async () => {
      const config = {
        description: 'My custom strategy',
        useCase: 'testing',
        maxDepth: 5,
        maxConcurrency: 7,
        timeout: 20000,
        extractContent: true
      };

      const template = await templates.createTemplate('custom-test', config);
      
      expect(template).toBeDefined();
      expect(template.name).toBe('custom-test');
      expect(template.description).toBe('My custom strategy');
      expect(template.type).toBe('user-defined');
      expect(template.config.maxDepth).toBe(5);
      expect(template.config.maxConcurrency).toBe(7);
    });

    test('validates template configuration', async () => {
      const invalidConfig = {
        maxDepth: 15, // Too high
        maxConcurrency: 5
      };

      await expect(
        templates.createTemplate('invalid', invalidConfig)
      ).rejects.toThrow('maxDepth must be between 1 and 10');
    });

    test('persists template to database', async () => {
      await templates.createTemplate('persisted', {
        description: 'Persisted strategy',
        maxDepth: 3
      });

      const row = db.prepare('SELECT * FROM strategy_templates WHERE name = ?')
        .get('persisted');
      
      expect(row).toBeDefined();
      expect(row.description).toBe('Persisted strategy');
      
      const config = JSON.parse(row.template_config);
      expect(config.maxDepth).toBe(3);
    });

    test('retrieves user template', async () => {
      await templates.createTemplate('retrieve-test', {
        description: 'Test retrieval',
        maxDepth: 4
      });

      const template = templates.getTemplate('retrieve-test');
      
      expect(template).toBeDefined();
      expect(template.name).toBe('retrieve-test');
      expect(template.config.maxDepth).toBe(4);
    });
  });

  describe('updateTemplate', () => {
    test('updates existing template', async () => {
      await templates.createTemplate('update-test', {
        description: 'Original',
        maxDepth: 3
      });

      const updated = await templates.updateTemplate('update-test', {
        description: 'Updated',
        config: { maxDepth: 5, maxConcurrency: 6 }
      });
      
      expect(updated.description).toBe('Updated');
      expect(updated.config.maxDepth).toBe(5);
    });

    test('throws error for non-existent template', async () => {
      await expect(
        templates.updateTemplate('non-existent', { description: 'Test' })
      ).rejects.toThrow('Template not found');
    });

    test('persists updates to database', async () => {
      await templates.createTemplate('persist-update', {
        description: 'Original',
        maxDepth: 3
      });

      await templates.updateTemplate('persist-update', {
        description: 'Updated'
      });

      const row = db.prepare('SELECT * FROM strategy_templates WHERE name = ?')
        .get('persist-update');
      
      expect(row.description).toBe('Updated');
    });
  });

  describe('deleteTemplate', () => {
    test('deletes user template', async () => {
      await templates.createTemplate('delete-test', {
        description: 'To be deleted',
        maxDepth: 3
      });

      await templates.deleteTemplate('delete-test');
      
      const template = templates.getTemplate('delete-test');
      expect(template).toBeNull();
    });

    test('cannot delete built-in template', async () => {
      await expect(
        templates.deleteTemplate('fast-breadth-scan')
      ).rejects.toThrow('Cannot delete built-in template');
    });

    test('throws error for non-existent template', async () => {
      await expect(
        templates.deleteTemplate('non-existent')
      ).rejects.toThrow('Template not found');
    });

    test('removes from database', async () => {
      await templates.createTemplate('db-delete', {
        description: 'Test',
        maxDepth: 3
      });

      await templates.deleteTemplate('db-delete');

      const row = db.prepare('SELECT * FROM strategy_templates WHERE name = ?')
        .get('db-delete');
      
      expect(row).toBeUndefined();
    });
  });

  describe('applyTemplate', () => {
    test('applies template to create configuration', () => {
      const applied = templates.applyTemplate('fast-breadth-scan');
      
      expect(applied).toBeDefined();
      expect(applied.templateName).toBe('fast-breadth-scan');
      expect(applied.config).toBeDefined();
      expect(applied.config.maxDepth).toBeDefined();
      expect(applied.appliedAt).toBeDefined();
    });

    test('applies context overrides', () => {
      const applied = templates.applyTemplate('fast-breadth-scan', {
        domain: 'example.com',
        maxDepth: 5,
        maxConcurrency: 15
      });
      
      expect(applied.config.domain).toBe('example.com');
      expect(applied.config.maxDepth).toBe(5);
      expect(applied.config.maxConcurrency).toBe(15);
    });

    test('merges additional context', () => {
      const applied = templates.applyTemplate('update-check', {
        customField: 'value',
        priority: 'high'
      });
      
      expect(applied.config.context.customField).toBe('value');
      expect(applied.config.context.priority).toBe('high');
    });

    test('throws error for non-existent template', () => {
      expect(() => {
        templates.applyTemplate('non-existent');
      }).toThrow('Template not found');
    });
  });

  describe('loadUserTemplates', () => {
    test('loads templates from database on init', async () => {
      // Create templates in DB directly
      db.prepare(`
        INSERT INTO strategy_templates (name, description, use_case, template_config)
        VALUES 
          ('loaded-1', 'First', 'test', '{"maxDepth":3}'),
          ('loaded-2', 'Second', 'test', '{"maxDepth":4}')
      `).run();

      // Create new instance to trigger load
      const newTemplates = new CrawlStrategyTemplates({ db, logger: mockLogger });
      await newTemplates.loadUserTemplates();

      const template1 = newTemplates.getTemplate('loaded-1');
      const template2 = newTemplates.getTemplate('loaded-2');
      
      expect(template1).toBeDefined();
      expect(template1.config.maxDepth).toBe(3);
      expect(template2).toBeDefined();
      expect(template2.config.maxDepth).toBe(4);

      newTemplates.close();
    });
  });

  describe('getStats', () => {
    test('returns correct statistics', async () => {
      await templates.createTemplate('user-1', { maxDepth: 3 });
      await templates.createTemplate('user-2', { maxDepth: 4 });

      const stats = templates.getStats();
      
      expect(stats.builtInTemplates).toBeGreaterThan(0);
      expect(stats.userTemplates).toBe(2);
      expect(stats.totalTemplates).toBe(stats.builtInTemplates + 2);
      expect(stats.templateNames.user).toContain('user-1');
      expect(stats.templateNames.user).toContain('user-2');
    });
  });

  describe('Template Use Cases', () => {
    test('fast-breadth-scan optimizes for discovery', () => {
      const template = templates.getTemplate('fast-breadth-scan');
      const applied = templates.applyTemplate('fast-breadth-scan', {
        domain: 'example.com'
      });
      
      // Fast: shallow depth, high concurrency
      expect(applied.config.maxDepth).toBeLessThanOrEqual(3);
      expect(applied.config.maxConcurrency).toBeGreaterThan(5);
      
      // Discovery-focused
      expect(applied.config.prioritizeHubDiscovery).toBe(true);
      expect(applied.config.extractContent).toBe(false);
      
      // Quick timeout
      expect(applied.config.timeout).toBeLessThan(10000);
    });

    test('deep-quality-crawl optimizes for thorough extraction', () => {
      const applied = templates.applyTemplate('deep-quality-crawl', {
        domain: 'example.com'
      });
      
      // Deep: high depth, low concurrency
      expect(applied.config.maxDepth).toBeGreaterThan(4);
      expect(applied.config.maxConcurrency).toBeLessThan(5);
      
      // Quality-focused
      expect(applied.config.extractContent).toBe(true);
      expect(applied.config.validateContent).toBe(true);
      
      // More retries
      expect(applied.config.retryStrategy.maxRetries).toBeGreaterThan(2);
    });

    test('update-check optimizes for new content detection', () => {
      const applied = templates.applyTemplate('update-check', {
        domain: 'example.com'
      });
      
      // Balanced depth, medium concurrency
      expect(applied.config.maxDepth).toBeGreaterThanOrEqual(2);
      expect(applied.config.maxDepth).toBeLessThanOrEqual(4);
      
      // Update-focused
      expect(applied.config.targetKnownHubs).toBe(true);
      expect(applied.config.filters.onlyNewArticles).toBe(true);
      expect(applied.config.filters.skipKnownUrls).toBe(true);
    });

    test('gap-filling optimizes for sparse area coverage', () => {
      const applied = templates.applyTemplate('gap-filling', {
        domain: 'example.com'
      });
      
      // Medium depth, balanced settings
      expect(applied.config.maxDepth).toBeGreaterThanOrEqual(3);
      expect(applied.config.maxDepth).toBeLessThanOrEqual(5);
      
      // Gap-filling focused
      expect(applied.config.targetSparseAreas).toBe(true);
      expect(applied.config.filters.targetLowCoverageHubs).toBe(true);
      expect(applied.config.filters.minGapSize).toBeGreaterThan(0);
    });
  });

  describe('close', () => {
    test('clears all caches', () => {
      templates.close();
      
      // Attempting to get template should fail (maps cleared)
      const stats = templates.getStats();
      expect(stats.builtInTemplates).toBe(0);
      expect(stats.userTemplates).toBe(0);
    });
  });
});
