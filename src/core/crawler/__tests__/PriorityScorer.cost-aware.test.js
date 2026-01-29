/**
 * Tests for Cost-Aware Priority Scoring (Phase 1 Improvement)
 */

const { PriorityScorer } = require('../PriorityScorer');

describe('PriorityScorer - Cost-Aware Priority', () => {
  let scorer;
  let mockConfigManager;

  beforeEach(() => {
    // Mock ConfigManager with proper structure
    const baseConfig = {
      features: {
        costAwarePriority: false,
        gapDrivenPrioritization: false,
        problemClustering: false,
        plannerKnowledgeReuse: false
      },
      queue: {
        weights: {},
        bonuses: {}
      },
      priorityWeights: {},
      queuePriorityBonuses: {}
    };

    mockConfigManager = {
      getConfig: jest.fn(() => baseConfig),
      get: jest.fn((key) => {
        if (key === 'features.costAwarePriority') return baseConfig.features.costAwarePriority;
        if (key === 'features.gapDrivenPrioritization') return baseConfig.features.gapDrivenPrioritization;
        return undefined;
      }),
      addWatcher: jest.fn(), // Mock watcher registration
      _config: baseConfig // Allow tests to modify
    };
    
    scorer = new PriorityScorer(mockConfigManager); // Pass directly, not as object
  });

  describe('_calculateCostAdjustment', () => {
    test('fast actions (<100ms) get priority boost', () => {
      const basePriority = 100;
      
      // 50ms action = fast
      const adjustment1 = scorer._calculateCostAdjustment(50, basePriority);
      expect(adjustment1).toBeGreaterThan(0);
      expect(adjustment1).toBeCloseTo(5, 1); // ~5 boost (10% of 100 * 0.5 remaining)
      
      // 10ms action = very fast
      const adjustment2 = scorer._calculateCostAdjustment(10, basePriority);
      expect(adjustment2).toBeGreaterThan(adjustment1);
      expect(adjustment2).toBeCloseTo(9, 1); // ~9 boost (10% of 100 * 0.9 remaining)
    });

    test('slow actions (>500ms) get priority penalty', () => {
      const basePriority = 100;
      
      // 600ms action = slightly slow
      const adjustment1 = scorer._calculateCostAdjustment(600, basePriority);
      expect(adjustment1).toBeLessThan(0);
      expect(adjustment1).toBeCloseTo(-2, 1); // ~-2 penalty (10% of 100 * 0.2 excess ratio)
      
      // 1500ms action = very slow
      const adjustment2 = scorer._calculateCostAdjustment(1500, basePriority);
      expect(adjustment2).toBeLessThan(adjustment1);
      expect(adjustment2).toBeCloseTo(-10, 1); // ~-10 penalty (capped at 100% excess)
    });

    test('medium cost actions (100-500ms) get no adjustment', () => {
      const basePriority = 100;
      
      const adjustment1 = scorer._calculateCostAdjustment(100, basePriority);
      expect(adjustment1).toBe(0);
      
      const adjustment2 = scorer._calculateCostAdjustment(300, basePriority);
      expect(adjustment2).toBe(0);
      
      const adjustment3 = scorer._calculateCostAdjustment(500, basePriority);
      expect(adjustment3).toBe(0);
    });

    test('adjustment scales with priority magnitude', () => {
      const lowPriority = 50;
      const highPriority = 200;
      
      // Fast action: adjustment scales with priority
      const lowAdj = scorer._calculateCostAdjustment(50, lowPriority);
      const highAdj = scorer._calculateCostAdjustment(50, highPriority);
      expect(highAdj).toBeCloseTo(lowAdj * 4, 1); // 200/50 = 4x
    });
  });

  describe('computeEnhancedPriority with cost awareness', () => {
    test('applies cost adjustment when feature enabled', () => {
      // Enable feature
      mockConfigManager._config.features.costAwarePriority = true;
      mockConfigManager.get = jest.fn((key) => {
        if (key === 'features.costAwarePriority') return true;
        return false;
      });
      scorer = new PriorityScorer(mockConfigManager);

      const basePriority = 100;
      
      // Fast action should get boosted
      const result1 = scorer.computeEnhancedPriority({
        type: 'hub-seed',
        depth: 1,
        meta: { estimatedCostMs: 50 },
        basePriorityOverride: basePriority
      });
      
      expect(result1.priority).toBeGreaterThan(basePriority);
      expect(result1.bonusApplied).toBeGreaterThan(0);
      
      // Slow action should get penalized
      const result2 = scorer.computeEnhancedPriority({
        type: 'hub-seed',
        depth: 1,
        meta: { estimatedCostMs: 1000 },
        basePriorityOverride: basePriority
      });
      
      expect(result2.priority).toBeLessThan(basePriority);
      expect(result2.bonusApplied).toBeLessThan(0);
    });

    test('ignores cost when feature disabled', () => {
      // Feature already disabled in beforeEach
      scorer = new PriorityScorer(mockConfigManager);

      const basePriority = 100;
      
      const result = scorer.computeEnhancedPriority({
        type: 'hub-seed',
        depth: 1,
        meta: { estimatedCostMs: 50 },
        basePriorityOverride: basePriority
      });
      
      // Priority should equal base (no cost adjustment)
      expect(result.priority).toBe(basePriority);
    });

    test('ignores cost when estimatedCostMs not provided', () => {
      mockConfigManager._config.features.costAwarePriority = true;
      mockConfigManager.get = jest.fn((key) => {
        if (key === 'features.costAwarePriority') return true;
        return false;
      });
      scorer = new PriorityScorer(mockConfigManager);

      const basePriority = 100;
      
      const result = scorer.computeEnhancedPriority({
        type: 'hub-seed',
        depth: 1,
        meta: {}, // No estimatedCostMs
        basePriorityOverride: basePriority
      });
      
      expect(result.priority).toBe(basePriority);
    });

    test('cost adjustment updates prioritySource', () => {
      mockConfigManager._config.features.costAwarePriority = true;
      mockConfigManager.get = jest.fn((key) => {
        if (key === 'features.costAwarePriority') return true;
        return false;
      });
      scorer = new PriorityScorer(mockConfigManager);

      const result = scorer.computeEnhancedPriority({
        type: 'hub-seed',
        depth: 1,
        meta: { estimatedCostMs: 50 },
        basePriorityOverride: 100
      });
      
      expect(result.prioritySource).toBe('cost-adjusted');
    });
  });

  describe('integration with other features', () => {
    test('cost adjustment combines with gap-driven prioritization', () => {
      mockConfigManager._config.features.costAwarePriority = true;
      mockConfigManager._config.features.gapDrivenPrioritization = true;
      mockConfigManager.get = jest.fn((key) => {
        if (key === 'features.costAwarePriority') return true;
        if (key === 'features.gapDrivenPrioritization') return true;
        return false;
      });
      scorer = new PriorityScorer(mockConfigManager);

      const result = scorer.computeEnhancedPriority({
        type: 'hub-seed',
        depth: 1,
        meta: {
          estimatedCostMs: 50,
          gapScore: 10,
          discoveryMethod: 'adaptive-seed'
        },
        basePriorityOverride: 100
      });
      
      // Should have cost boost (base priority is 100, no other bonuses without weights configured)
      // Cost adjustment alone: ~5 boost for 50ms action
      expect(result.priority).toBeGreaterThan(100); // At minimum has cost boost
      expect(result.bonusApplied).toBeGreaterThan(0); // Some positive adjustment
    });

    test('cost penalty can reduce total priority below base', () => {
      mockConfigManager._config.features.costAwarePriority = true;
      mockConfigManager.get = jest.fn((key) => {
        if (key === 'features.costAwarePriority') return true;
        return false;
      });
      scorer = new PriorityScorer(mockConfigManager);

      const result = scorer.computeEnhancedPriority({
        type: 'hub-seed',
        depth: 1,
        meta: { estimatedCostMs: 2000 }, // Very slow
        basePriorityOverride: 100
      });
      
      // Cost penalty should reduce below base
      expect(result.priority).toBeLessThan(100);
      expect(result.bonusApplied).toBeLessThan(0);
    });
  });
});
