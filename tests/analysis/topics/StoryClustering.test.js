'use strict';

/**
 * StoryClustering Tests
 * 
 * Tests for story grouping using SimHash and entities.
 */

const {
  StoryClustering,
  calculateEntityOverlap,
  timeDiffHours,
  MAX_HAMMING_DISTANCE,
  MIN_SHARED_ENTITIES,
  MAX_TIME_DIFF_HOURS
} = require('../../../src/analysis/topics/StoryClustering');
const SimHasher = require('../../../src/analysis/similarity/SimHasher');

describe('StoryClustering', () => {
  describe('calculateEntityOverlap()', () => {
    it('should find shared entities', () => {
      const entities1 = [
        { text: 'John Smith', type: 'PERSON' },
        { text: 'Acme Corp', type: 'ORG' },
        { text: 'New York', type: 'GPE' }
      ];
      
      const entities2 = [
        { text: 'John Smith', type: 'PERSON' },
        { text: 'XYZ Inc', type: 'ORG' },
        { text: 'New York', type: 'GPE' }
      ];
      
      const overlap = calculateEntityOverlap(entities1, entities2);
      
      expect(overlap.count).toBe(2);
      expect(overlap.shared).toContain('john smith');
      expect(overlap.shared).toContain('new york');
    });
    
    it('should be case insensitive', () => {
      const entities1 = [{ text: 'JOHN SMITH', type: 'PERSON' }];
      const entities2 = [{ text: 'john smith', type: 'PERSON' }];
      
      const overlap = calculateEntityOverlap(entities1, entities2);
      
      expect(overlap.count).toBe(1);
    });
    
    it('should handle entity_text field name', () => {
      const entities1 = [{ entity_text: 'John Smith', entity_type: 'PERSON' }];
      const entities2 = [{ entity_text: 'John Smith', entity_type: 'PERSON' }];
      
      const overlap = calculateEntityOverlap(entities1, entities2);
      
      expect(overlap.count).toBe(1);
    });
    
    it('should return 0 for empty arrays', () => {
      expect(calculateEntityOverlap([], []).count).toBe(0);
      expect(calculateEntityOverlap(null, []).count).toBe(0);
      expect(calculateEntityOverlap([], null).count).toBe(0);
    });
    
    it('should return 0 for no overlap', () => {
      const entities1 = [{ text: 'John Smith', type: 'PERSON' }];
      const entities2 = [{ text: 'Jane Doe', type: 'PERSON' }];
      
      const overlap = calculateEntityOverlap(entities1, entities2);
      
      expect(overlap.count).toBe(0);
      expect(overlap.shared).toEqual([]);
    });
    
    it('should deduplicate shared entities', () => {
      const entities1 = [
        { text: 'John Smith', type: 'PERSON' },
        { text: 'John Smith', type: 'PERSON' }
      ];
      const entities2 = [
        { text: 'John Smith', type: 'PERSON' },
        { text: 'John Smith', type: 'PERSON' }
      ];
      
      const overlap = calculateEntityOverlap(entities1, entities2);
      
      // Count is raw matches before dedup, shared is deduplicated
      expect(overlap.shared).toEqual(['john smith']);
      expect(overlap.shared.length).toBe(1);
    });
  });
  
  describe('timeDiffHours()', () => {
    it('should calculate hours between dates', () => {
      const date1 = '2025-01-01T00:00:00Z';
      const date2 = '2025-01-01T06:00:00Z';
      
      const diff = timeDiffHours(date1, date2);
      
      expect(diff).toBe(6);
    });
    
    it('should be absolute (order independent)', () => {
      const date1 = '2025-01-01T00:00:00Z';
      const date2 = '2025-01-01T06:00:00Z';
      
      expect(timeDiffHours(date1, date2)).toBe(timeDiffHours(date2, date1));
    });
    
    it('should handle Date objects', () => {
      const date1 = new Date('2025-01-01T00:00:00Z');
      const date2 = new Date('2025-01-02T00:00:00Z');
      
      const diff = timeDiffHours(date1, date2);
      
      expect(diff).toBe(24);
    });
    
    it('should return 0 for same date', () => {
      const date = '2025-01-01T12:00:00Z';
      expect(timeDiffHours(date, date)).toBe(0);
    });
  });
  
  describe('StoryClustering class', () => {
    let clustering;
    let mockTopicAdapter;
    let mockSimilarityAdapter;
    let mockTagAdapter;
    
    beforeEach(() => {
      mockTopicAdapter = {
        getStoryClusters: jest.fn().mockReturnValue([]),
        getStoryCluster: jest.fn(),
        saveStoryCluster: jest.fn().mockReturnValue({ id: 1 }),
        updateStoryCluster: jest.fn(),
        deactivateOldClusters: jest.fn().mockReturnValue(0)
      };
      
      mockSimilarityAdapter = {
        getFingerprint: jest.fn()
      };
      
      mockTagAdapter = {
        getEntities: jest.fn().mockReturnValue([])
      };
      
      clustering = new StoryClustering({
        topicAdapter: mockTopicAdapter,
        similarityAdapter: mockSimilarityAdapter,
        tagAdapter: mockTagAdapter,
        logger: { log: jest.fn(), error: jest.fn() }
      });
    });
    
    describe('initialization', () => {
      it('should initialize with empty clusters', async () => {
        await clustering.initialize();
        
        expect(clustering._initialized).toBe(true);
        expect(clustering._clusterIndex.size).toBe(0);
      });
      
      it('should load existing clusters', async () => {
        mockTopicAdapter.getStoryClusters.mockReturnValue([
          {
            id: 1,
            headline: 'Test Story',
            article_ids: '[1, 2, 3]',
            last_updated: '2025-01-01T00:00:00Z',
            is_active: 1
          }
        ]);
        
        await clustering.initialize();
        
        expect(clustering._clusterIndex.size).toBe(1);
        expect(clustering._clusterIndex.get(1).headline).toBe('Test Story');
      });
    });
    
    describe('createCluster()', () => {
      it('should create a new cluster', () => {
        const cluster = clustering.createCluster({
          headline: 'Breaking News Story',
          articleIds: [1, 2],
          summary: 'A summary'
        });
        
        expect(cluster.id).toBe(1);
        expect(mockTopicAdapter.saveStoryCluster).toHaveBeenCalledWith(
          expect.objectContaining({
            headline: 'Breaking News Story',
            articleIds: [1, 2],
            summary: 'A summary'
          })
        );
      });
      
      it('should add cluster to in-memory index', () => {
        clustering.createCluster({
          headline: 'Test',
          articleIds: [1]
        });
        
        expect(clustering._clusterIndex.has(1)).toBe(true);
      });
      
      it('should throw for missing headline', () => {
        expect(() => clustering.createCluster({ articleIds: [1] }))
          .toThrow('headline and articleIds are required');
      });
      
      it('should throw for missing articleIds', () => {
        expect(() => clustering.createCluster({ headline: 'Test' }))
          .toThrow('headline and articleIds are required');
      });
      
      it('should throw for empty articleIds', () => {
        expect(() => clustering.createCluster({ headline: 'Test', articleIds: [] }))
          .toThrow('headline and articleIds are required');
      });
    });
    
    describe('addToCluster()', () => {
      it('should add article to existing cluster', () => {
        mockTopicAdapter.getStoryCluster.mockReturnValue({
          id: 1,
          article_ids: '[1, 2]'
        });
        
        const result = clustering.addToCluster(1, 3);
        
        expect(result.articleIds).toContain(3);
        expect(result.articleCount).toBe(3);
      });
      
      it('should not duplicate article ID', () => {
        mockTopicAdapter.getStoryCluster.mockReturnValue({
          id: 1,
          article_ids: '[1, 2]'
        });
        
        const result = clustering.addToCluster(1, 2);
        
        expect(result.articleIds.filter(id => id === 2).length).toBe(1);
      });
      
      it('should throw for non-existent cluster', () => {
        mockTopicAdapter.getStoryCluster.mockReturnValue(null);
        
        expect(() => clustering.addToCluster(999, 1))
          .toThrow('Cluster 999 not found');
      });
    });
    
    describe('findPotentialClusters()', () => {
      it('should find similar articles', () => {
        // Create identical fingerprints (same text = distance 0)
        const fp1 = SimHasher.compute('president biden election campaign vote congress senate house');
        const fp2 = SimHasher.compute('president biden election campaign vote congress senate house');
        
        const articles = [
          { id: 1, simhash: fp1, entities: [{ text: 'Biden', type: 'PERSON' }], publishedAt: new Date() },
          { id: 2, simhash: fp2, entities: [{ text: 'Biden', type: 'PERSON' }], publishedAt: new Date() }
        ];
        
        const clusters = clustering.findPotentialClusters(articles);
        
        expect(clusters.length).toBeGreaterThan(0);
        expect(clusters[0].articleIds).toContain(1);
        expect(clusters[0].articleIds).toContain(2);
      });
      
      it('should not cluster dissimilar articles', () => {
        const fp1 = SimHasher.compute('president election campaign vote');
        const fp2 = SimHasher.compute('sports basketball game championship finals');
        
        const articles = [
          { id: 1, simhash: fp1, entities: [{ text: 'Biden', type: 'PERSON' }], publishedAt: new Date() },
          { id: 2, simhash: fp2, entities: [{ text: 'Jordan', type: 'PERSON' }], publishedAt: new Date() }
        ];
        
        const clusters = clustering.findPotentialClusters(articles);
        
        // Should not form a cluster (different content)
        expect(clusters.length).toBe(0);
      });
      
      it('should require shared entities', () => {
        const fp1 = SimHasher.compute('president election campaign vote congress');
        const fp2 = SimHasher.compute('president election campaign vote congress');
        
        const articles = [
          { id: 1, simhash: fp1, entities: [{ text: 'Biden', type: 'PERSON' }], publishedAt: new Date() },
          { id: 2, simhash: fp2, entities: [{ text: 'Trump', type: 'PERSON' }], publishedAt: new Date() }
        ];
        
        const clusters = clustering.findPotentialClusters(articles);
        
        // Should not cluster (no shared entities)
        expect(clusters.length).toBe(0);
      });
      
      it('should filter by time proximity', () => {
        const fp1 = SimHasher.compute('president election campaign vote congress');
        const fp2 = SimHasher.compute('president election campaign vote congress');
        
        const now = new Date();
        const threeDaysAgo = new Date(now);
        threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
        
        const articles = [
          { id: 1, simhash: fp1, entities: [{ text: 'Biden', type: 'PERSON' }], publishedAt: now },
          { id: 2, simhash: fp2, entities: [{ text: 'Biden', type: 'PERSON' }], publishedAt: threeDaysAgo }
        ];
        
        const clusters = clustering.findPotentialClusters(articles);
        
        // Should not cluster (too far apart in time)
        expect(clusters.length).toBe(0);
      });
    });
    
    describe('deactivateOldClusters()', () => {
      it('should deactivate old clusters', () => {
        mockTopicAdapter.deactivateOldClusters.mockReturnValue(5);
        
        const count = clustering.deactivateOldClusters(7);
        
        expect(count).toBe(5);
        expect(mockTopicAdapter.deactivateOldClusters).toHaveBeenCalled();
      });
    });
    
    describe('getStats()', () => {
      it('should return statistics', () => {
        const stats = clustering.getStats();
        
        expect(stats.initialized).toBeDefined();
        expect(stats.activeClusters).toBeDefined();
        expect(stats.maxHammingDistance).toBe(MAX_HAMMING_DISTANCE);
        expect(stats.minSharedEntities).toBe(MIN_SHARED_ENTITIES);
        expect(stats.maxTimeDiffHours).toBe(MAX_TIME_DIFF_HOURS);
      });
    });
  });
  
  describe('constants', () => {
    it('should have reasonable defaults', () => {
      expect(MAX_HAMMING_DISTANCE).toBe(3);
      expect(MIN_SHARED_ENTITIES).toBe(1);
      expect(MAX_TIME_DIFF_HOURS).toBe(48);
    });
  });
});
