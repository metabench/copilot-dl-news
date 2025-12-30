'use strict';

/**
 * DomainLearningPipeline Test Suite
 * 
 * Comprehensive tests for the domain learning system including
 * TemplateGenerator, TemplateTester, ReviewQueue, and the main pipeline.
 */

const {
  DomainLearningPipeline,
  TemplateGenerator,
  TemplateTester,
  ReviewQueue,
  ReviewStatus,
  DEFAULT_AUTO_APPROVE_THRESHOLD,
  MIN_SAMPLES
} = require('../../../src/crawler/learning');

// Create sample HTML pages for testing
const createSampleHtml = (opts = {}) => {
  const title = opts.title || 'Test Article Title';
  const content = opts.content || 'This is the article content. It contains multiple sentences with enough text to be considered valid content for extraction purposes.';
  const author = opts.author || 'John Smith';
  const date = opts.date || '2024-01-15';
  
  return `
<!DOCTYPE html>
<html>
<head>
  <meta property="og:title" content="${title}">
  <meta name="author" content="${author}">
  <title>${title} - Example Site</title>
</head>
<body>
  <article>
    <header>
      <h1 class="article-title">${title}</h1>
      <div class="byline">By <span class="author">${author}</span></div>
      <time datetime="${date}">${date}</time>
    </header>
    <div class="article-content">
      <p>${content}</p>
    </div>
  </article>
</body>
</html>
  `.trim();
};

const createMinimalHtml = () => `
<!DOCTYPE html>
<html>
<head><title>Minimal</title></head>
<body><p>Short</p></body>
</html>
`.trim();

const createBrokenHtml = () => `
<!DOCTYPE html>
<html>
<body>
  <div class="no-article">Random content without proper structure</div>
</body>
</html>
`.trim();

// Mock logger
const createMockLogger = () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
});

// Mock template adapter
const createMockTemplateAdapter = () => {
  const storage = new Map();
  return {
    save: jest.fn(async (domain, template) => {
      storage.set(domain, template);
    }),
    get: jest.fn(async (domain) => {
      return storage.get(domain) || null;
    }),
    clear: () => storage.clear()
  };
};

// ============================================================================
// TemplateGenerator Tests
// ============================================================================

describe('TemplateGenerator', () => {
  let generator;
  let logger;

  beforeEach(() => {
    logger = createMockLogger();
    generator = new TemplateGenerator({ logger });
  });

  describe('generate', () => {
    test('should generate template from single sample', () => {
      const samples = [{
        html: createSampleHtml({ title: 'Test Title' }),
        url: 'http://example.com/article1'
      }];

      const template = generator.generate(samples);

      expect(template).toBeDefined();
      expect(template.domain).toBe('example.com');
      expect(template.selectors).toBeDefined();
      expect(template.selectors.title).toBeInstanceOf(Array);
      expect(template.selectors.title.length).toBeGreaterThan(0);
      expect(template.confidence).toBeGreaterThan(0);
      expect(template.sampleCount).toBe(1);
    });

    test('should generate template from multiple samples', () => {
      const samples = [
        { html: createSampleHtml({ title: 'Article One' }), url: 'http://example.com/1' },
        { html: createSampleHtml({ title: 'Article Two' }), url: 'http://example.com/2' },
        { html: createSampleHtml({ title: 'Article Three' }), url: 'http://example.com/3' }
      ];

      const template = generator.generate(samples);

      expect(template.sampleCount).toBe(3);
      expect(template.confidence).toBeGreaterThan(0.5);
    });

    test('should throw error with no samples', () => {
      expect(() => generator.generate([])).toThrow('at least one sample');
    });

    test('should use provided domain option', () => {
      const samples = [{
        html: createSampleHtml(),
        url: 'http://example.com/article'
      }];

      const template = generator.generate(samples, { domain: 'custom.com' });

      expect(template.domain).toBe('custom.com');
    });

    test('should include field confidences in metadata', () => {
      const samples = [{
        html: createSampleHtml(),
        url: 'http://example.com/article'
      }];

      const template = generator.generate(samples);

      expect(template.metadata).toBeDefined();
      expect(template.metadata.fieldConfidences).toBeDefined();
      expect(template.metadata.fieldConfidences.title).toBeGreaterThanOrEqual(0);
      expect(template.metadata.fieldConfidences.content).toBeGreaterThanOrEqual(0);
    });
  });

  describe('findCommonSelectors', () => {
    test('should find selectors that work across samples', () => {
      const samples = [
        { html: createSampleHtml({ title: 'Title A' }), url: 'http://a.com/1' },
        { html: createSampleHtml({ title: 'Title B' }), url: 'http://a.com/2' }
      ];

      const parsedSamples = samples.map(s => {
        const { JSDOM } = require('jsdom');
        const dom = new JSDOM(s.html, { url: s.url });
        return { doc: dom.window.document, url: s.url, expected: {} };
      });

      const result = generator.findCommonSelectors(parsedSamples, 'title', ['h1', '.article-title']);

      expect(result.selectors).toContain('h1');
      expect(result.confidence).toBeGreaterThan(0);
    });

    test('should return empty selectors for non-matching candidates', () => {
      const samples = [{
        html: createSampleHtml(),
        url: 'http://example.com/1'
      }];

      const { JSDOM } = require('jsdom');
      const parsedSamples = samples.map(s => {
        const dom = new JSDOM(s.html, { url: s.url });
        return { doc: dom.window.document, url: s.url, expected: {} };
      });

      const result = generator.findCommonSelectors(parsedSamples, 'title', ['.nonexistent-class']);

      expect(result.selectors).toHaveLength(0);
      expect(result.confidence).toBe(0);
    });
  });

  describe('scoreTemplate', () => {
    test('should score template against samples with expected values', () => {
      const samples = [{
        html: createSampleHtml({ title: 'Expected Title', content: 'Expected content here' }),
        url: 'http://example.com/1',
        expected: { title: 'Expected Title' }
      }];

      const template = generator.generate(samples);
      const score = generator.scoreTemplate(template, samples);

      expect(score).toBeGreaterThan(0.5);
    });

    test('should return 0 for empty template', () => {
      const score = generator.scoreTemplate(null, [{ html: createSampleHtml() }]);
      expect(score).toBe(0);
    });

    test('should return 0 for empty samples', () => {
      const template = { selectors: { title: ['h1'] } };
      const score = generator.scoreTemplate(template, []);
      expect(score).toBe(0);
    });
  });
});

// ============================================================================
// TemplateTester Tests
// ============================================================================

describe('TemplateTester', () => {
  let tester;
  let logger;

  beforeEach(() => {
    logger = createMockLogger();
    tester = new TemplateTester({ logger });
  });

  describe('test', () => {
    test('should test template against samples', () => {
      const template = {
        selectors: {
          title: ['h1', '.article-title'],
          content: ['.article-content'],
          date: ['time[datetime]'],
          author: ['.author']
        }
      };

      const samples = [{
        html: createSampleHtml({ title: 'Test Title' }),
        url: 'http://example.com/1',
        expected: { title: 'Test Title' }
      }];

      const result = tester.test(template, samples);

      expect(result.accuracy).toBeGreaterThan(0);
      expect(result.sampleCount).toBe(1);
      expect(result.fieldResults).toBeDefined();
    });

    test('should return error for invalid template', () => {
      const result = tester.test(null, [{ html: createSampleHtml() }]);

      expect(result.accuracy).toBe(0);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].type).toBe('invalid_template');
    });

    test('should return error for no samples', () => {
      const result = tester.test({ selectors: {} }, []);

      expect(result.accuracy).toBe(0);
      expect(result.errors[0].type).toBe('no_samples');
    });

    test('should track pass and fail counts', () => {
      const template = {
        selectors: {
          title: ['h1'],
          content: ['.article-content']
        }
      };

      const samples = [
        { html: createSampleHtml(), url: 'http://example.com/1' },
        { html: createMinimalHtml(), url: 'http://example.com/2' }
      ];

      const result = tester.test(template, samples);

      expect(result.sampleCount).toBe(2);
      expect(result.passCount + result.failCount).toBe(2);
    });
  });

  describe('testSingle', () => {
    test('should extract fields from HTML', () => {
      const template = {
        selectors: {
          title: ['.article-title'],
          content: ['.article-content'],
          date: ['time[datetime]'],
          author: ['.author']
        }
      };

      const result = tester.testSingle(template, createSampleHtml({ title: 'My Title' }));

      expect(result.extracted.title).toBe('My Title');
      expect(result.extracted.content).toBeDefined();
      expect(result.extracted.date).toBe('2024-01-15');
      expect(result.extracted.author).toBe('John Smith');
    });

    test('should fail for missing title and content', () => {
      const template = {
        selectors: {
          title: ['.nonexistent'],
          content: ['.also-nonexistent']
        }
      };

      const result = tester.testSingle(template, createBrokenHtml());

      expect(result.success).toBe(false);
      expect(result.errors.extraction).toBeDefined();
    });

    test('should compare with expected values', () => {
      const template = {
        selectors: { title: ['h1'] }
      };

      const result = tester.testSingle(
        template,
        createSampleHtml({ title: 'Expected Title' }),
        { expected: { title: 'Expected Title' } }
      );

      expect(result.fieldMatches.title).toBe(true);
    });

    test('should handle meta tag selectors', () => {
      const template = {
        selectors: {
          title: ['meta[property="og:title"]'],
          author: ['meta[name="author"]']
        }
      };

      const result = tester.testSingle(
        template,
        createSampleHtml({ title: 'OG Title', author: 'Meta Author' })
      );

      expect(result.extracted.title).toBe('OG Title');
      expect(result.extracted.author).toBe('Meta Author');
    });

    test('should handle invalid HTML gracefully', () => {
      const template = { selectors: { title: ['h1'] } };
      
      const result = tester.testSingle(template, null);

      expect(result.success).toBe(false);
      expect(result.errors.html).toBeDefined();
    });
  });
});

// ============================================================================
// ReviewQueue Tests
// ============================================================================

describe('ReviewQueue', () => {
  let queue;
  let logger;

  beforeEach(() => {
    logger = createMockLogger();
    queue = new ReviewQueue({ logger });
  });

  describe('add', () => {
    test('should add item to queue', () => {
      const template = { selectors: { title: ['h1'] } };
      const item = queue.add('example.com', template, 0.85);

      expect(item.id).toBeDefined();
      expect(item.domain).toBe('example.com');
      expect(item.template).toEqual(template);
      expect(item.accuracyScore).toBe(0.85);
      expect(item.status).toBe(ReviewStatus.PENDING);
    });

    test('should throw error without domain', () => {
      expect(() => queue.add(null, {}, 0.5)).toThrow('requires domain');
    });

    test('should throw error without template', () => {
      expect(() => queue.add('example.com', null, 0.5)).toThrow('requires template');
    });

    test('should throw error with invalid accuracy', () => {
      expect(() => queue.add('example.com', {}, 1.5)).toThrow('accuracy between 0 and 1');
      expect(() => queue.add('example.com', {}, -0.1)).toThrow('accuracy between 0 and 1');
    });
  });

  describe('getPending', () => {
    test('should return pending items', () => {
      queue.add('a.com', {}, 0.8);
      queue.add('b.com', {}, 0.7);
      queue.add('c.com', {}, 0.6);

      const pending = queue.getPending(10);

      expect(pending.length).toBe(3);
      expect(pending.every(i => i.status === ReviewStatus.PENDING)).toBe(true);
    });

    test('should respect limit', () => {
      queue.add('a.com', {}, 0.8);
      queue.add('b.com', {}, 0.7);
      queue.add('c.com', {}, 0.6);

      const pending = queue.getPending(2);

      expect(pending.length).toBe(2);
    });
  });

  describe('approve', () => {
    test('should approve pending item', () => {
      const item = queue.add('example.com', {}, 0.85);
      
      const approved = queue.approve(item.id, { reviewedBy: 'tester' });

      expect(approved.status).toBe(ReviewStatus.APPROVED);
      expect(approved.reviewedBy).toBe('tester');
      expect(approved.reviewedAt).toBeDefined();
    });

    test('should throw error for non-existent item', () => {
      expect(() => queue.approve(999)).toThrow('not found');
    });

    test('should throw error for already approved item', () => {
      const item = queue.add('example.com', {}, 0.85);
      queue.approve(item.id);

      expect(() => queue.approve(item.id)).toThrow('not pending');
    });
  });

  describe('reject', () => {
    test('should reject pending item with reason', () => {
      const item = queue.add('example.com', {}, 0.85);
      
      const rejected = queue.reject(item.id, 'Poor accuracy', { reviewedBy: 'tester' });

      expect(rejected.status).toBe(ReviewStatus.REJECTED);
      expect(rejected.rejectionReason).toBe('Poor accuracy');
      expect(rejected.reviewedBy).toBe('tester');
    });

    test('should throw error without reason', () => {
      const item = queue.add('example.com', {}, 0.85);
      
      expect(() => queue.reject(item.id, '')).toThrow('requires a reason');
    });
  });

  describe('getStats', () => {
    test('should return queue statistics', () => {
      queue.add('a.com', {}, 0.8);
      queue.add('b.com', {}, 0.7);
      const item = queue.add('c.com', {}, 0.6);
      queue.approve(item.id);

      const stats = queue.getStats();

      expect(stats.total).toBe(3);
      expect(stats.pending).toBe(2);
      expect(stats.approved).toBe(1);
      expect(stats.rejected).toBe(0);
    });
  });

  describe('getByDomain', () => {
    test('should filter by domain', () => {
      queue.add('a.com', {}, 0.8);
      queue.add('b.com', {}, 0.7);
      queue.add('a.com', {}, 0.9);

      const items = queue.getByDomain('a.com');

      expect(items.length).toBe(2);
      expect(items.every(i => i.domain === 'a.com')).toBe(true);
    });

    test('should filter by domain and status', () => {
      queue.add('a.com', {}, 0.8);
      const item = queue.add('a.com', {}, 0.9);
      queue.approve(item.id);

      const approved = queue.getByDomain('a.com', { status: ReviewStatus.APPROVED });

      expect(approved.length).toBe(1);
      expect(approved[0].status).toBe(ReviewStatus.APPROVED);
    });
  });

  describe('getApprovedTemplate', () => {
    test('should return most recent approved template', () => {
      const template = { selectors: { title: ['h1'] } };
      const item = queue.add('example.com', template, 0.9);
      queue.approve(item.id);

      const result = queue.getApprovedTemplate('example.com');

      expect(result).toEqual(template);
    });

    test('should return null if no approved template', () => {
      queue.add('example.com', {}, 0.5);

      const result = queue.getApprovedTemplate('example.com');

      expect(result).toBeNull();
    });
  });
});

// ============================================================================
// DomainLearningPipeline Tests
// ============================================================================

describe('DomainLearningPipeline', () => {
  let pipeline;
  let logger;
  let templateAdapter;

  beforeEach(() => {
    logger = createMockLogger();
    templateAdapter = createMockTemplateAdapter();
    pipeline = new DomainLearningPipeline({
      logger,
      templateAdapter,
      autoApproveThreshold: 0.9
    });
  });

  afterEach(() => {
    pipeline.clear();
    templateAdapter.clear();
  });

  describe('learnDomain', () => {
    test('should auto-approve high accuracy templates', async () => {
      // Lower threshold to ensure auto-approval
      pipeline.setAutoApproveThreshold(0.5);
      
      const samples = [
        { html: createSampleHtml({ title: 'Article A' }), url: 'http://example.com/1' },
        { html: createSampleHtml({ title: 'Article B' }), url: 'http://example.com/2' }
      ];

      const result = await pipeline.learnDomain('example.com', { samples });

      expect(result.success).toBe(true);
      expect(result.autoApproved).toBe(true);
      expect(result.status).toBe('approved');
      expect(result.template).toBeDefined();
    });

    test('should queue low accuracy templates for review', async () => {
      // Use minimal HTML that won't extract well
      const samples = [
        { html: createMinimalHtml(), url: 'http://example.com/1' }
      ];

      pipeline.setAutoApproveThreshold(0.99); // Very high threshold
      const result = await pipeline.learnDomain('example.com', { samples });

      expect(result.success).toBe(true);
      expect(result.autoApproved).toBe(false);
      expect(result.status).toBe('queued');
      expect(result.queueId).toBeDefined();
    });

    test('should fail without samples', async () => {
      const result = await pipeline.learnDomain('example.com', { samples: [] });

      expect(result.success).toBe(false);
      expect(result.status).toBe('failed');
      expect(result.errors.samples).toBeDefined();
    });

    test('should fail without domain', async () => {
      await expect(pipeline.learnDomain(null, {})).rejects.toThrow('requires domain');
    });

    test('should emit events during learning', async () => {
      const events = [];
      pipeline.on('learning:start', (e) => events.push({ type: 'start', ...e }));
      pipeline.on('learning:generated', (e) => events.push({ type: 'generated', ...e }));
      pipeline.on('learning:complete', (e) => events.push({ type: 'complete', ...e }));

      const samples = [{ html: createSampleHtml(), url: 'http://example.com/1' }];
      await pipeline.learnDomain('example.com', { samples });

      expect(events.find(e => e.type === 'start')).toBeDefined();
      expect(events.find(e => e.type === 'generated')).toBeDefined();
      expect(events.find(e => e.type === 'complete')).toBeDefined();
    });

    test('should store approved templates via adapter', async () => {
      // Lower threshold to ensure auto-approval
      pipeline.setAutoApproveThreshold(0.5);
      
      const samples = [{ html: createSampleHtml(), url: 'http://example.com/1' }];

      await pipeline.learnDomain('example.com', { samples });

      expect(templateAdapter.save).toHaveBeenCalled();
    });

    test('should force queue even with high accuracy', async () => {
      const samples = [{ html: createSampleHtml(), url: 'http://example.com/1' }];

      const result = await pipeline.learnDomain('example.com', {
        samples,
        forceQueue: true
      });

      expect(result.autoApproved).toBe(false);
      expect(result.status).toBe('queued');
    });
  });

  describe('approveTemplate', () => {
    test('should approve queued template', async () => {
      const samples = [{ html: createMinimalHtml(), url: 'http://example.com/1' }];
      pipeline.setAutoApproveThreshold(0.99);
      
      const learning = await pipeline.learnDomain('example.com', { samples });
      const approved = await pipeline.approveTemplate(learning.queueId);

      expect(approved.status).toBe(ReviewStatus.APPROVED);
    });

    test('should store template after approval', async () => {
      const samples = [{ html: createMinimalHtml(), url: 'http://example.com/1' }];
      pipeline.setAutoApproveThreshold(0.99);
      
      const learning = await pipeline.learnDomain('example.com', { samples });
      templateAdapter.save.mockClear();
      
      await pipeline.approveTemplate(learning.queueId);

      expect(templateAdapter.save).toHaveBeenCalled();
    });

    test('should emit template:approved event', async () => {
      const listener = jest.fn();
      pipeline.on('template:approved', listener);

      const samples = [{ html: createMinimalHtml(), url: 'http://example.com/1' }];
      pipeline.setAutoApproveThreshold(0.99);
      
      const learning = await pipeline.learnDomain('example.com', { samples });
      await pipeline.approveTemplate(learning.queueId);

      expect(listener).toHaveBeenCalled();
    });
  });

  describe('rejectTemplate', () => {
    test('should reject queued template with reason', async () => {
      const samples = [{ html: createMinimalHtml(), url: 'http://example.com/1' }];
      pipeline.setAutoApproveThreshold(0.99);
      
      const learning = await pipeline.learnDomain('example.com', { samples });
      const rejected = pipeline.rejectTemplate(learning.queueId, 'Not accurate enough');

      expect(rejected.status).toBe(ReviewStatus.REJECTED);
      expect(rejected.rejectionReason).toBe('Not accurate enough');
    });

    test('should emit template:rejected event', () => {
      const listener = jest.fn();
      pipeline.on('template:rejected', listener);

      const item = pipeline.reviewQueue.add('example.com', {}, 0.5);
      pipeline.rejectTemplate(item.id, 'Bad template');

      expect(listener).toHaveBeenCalled();
    });
  });

  describe('getReviewQueue', () => {
    test('should return pending reviews', async () => {
      const samples = [{ html: createMinimalHtml(), url: 'http://a.com/1' }];
      pipeline.setAutoApproveThreshold(0.99);
      
      await pipeline.learnDomain('a.com', { samples });
      await pipeline.learnDomain('b.com', { samples });

      const pending = pipeline.getReviewQueue(10);

      expect(pending.length).toBe(2);
    });
  });

  describe('getTemplate', () => {
    test('should return template from adapter', async () => {
      const template = { selectors: { title: ['h1'] } };
      await templateAdapter.save('example.com', template);

      const result = await pipeline.getTemplate('example.com');

      expect(result).toEqual(template);
    });

    test('should fall back to approved queue items', async () => {
      const localPipeline = new DomainLearningPipeline({ logger }); // No adapter
      const item = localPipeline.reviewQueue.add('example.com', { test: true }, 0.9);
      localPipeline.reviewQueue.approve(item.id);

      const result = await localPipeline.getTemplate('example.com');

      expect(result).toEqual({ test: true });
    });
  });

  describe('hasTemplate', () => {
    test('should return true when template exists', async () => {
      await templateAdapter.save('example.com', {});

      const has = await pipeline.hasTemplate('example.com');

      expect(has).toBe(true);
    });

    test('should return false when no template', async () => {
      const has = await pipeline.hasTemplate('nonexistent.com');

      expect(has).toBe(false);
    });
  });

  describe('relearnDomain', () => {
    test('should queue template for review', async () => {
      const samples = [{ html: createSampleHtml(), url: 'http://example.com/1' }];

      const result = await pipeline.relearnDomain('example.com', { samples });

      expect(result.autoApproved).toBe(false);
      expect(result.status).toBe('queued');
    });
  });

  describe('getStats', () => {
    test('should return pipeline statistics', async () => {
      // Lower threshold to ensure auto-approval
      pipeline.setAutoApproveThreshold(0.5);
      
      const samples = [{ html: createSampleHtml(), url: 'http://example.com/1' }];
      await pipeline.learnDomain('example.com', { samples });

      const stats = pipeline.getStats();

      expect(stats.domainsLearned).toBe(1);
      expect(stats.autoApproved).toBe(1);
      expect(stats.queue).toBeDefined();
    });

    test('should calculate auto-approval rate', async () => {
      const goodSamples = [{ html: createSampleHtml(), url: 'http://a.com/1' }];
      const badSamples = [{ html: createMinimalHtml(), url: 'http://b.com/1' }];
      
      pipeline.setAutoApproveThreshold(0.5);
      await pipeline.learnDomain('a.com', { samples: goodSamples });
      
      pipeline.setAutoApproveThreshold(0.99);
      await pipeline.learnDomain('b.com', { samples: badSamples });

      const stats = pipeline.getStats();

      expect(stats.domainsLearned).toBe(2);
      expect(stats.autoApprovalRate).toBe(0.5);
    });
  });

  describe('setAutoApproveThreshold', () => {
    test('should update threshold', () => {
      pipeline.setAutoApproveThreshold(0.8);

      expect(pipeline.autoApproveThreshold).toBe(0.8);
    });

    test('should reject invalid threshold', () => {
      expect(() => pipeline.setAutoApproveThreshold(1.5)).toThrow('between 0 and 1');
      expect(() => pipeline.setAutoApproveThreshold(-0.1)).toThrow('between 0 and 1');
    });
  });

  describe('constants', () => {
    test('should export default threshold', () => {
      expect(DEFAULT_AUTO_APPROVE_THRESHOLD).toBe(0.9);
    });

    test('should export minimum samples', () => {
      expect(MIN_SAMPLES).toBe(1);
    });
  });
});

// ============================================================================
// Integration Tests
// ============================================================================

describe('Integration', () => {
  test('should complete full learning workflow', async () => {
    const logger = createMockLogger();
    const templateAdapter = createMockTemplateAdapter();
    
    const pipeline = new DomainLearningPipeline({
      logger,
      templateAdapter,
      autoApproveThreshold: 0.7
    });

    // Step 1: Learn with good samples
    const samples = [
      {
        html: createSampleHtml({ title: 'News Article One', content: 'Full article content here with enough text.' }),
        url: 'http://news.example.com/article1',
        expected: { title: 'News Article One' }
      },
      {
        html: createSampleHtml({ title: 'News Article Two', content: 'Another article with sufficient content.' }),
        url: 'http://news.example.com/article2'
      }
    ];

    const learnResult = await pipeline.learnDomain('news.example.com', { samples });
    
    expect(learnResult.success).toBe(true);
    expect(learnResult.accuracy).toBeGreaterThan(0.5);

    // Step 2: Verify template exists
    const hasTemplate = await pipeline.hasTemplate('news.example.com');
    expect(hasTemplate).toBe(true);

    // Step 3: Check stats
    const stats = pipeline.getStats();
    expect(stats.domainsLearned).toBe(1);
  });

  test('should handle review workflow', async () => {
    const logger = createMockLogger();
    const pipeline = new DomainLearningPipeline({
      logger,
      autoApproveThreshold: 0.99 // Very high to force queue
    });

    // Learn with samples
    const samples = [{ html: createSampleHtml(), url: 'http://example.com/1' }];
    const result = await pipeline.learnDomain('example.com', { samples });

    expect(result.status).toBe('queued');
    expect(result.queueId).toBeDefined();

    // Get pending reviews
    const pending = pipeline.getReviewQueue();
    expect(pending.length).toBe(1);

    // Approve the template
    const approved = await pipeline.approveTemplate(result.queueId, { reviewedBy: 'admin' });
    expect(approved.status).toBe('approved');

    // Verify it's approved
    const template = await pipeline.getTemplate('example.com');
    expect(template).toBeDefined();
  });
});
