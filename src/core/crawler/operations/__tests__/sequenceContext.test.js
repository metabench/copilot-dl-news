'use strict';

const { SequenceContextAdapter, createSequenceContext } = require('../sequenceContext');

describe('SequenceContextAdapter', () => {
  describe('without playbook service', () => {
    let adapter;

    beforeEach(() => {
      adapter = new SequenceContextAdapter();
    });

    afterEach(() => {
      adapter.dispose();
    });

    it('reports no playbook available', () => {
      expect(adapter.hasPlaybook).toBe(false);
    });

    it('resolves start URL to https://{domain}', async () => {
      const startUrl = await adapter.resolveStartUrl('example.com');
      expect(startUrl).toBe('https://example.com');
    });

    it('returns default retry strategy', async () => {
      const strategy = await adapter.getRetryStrategy('example.com');
      expect(strategy.maxAttempts).toBe(3);
      expect(strategy.backoffMs).toEqual([1000, 5000, 15000]);
      expect(strategy.strategy).toBe('exponential');
    });

    it('never avoids URLs', async () => {
      const shouldAvoid = await adapter.shouldAvoidUrl('example.com', 'https://example.com/test');
      expect(shouldAvoid).toBe(false);
    });

    it('returns null for playbook hints', async () => {
      const hints = await adapter.getPlaybookHints('example.com');
      expect(hints).toBeNull();
    });

    it('returns null for sequence preset suggestions', async () => {
      const preset = await adapter.suggestSequencePreset('example.com');
      expect(preset).toBeNull();
    });
  });

  describe('with mocked playbook service', () => {
    let adapter;
    let mockPlaybook;

    beforeEach(() => {
      mockPlaybook = {
        loadPlaybook: jest.fn(),
        getRetryStrategy: jest.fn(),
        shouldAvoidUrl: jest.fn(),
        close: jest.fn()
      };

      adapter = new SequenceContextAdapter({ playbookService: mockPlaybook });
    });

    afterEach(() => {
      adapter.dispose();
    });

    it('reports playbook available', () => {
      expect(adapter.hasPlaybook).toBe(true);
    });

    it('resolves start URL from hub tree', async () => {
      mockPlaybook.loadPlaybook.mockResolvedValue({
        hubTree: {
          levels: [
            {
              hubs: [
                { url: 'https://example.com/world' }
              ]
            }
          ]
        }
      });

      const startUrl = await adapter.resolveStartUrl('example.com');
      expect(startUrl).toBe('https://example.com/world');
      expect(mockPlaybook.loadPlaybook).toHaveBeenCalledWith('example.com');
    });

    it('falls back to https://{domain} if hub tree empty', async () => {
      mockPlaybook.loadPlaybook.mockResolvedValue({
        hubTree: { levels: [] }
      });

      const startUrl = await adapter.resolveStartUrl('example.com');
      expect(startUrl).toBe('https://example.com');
    });

    it('gets retry strategy from playbook', async () => {
      mockPlaybook.getRetryStrategy.mockReturnValue({
        maxAttempts: 5,
        backoffMs: [2000, 10000],
        strategy: 'adaptive'
      });

      const strategy = await adapter.getRetryStrategy('example.com', 'https://example.com/test', 'timeout');
      expect(strategy.maxAttempts).toBe(5);
      expect(strategy.strategy).toBe('adaptive');
      expect(mockPlaybook.getRetryStrategy).toHaveBeenCalledWith('example.com', 'https://example.com/test', 'timeout');
    });

    it('checks URL avoidance', async () => {
      mockPlaybook.shouldAvoidUrl.mockResolvedValue(true);

      const shouldAvoid = await adapter.shouldAvoidUrl('example.com', 'https://example.com/blocked');
      expect(shouldAvoid).toBe(true);
      expect(mockPlaybook.shouldAvoidUrl).toHaveBeenCalledWith('example.com', 'https://example.com/blocked');
    });

    it('returns playbook hints', async () => {
      mockPlaybook.loadPlaybook.mockResolvedValue({
        hubTree: { levels: [{ hubs: [] }, { hubs: [] }] },
        patterns: [{ pattern: 'test' }],
        avoidanceRules: [{ kind: 'robots-blocked' }]
      });

      mockPlaybook.getRetryStrategy.mockReturnValue({
        maxAttempts: 3,
        backoffMs: [1000, 5000],
        strategy: 'exponential'
      });

      const hints = await adapter.getPlaybookHints('example.com');
      expect(hints.hubTreeLevels).toBe(2);
      expect(hints.learnedPatterns).toBe(1);
      expect(hints.avoidanceRules).toBe(1);
      expect(hints.hasIntelligence).toBe(true);
    });

    it('suggests ensureCountryStructure for empty playbook', async () => {
      mockPlaybook.loadPlaybook.mockResolvedValue({
        hubTree: { levels: [] },
        patterns: []
      });

      const preset = await adapter.suggestSequencePreset('example.com');
      expect(preset).toBe('ensureCountryStructure');
    });

    it('suggests ensureAndExploreCountryHubs for sparse patterns', async () => {
      mockPlaybook.loadPlaybook.mockResolvedValue({
        hubTree: { levels: [{ hubs: [] }] },
        patterns: [{ pattern: 'test1' }, { pattern: 'test2' }]
      });

      const preset = await adapter.suggestSequencePreset('example.com');
      expect(preset).toBe('ensureAndExploreCountryHubs');
    });

    it('suggests fullCountryHubDiscovery for established playbook', async () => {
      mockPlaybook.loadPlaybook.mockResolvedValue({
        hubTree: { levels: [{ hubs: [] }] },
        patterns: [
          { pattern: 'test1' },
          { pattern: 'test2' },
          { pattern: 'test3' },
          { pattern: 'test4' },
          { pattern: 'test5' }
        ]
      });

      const preset = await adapter.suggestSequencePreset('example.com');
      expect(preset).toBe('fullCountryHubDiscovery');
    });

    it('does not close external playbook service', () => {
      adapter.dispose();
      expect(mockPlaybook.close).not.toHaveBeenCalled();
    });
  });

  describe('factory function', () => {
    it('creates adapter without options', () => {
      const adapter = createSequenceContext();
      expect(adapter.hasPlaybook).toBe(false);
      adapter.dispose();
    });

    it('creates adapter with playbook service', () => {
      const mockPlaybook = { loadPlaybook: jest.fn() };
      const adapter = createSequenceContext({ playbookService: mockPlaybook });
      expect(adapter.hasPlaybook).toBe(true);
      adapter.dispose();
    });
  });
});
