const { PriorityScorer } = require('../../src/crawler/PriorityScorer');
const { ConfigManager } = require('../../src/config/ConfigManager');
const { ProblemClusteringService } = require('../../src/crawler/ProblemClusteringService');

describe('Enhanced Crawler Features', () => {
  let configManager;
  let priorityScorer;
  let clusteringService;

  beforeEach(() => {
    // Use in-memory config for testing
    configManager = new ConfigManager(null, { 
      inMemory: true,
      initialConfig: {
        queuePriorityBonuses: {
          'adaptive-seed': 20,
          'gap-prediction': 15,
          'sitemap': 10,
          'hub-validated': 12,
          'pattern-learned': 8
        },
        priorityWeights: {
          base: 1.0,
          'discovery-method': 1.2,
          'gap-score': 1.5,
          'problem-clusters': 1.3
        },
        features: {
          'gap-driven-prioritization': true,
          'problem-clustering': true,
          'planner-knowledge-reuse': true,
          'coverage-analytics': true,
          'priority-debugging': false
        },
        clustering: {
          similarityThreshold: 0.7,
          minClusterSize: 3,
          maxGapPredictions: 10,
          patternConfidence: 0.8
        }
      }
    });

    priorityScorer = new PriorityScorer(configManager);
    clusteringService = new ProblemClusteringService(null, configManager); // null database for testing
  });

  describe('ConfigManager', () => {
    test('should load configuration correctly', () => {
      const config = configManager.getConfig();
      expect(config.queuePriorityBonuses['adaptive-seed']).toBe(20);
      expect(config.features['gap-driven-prioritization']).toBe(true);
    });

    test('should validate configuration updates', () => {
      const validUpdate = {
        queuePriorityBonuses: {
          'adaptive-seed': 25
        }
      };

      const result = configManager.updateConfig(validUpdate);
      expect(result.success).toBe(true);
      expect(configManager.getConfig().queuePriorityBonuses['adaptive-seed']).toBe(25);
    });

    test('should reject invalid configuration', () => {
      const invalidUpdate = {
        queuePriorityBonuses: {
          'adaptive-seed': 'invalid-value'
        }
      };

      const result = configManager.updateConfig(invalidUpdate);
      expect(result.success).toBe(false);
      expect(result.errors).toContain('Invalid priority bonus value for adaptive-seed');
    });
  });

  describe('PriorityScorer', () => {
    test('should calculate enhanced priority correctly', () => {
      const workItem = {
        url: 'https://example.com/article',
        depth: 1,
        discoveryMethod: 'adaptive-seed',
        basePriority: 5.0
      };

      const metadata = {
        discoveryMethod: 'adaptive-seed',
        gapScore: 0.8,
        problemClusterBoost: 0.3
      };

      const priority = priorityScorer.calculateEnhancedPriority(workItem, metadata);
      
      // Should include base priority + adaptive-seed bonus + weighted gap score
      expect(priority).toBeGreaterThan(5.0);
      expect(priority).toBeCloseTo(5.0 + 20 + (1.2 * 5.0) + (1.5 * 0.8) + (1.3 * 0.3), 1);
    });

    test('should apply correct discovery method bonuses', () => {
      const baseItem = {
        url: 'https://example.com/test',
        depth: 1,
        basePriority: 1.0
      };

      const adaptiveItem = { ...baseItem, discoveryMethod: 'adaptive-seed' };
      const sitemapItem = { ...baseItem, discoveryMethod: 'sitemap' };
      
      const adaptivePriority = priorityScorer.calculateEnhancedPriority(adaptiveItem, { discoveryMethod: 'adaptive-seed' });
      const sitemapPriority = priorityScorer.calculateEnhancedPriority(sitemapItem, { discoveryMethod: 'sitemap' });

      expect(adaptivePriority).toBeGreaterThan(sitemapPriority);
    });

    test('should handle missing configuration gracefully', () => {
      const emptyScorer = new PriorityScorer(null);
      const workItem = {
        url: 'https://example.com/test',
        depth: 1,
        basePriority: 5.0
      };

      const priority = emptyScorer.calculateEnhancedPriority(workItem, {});
      expect(priority).toBe(5.0); // Should fallback to base priority
    });
  });

  describe('ProblemClusteringService', () => {
    test('should identify similar problems', () => {
      const problems = [
        { kind: 'missing-hub', scope: 'guardian', target: '/world/france', message: 'Country hub not found' },
        { kind: 'missing-hub', scope: 'guardian', target: '/world/germany', message: 'Country hub not found' },
        { kind: 'missing-hub', scope: 'guardian', target: '/world/italy', message: 'Country hub not found' },
        { kind: 'unknown-pattern', scope: 'guardian', target: '/p/abc123', message: 'Unrecognized pattern' }
      ];

      const clusters = clusteringService.clusterProblems(problems);
      
      expect(clusters).toHaveLength(2); // One cluster for missing-hub, one for unknown-pattern
      
      const hubCluster = clusters.find(c => c.representative.kind === 'missing-hub');
      expect(hubCluster).toBeDefined();
      expect(hubCluster.problems).toHaveLength(3);
      expect(hubCluster.similarity).toBeGreaterThan(0.7);
    });

    test('should generate gap predictions from clusters', () => {
      const cluster = {
        representative: { kind: 'missing-hub', scope: 'guardian', target: '/world/france' },
        problems: [
          { target: '/world/france' },
          { target: '/world/germany' },
          { target: '/world/italy' }
        ],
        similarity: 0.9,
        patterns: ['/world/{country}']
      };

      const predictions = clusteringService.generateGapPredictions(cluster);
      
      expect(predictions).toBeInstanceOf(Array);
      expect(predictions.length).toBeGreaterThan(0);
      
      if (predictions.length > 0) {
        expect(predictions[0]).toHaveProperty('url');
        expect(predictions[0]).toHaveProperty('confidence');
        expect(predictions[0]).toHaveProperty('reasoning');
      }
    });

    test('should calculate priority boost for clusters', () => {
      const cluster = {
        representative: { kind: 'missing-hub' },
        problems: [1, 2, 3], // 3 problems
        similarity: 0.8
      };

      const boost = clusteringService.calculatePriorityBoost(cluster);
      
      expect(boost).toBeGreaterThan(0);
      expect(boost).toBeLessThanOrEqual(1); // Should be normalized
    });
  });

  describe('Feature Integration', () => {
    test('should respect feature flags', () => {
      // Disable gap-driven prioritization
      configManager.updateConfig({
        features: { 'gap-driven-prioritization': false }
      });

      const workItem = {
        url: 'https://example.com/test',
        depth: 1,
        basePriority: 5.0
      };

      const metadata = { gapScore: 0.9 }; // High gap score
      const priority = priorityScorer.calculateEnhancedPriority(workItem, metadata);

      // Should not include gap score weighting when feature is disabled
      expect(priority).toBe(5.0); // Only base priority
    });

    test('should handle configuration updates dynamically', () => {
      const initialConfig = configManager.getConfig();
      expect(initialConfig.queuePriorityBonuses['adaptive-seed']).toBe(20);

      // Update configuration
      configManager.updateConfig({
        queuePriorityBonuses: { 'adaptive-seed': 30 }
      });

      const updatedConfig = configManager.getConfig();
      expect(updatedConfig.queuePriorityBonuses['adaptive-seed']).toBe(30);

      // Priority scorer should use updated values
      const workItem = {
        url: 'https://example.com/test',
        depth: 1,
        discoveryMethod: 'adaptive-seed',
        basePriority: 5.0
      };

      const priority = priorityScorer.calculateEnhancedPriority(workItem, { discoveryMethod: 'adaptive-seed' });
      expect(priority).toBeGreaterThan(35); // Should include new bonus of 30
    });
  });

  describe('Error Handling', () => {
    test('should handle malformed work items gracefully', () => {
      const malformedItem = {
        // Missing required fields
        depth: 'invalid'
      };

      expect(() => {
        priorityScorer.calculateEnhancedPriority(malformedItem, {});
      }).not.toThrow();
    });

    test('should handle clustering service errors gracefully', () => {
      const malformedProblems = [
        null,
        undefined,
        { /* missing required fields */ },
        'invalid-problem'
      ];

      expect(() => {
        clusteringService.clusterProblems(malformedProblems);
      }).not.toThrow();
    });
  });
});