'use strict';

/**
 * TrendDetector Tests
 * 
 * Tests for emerging topic detection.
 */

const {
  TrendDetector,
  mean,
  stddev,
  toDateString,
  daysAgo,
  BASELINE_DAYS,
  TREND_SIGMA_THRESHOLD,
  MIN_DAILY_ARTICLES
} = require('../../../src/analysis/topics/TrendDetector');

describe('TrendDetector', () => {
  describe('mean()', () => {
    it('should calculate mean', () => {
      expect(mean([1, 2, 3, 4, 5])).toBe(3);
    });
    
    it('should handle single value', () => {
      expect(mean([10])).toBe(10);
    });
    
    it('should return 0 for empty array', () => {
      expect(mean([])).toBe(0);
    });
    
    it('should return 0 for null/undefined', () => {
      expect(mean(null)).toBe(0);
      expect(mean(undefined)).toBe(0);
    });
  });
  
  describe('stddev()', () => {
    it('should calculate standard deviation', () => {
      const values = [2, 4, 4, 4, 5, 5, 7, 9];
      const result = stddev(values);
      expect(result).toBeCloseTo(2, 0); // Approximately 2
    });
    
    it('should return 0 for single value', () => {
      expect(stddev([10])).toBe(0);
    });
    
    it('should return 0 for empty array', () => {
      expect(stddev([])).toBe(0);
    });
    
    it('should accept pre-calculated mean', () => {
      const values = [2, 4, 4, 4, 5, 5, 7, 9];
      const avg = mean(values);
      const result = stddev(values, avg);
      expect(result).toBeCloseTo(2, 0);
    });
    
    it('should return 0 for uniform values', () => {
      expect(stddev([5, 5, 5, 5])).toBe(0);
    });
  });
  
  describe('toDateString()', () => {
    it('should format date as YYYY-MM-DD', () => {
      const date = new Date('2025-12-26T15:30:00Z');
      expect(toDateString(date)).toBe('2025-12-26');
    });
  });
  
  describe('daysAgo()', () => {
    it('should calculate date N days ago', () => {
      const today = new Date('2025-12-26T12:00:00Z');
      const result = daysAgo(7, today);
      
      expect(toDateString(result)).toBe('2025-12-19');
    });
    
    it('should default to current date', () => {
      const result = daysAgo(1);
      const expected = new Date();
      expected.setDate(expected.getDate() - 1);
      
      expect(toDateString(result)).toBe(toDateString(expected));
    });
  });
  
  describe('TrendDetector class', () => {
    let detector;
    let mockTopicAdapter;
    
    beforeEach(() => {
      mockTopicAdapter = {
        getAllTopics: jest.fn().mockReturnValue([
          { id: 1, name: 'Politics' },
          { id: 2, name: 'Technology' }
        ]),
        getTopic: jest.fn().mockReturnValue({ id: 1, name: 'Politics' }),
        getTopicDayCount: jest.fn().mockReturnValue(10),
        getTopicDailyCounts: jest.fn().mockReturnValue([
          { date: '2025-12-19', article_count: 5 },
          { date: '2025-12-20', article_count: 6 },
          { date: '2025-12-21', article_count: 4 },
          { date: '2025-12-22', article_count: 5 },
          { date: '2025-12-23', article_count: 7 },
          { date: '2025-12-24', article_count: 5 },
          { date: '2025-12-25', article_count: 6 }
        ]),
        getTopicTrends: jest.fn().mockReturnValue([]),
        getRecentTopics: jest.fn().mockReturnValue([]),
        getTopicsWithRecentActivity: jest.fn().mockReturnValue([]),
        saveTopicTrend: jest.fn(),
        getLatestTrends: jest.fn().mockReturnValue([])
      };
      
      detector = new TrendDetector({
        topicAdapter: mockTopicAdapter,
        logger: { log: jest.fn(), error: jest.fn() }
      });
    });
    
    describe('calculateBaseline()', () => {
      it('should calculate mean and stddev', () => {
        const baseline = detector.calculateBaseline(1);
        
        expect(baseline.mean).toBeCloseTo(5.43, 1);
        expect(baseline.stddev).toBeGreaterThan(0);
        expect(baseline.values.length).toBe(7);
      });
      
      it('should have minimum stddev to avoid division issues', () => {
        mockTopicAdapter.getTopicDailyCounts.mockReturnValue([
          { date: '2025-12-19', article_count: 5 },
          { date: '2025-12-20', article_count: 5 }
        ]);
        
        const baseline = detector.calculateBaseline(1);
        
        expect(baseline.stddev).toBeGreaterThanOrEqual(0.5);
      });
      
      it('should pad with zeros for incomplete history', () => {
        mockTopicAdapter.getTopicDailyCounts.mockReturnValue([
          { date: '2025-12-25', article_count: 5 }
        ]);
        
        const baseline = detector.calculateBaseline(1);
        
        expect(baseline.values.length).toBe(BASELINE_DAYS);
      });
    });
    
    describe('calculateTrendScore()', () => {
      it('should calculate trend score above baseline', () => {
        const baseline = { mean: 5, stddev: 1 };
        const result = detector.calculateTrendScore(10, baseline);
        
        expect(result.score).toBe(5); // (10 - 5) / 1
        expect(result.isTrending).toBe(true);
        expect(result.change).toBe(5);
        expect(result.percentChange).toBe(100);
      });
      
      it('should not be trending if below threshold', () => {
        const baseline = { mean: 5, stddev: 2 };
        const result = detector.calculateTrendScore(7, baseline);
        
        expect(result.score).toBe(1); // (7 - 5) / 2
        expect(result.isTrending).toBe(false);
      });
      
      it('should not be trending if count below minimum', () => {
        const baseline = { mean: 1, stddev: 0.5 };
        const result = detector.calculateTrendScore(2, baseline);
        
        expect(result.isTrending).toBe(false);
      });
      
      it('should handle negative changes', () => {
        const baseline = { mean: 10, stddev: 2 };
        const result = detector.calculateTrendScore(6, baseline);
        
        expect(result.score).toBe(-2);
        expect(result.change).toBe(-4);
        expect(result.percentChange).toBe(-40);
      });
      
      it('should handle zero baseline', () => {
        const baseline = { mean: 0, stddev: 0.5 };
        const result = detector.calculateTrendScore(5, baseline);
        
        expect(result.percentChange).toBe(100);
      });
    });
    
    describe('detectTrends()', () => {
      it('should detect trending topics', () => {
        // Mock high count for politics
        mockTopicAdapter.getTopicDayCount.mockImplementation((opts) => {
          if (opts.topicId === 1) return 15; // High count
          return 5; // Normal count
        });
        
        const trends = detector.detectTrends();
        
        expect(trends.length).toBeGreaterThan(0);
      });
      
      it('should sort by score descending', () => {
        mockTopicAdapter.getTopicDayCount.mockImplementation((opts) => {
          if (opts.topicId === 1) return 10;
          if (opts.topicId === 2) return 20;
          return 5;
        });
        
        mockTopicAdapter.getAllTopics.mockReturnValue([
          { id: 1, name: 'Politics' },
          { id: 2, name: 'Technology' }
        ]);
        
        const trends = detector.detectTrends();
        
        expect(trends.length).toBe(2);
        expect(trends[0].score).toBeGreaterThanOrEqual(trends[1].score);
      });
      
      it('should respect limit', () => {
        mockTopicAdapter.getAllTopics.mockReturnValue([
          { id: 1, name: 'Politics' },
          { id: 2, name: 'Technology' },
          { id: 3, name: 'Sports' }
        ]);
        mockTopicAdapter.getTopicDayCount.mockReturnValue(10);
        
        const trends = detector.detectTrends({ limit: 2 });
        
        expect(trends.length).toBeLessThanOrEqual(2);
      });
      
      it('should skip topics with zero activity', () => {
        mockTopicAdapter.getTopicDayCount.mockReturnValue(0);
        
        const trends = detector.detectTrends();
        
        expect(trends.length).toBe(0);
      });
    });
    
    describe('updateDailyTrends()', () => {
      it('should update trends for all topics', () => {
        const result = detector.updateDailyTrends('2025-12-26');
        
        expect(result.updated).toBe(2); // Two topics
        expect(result.date).toBe('2025-12-26');
        expect(mockTopicAdapter.saveTopicTrend).toHaveBeenCalledTimes(2);
      });
      
      it('should default to today', () => {
        const result = detector.updateDailyTrends();
        
        expect(result.date).toBe(toDateString(new Date()));
      });
    });
    
    describe('getTopicHistory()', () => {
      it('should get trend history', () => {
        mockTopicAdapter.getTopicTrends.mockReturnValue([
          { date: '2025-12-20', article_count: 5, trend_score: 1.0 },
          { date: '2025-12-21', article_count: 6, trend_score: 1.5 }
        ]);
        
        const history = detector.getTopicHistory(1, { days: 30 });
        
        expect(history.length).toBe(2);
        expect(mockTopicAdapter.getTopicTrends).toHaveBeenCalled();
      });
    });
    
    describe('getEmergingTopics()', () => {
      it('should get recently created topics', () => {
        mockTopicAdapter.getRecentTopics.mockReturnValue([
          { id: 10, name: 'AI Agents', article_count: 5, created_at: '2025-12-25' }
        ]);
        
        const emerging = detector.getEmergingTopics({ days: 3 });
        
        expect(emerging.length).toBe(1);
        expect(emerging[0].topicName).toBe('AI Agents');
        expect(emerging[0].isNew).toBe(true);
      });
    });
    
    describe('detectBreakingNews()', () => {
      it('should detect high velocity topics', () => {
        mockTopicAdapter.getTopicsWithRecentActivity.mockReturnValue([
          { id: 1, name: 'Politics', recent_count: 10 }
        ]);
        
        const breaking = detector.detectBreakingNews({ hours: 6, minArticles: 5 });
        
        expect(breaking.length).toBe(1);
        expect(breaking[0].velocity).toBeCloseTo(10/6, 1);
        expect(breaking[0].isBreaking).toBe(true);
      });
      
      it('should filter non-breaking topics', () => {
        mockTopicAdapter.getTopicsWithRecentActivity.mockReturnValue([
          { id: 1, name: 'Politics', recent_count: 2 } // Low velocity
        ]);
        
        const breaking = detector.detectBreakingNews({ hours: 6 });
        
        expect(breaking.length).toBe(0);
      });
    });
    
    describe('getStats()', () => {
      it('should return configuration', () => {
        const stats = detector.getStats();
        
        expect(stats.baselineDays).toBe(BASELINE_DAYS);
        expect(stats.sigmaThreshold).toBe(TREND_SIGMA_THRESHOLD);
        expect(stats.minDailyArticles).toBe(MIN_DAILY_ARTICLES);
      });
    });
  });
  
  describe('constants', () => {
    it('should have reasonable defaults', () => {
      expect(BASELINE_DAYS).toBe(7);
      expect(TREND_SIGMA_THRESHOLD).toBe(2.0);
      expect(MIN_DAILY_ARTICLES).toBe(3);
    });
  });
});
