'use strict';

const {
  DEFAULT_OUTPUT_VERBOSITY,
  DEFAULT_FEATURE_FLAGS,
  TEN_MINUTES_MS,
  crawlerOptionsSchema,
  normalizeOutputVerbosity,
  normalizeHost,
  normalizeOptions,
  flattenLoggingConfig,
  resolvePriorityProfileFromCrawlType,
  buildGazetteerStageFilter,
  createCrawlerConfig,
  isGazetteerMode,
  isIntelligentMode,
  isBasicMode
} = require('../../../src/crawler/config');

describe('CrawlerConfigNormalizer', () => {
  describe('normalizeOutputVerbosity', () => {
    it('returns normal for standard input', () => {
      expect(normalizeOutputVerbosity('normal')).toBe('normal');
    });

    it('normalizes quiet aliases', () => {
      expect(normalizeOutputVerbosity('quiet')).toBe('quiet');
      expect(normalizeOutputVerbosity('silent')).toBe('quiet');
      expect(normalizeOutputVerbosity('q')).toBe('quiet');
    });

    it('normalizes verbose aliases', () => {
      expect(normalizeOutputVerbosity('verbose')).toBe('verbose');
      expect(normalizeOutputVerbosity('v')).toBe('verbose');
      expect(normalizeOutputVerbosity('debug')).toBe('verbose');
    });

    it('returns default for non-string input', () => {
      expect(normalizeOutputVerbosity(null)).toBe(DEFAULT_OUTPUT_VERBOSITY);
      expect(normalizeOutputVerbosity(undefined)).toBe(DEFAULT_OUTPUT_VERBOSITY);
      expect(normalizeOutputVerbosity(123)).toBe(DEFAULT_OUTPUT_VERBOSITY);
    });
  });

  describe('normalizeHost', () => {
    it('strips www. prefix', () => {
      expect(normalizeHost('www.example.com')).toBe('example.com');
    });

    it('lowercases the hostname', () => {
      expect(normalizeHost('Example.COM')).toBe('example.com');
    });

    it('handles mixed case with www', () => {
      expect(normalizeHost('WWW.Example.COM')).toBe('example.com');
    });

    it('returns empty string for non-string input', () => {
      expect(normalizeHost(null)).toBe('');
      expect(normalizeHost(undefined)).toBe('');
      expect(normalizeHost(123)).toBe('');
    });
  });

  describe('resolvePriorityProfileFromCrawlType', () => {
    it('returns basic for basic crawl types', () => {
      expect(resolvePriorityProfileFromCrawlType('basic')).toBe('basic');
      expect(resolvePriorityProfileFromCrawlType('normal')).toBe('basic');
      expect(resolvePriorityProfileFromCrawlType('standard')).toBe('basic');
    });

    it('returns intelligent for intelligent crawl types', () => {
      expect(resolvePriorityProfileFromCrawlType('intelligent')).toBe('intelligent');
      expect(resolvePriorityProfileFromCrawlType('intelligent-deep')).toBe('intelligent');
    });

    it('returns geography for gazetteer crawl types', () => {
      expect(resolvePriorityProfileFromCrawlType('gazetteer')).toBe('geography');
      expect(resolvePriorityProfileFromCrawlType('geography')).toBe('geography');
      expect(resolvePriorityProfileFromCrawlType('geo')).toBe('geography');
    });

    it('returns basic for non-string input', () => {
      expect(resolvePriorityProfileFromCrawlType(null)).toBe('basic');
      expect(resolvePriorityProfileFromCrawlType(undefined)).toBe('basic');
    });
  });

  describe('flattenLoggingConfig', () => {
    it('flattens nested logging config', () => {
      const result = flattenLoggingConfig({
        logging: { queue: true, network: false, fetching: true }
      });
      expect(result.loggingQueue).toBe(true);
      expect(result.loggingNetwork).toBe(false);
      expect(result.loggingFetching).toBe(true);
    });

    it('does not override existing flat config', () => {
      const result = flattenLoggingConfig({
        loggingQueue: false,
        logging: { queue: true }
      });
      expect(result.loggingQueue).toBe(false);
    });

    it('returns input for non-object', () => {
      expect(flattenLoggingConfig(null)).toBe(null);
      expect(flattenLoggingConfig(undefined)).toBe(undefined);
    });
  });

  describe('buildGazetteerStageFilter', () => {
    it('returns null for empty array', () => {
      expect(buildGazetteerStageFilter({ gazetteerStages: [] })).toBe(null);
    });

    it('returns null for missing gazetteerStages', () => {
      expect(buildGazetteerStageFilter({})).toBe(null);
    });

    it('returns Set of lowercase stage names', () => {
      const result = buildGazetteerStageFilter({ gazetteerStages: ['SEED', 'Hub', 'article'] });
      expect(result).toBeInstanceOf(Set);
      expect(result.has('seed')).toBe(true);
      expect(result.has('hub')).toBe(true);
      expect(result.has('article')).toBe(true);
    });
  });

  describe('mode detection functions', () => {
    describe('isGazetteerMode', () => {
      it('returns true for gazetteer types', () => {
        expect(isGazetteerMode('gazetteer')).toBe(true);
        expect(isGazetteerMode('geography')).toBe(true);
        expect(isGazetteerMode('geo')).toBe(true);
      });

      it('returns false for other types', () => {
        expect(isGazetteerMode('basic')).toBe(false);
        expect(isGazetteerMode('intelligent')).toBe(false);
        expect(isGazetteerMode(null)).toBe(false);
      });
    });

    describe('isIntelligentMode', () => {
      it('returns true for intelligent types', () => {
        expect(isIntelligentMode('intelligent')).toBe(true);
        expect(isIntelligentMode('intelligent-deep')).toBe(true);
      });

      it('returns false for other types', () => {
        expect(isIntelligentMode('basic')).toBe(false);
        expect(isIntelligentMode('gazetteer')).toBe(false);
        expect(isIntelligentMode(null)).toBe(false);
      });
    });

    describe('isBasicMode', () => {
      it('returns true for basic types', () => {
        expect(isBasicMode('basic')).toBe(true);
        expect(isBasicMode('normal')).toBe(true);
        expect(isBasicMode('unknown')).toBe(true);
      });

      it('returns false for specialized modes', () => {
        expect(isBasicMode('gazetteer')).toBe(false);
        expect(isBasicMode('intelligent')).toBe(false);
      });
    });
  });

  describe('normalizeOptions', () => {
    it('applies defaults from schema', () => {
      const result = normalizeOptions({});
      expect(result.maxDepth).toBe(3);
      expect(result.retryLimit).toBe(3);
      expect(result.fastStart).toBe(true);
    });

    it('respects provided values', () => {
      const result = normalizeOptions({ maxDepth: 5 });
      expect(result.maxDepth).toBe(5);
    });

    it('applies processor functions', () => {
      const result = normalizeOptions({ concurrency: -5 });
      expect(result.concurrency).toBe(1); // Math.max(1, val)
    });

    it('normalizes crawlType to lowercase', () => {
      const result = normalizeOptions({ crawlType: 'BASIC' });
      expect(result.crawlType).toBe('basic');
    });
  });

  describe('createCrawlerConfig', () => {
    it('creates complete config with derived values', () => {
      const config = createCrawlerConfig('https://www.example.com/news');
      expect(config.startUrl).toBe('https://www.example.com/news');
      expect(config.domain).toBe('www.example.com');
      expect(config.domainNormalized).toBe('example.com');
      expect(config.baseUrl).toBe('https://www.example.com');
      expect(config.priorityProfile).toBe('basic');
    });

    it('respects provided options', () => {
      const config = createCrawlerConfig('https://example.com', { maxDepth: 7 });
      expect(config.maxDepth).toBe(7);
    });

    it('resolves priority profile from crawl type', () => {
      const config = createCrawlerConfig('https://example.com', { crawlType: 'gazetteer' });
      expect(config.priorityProfile).toBe('geography');
    });

    it('handles invalid URLs gracefully', () => {
      const config = createCrawlerConfig('not-a-url', {});
      expect(config.domain).toBe(null);
      expect(config.domainNormalized).toBe(null);
      expect(config.baseUrl).toBe(null);
    });
  });

  describe('constants', () => {
    it('exports expected constants', () => {
      expect(DEFAULT_OUTPUT_VERBOSITY).toBe('normal');
      expect(TEN_MINUTES_MS).toBe(600000);
      expect(DEFAULT_FEATURE_FLAGS).toBeDefined();
      expect(DEFAULT_FEATURE_FLAGS.telemetrySummary).toBe(true);
    });

    it('exports crawlerOptionsSchema with expected keys', () => {
      expect(crawlerOptionsSchema.maxDepth).toBeDefined();
      expect(crawlerOptionsSchema.concurrency).toBeDefined();
      expect(crawlerOptionsSchema.crawlType).toBeDefined();
    });
  });
});
