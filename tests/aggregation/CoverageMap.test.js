'use strict';

/**
 * Tests for CoverageMap
 * 
 * @group aggregation
 */

const { CoverageMap } = require('../../src/aggregation/CoverageMap');

describe('CoverageMap', () => {
  let coverageMap;
  
  beforeEach(() => {
    coverageMap = new CoverageMap();
  });
  
  describe('constructor', () => {
    it('should create instance with dependencies', () => {
      expect(coverageMap.perspectiveAnalyzer).toBeDefined();
      expect(coverageMap.factExtractor).toBeDefined();
    });
  });
  
  describe('generateCoverageMap', () => {
    it('should generate coverage map for story cluster', () => {
      const storyCluster = {
        storyId: 'story-001',
        articles: [
          {
            id: 1,
            title: 'Company Announces Major Deal',
            body: 'The company has announced a major acquisition worth $5 billion. CEO said "This is transformative".',
            host: 'business-news.com',
            publishedAt: '2025-12-26T10:00:00Z'
          },
          {
            id: 2,
            title: 'Industry Giant Makes Bold Move',
            body: 'Industry analysts are skeptical about the $5 billion deal. Critics say it may fail.',
            host: 'skeptic-journal.org',
            publishedAt: '2025-12-26T11:00:00Z'
          },
          {
            id: 3,
            title: 'Acquisition Agreement Reached',
            body: 'The acquisition agreement was signed on December 26, 2025 for $5 billion.',
            host: 'neutral-wire.com',
            publishedAt: '2025-12-26T12:00:00Z'
          }
        ]
      };
      
      const map = coverageMap.generateCoverageMap(storyCluster);
      
      expect(map).toHaveProperty('storyId', 'story-001');
      expect(map).toHaveProperty('sources');
      expect(map).toHaveProperty('perspectives');
      expect(map).toHaveProperty('facts');
      expect(map).toHaveProperty('timeline');
      expect(map).toHaveProperty('summary');
      
      // Should have 3 sources
      expect(map.sources).toHaveLength(3);
    });
    
    it('should analyze perspectives for each source', () => {
      const storyCluster = {
        storyId: 'story-002',
        articles: [
          {
            id: 1,
            title: 'Great News',
            body: 'This is wonderful, excellent, and amazing news for everyone.',
            host: 'positive.com',
            publishedAt: '2025-12-26T10:00:00Z'
          },
          {
            id: 2,
            title: 'Terrible News',
            body: 'This is awful, horrible, and disastrous for the community.',
            host: 'negative.com',
            publishedAt: '2025-12-26T10:00:00Z'
          }
        ]
      };
      
      const map = coverageMap.generateCoverageMap(storyCluster);
      
      expect(map.perspectives.perspectives).toHaveLength(2);
      
      const positive = map.perspectives.perspectives.find(p => p.host === 'positive.com');
      const negative = map.perspectives.perspectives.find(p => p.host === 'negative.com');
      
      expect(positive.toneScore).toBeGreaterThan(0);
      expect(negative.toneScore).toBeLessThan(0);
    });
    
    it('should extract facts from all articles', () => {
      const storyCluster = {
        storyId: 'story-003',
        articles: [
          {
            id: 1,
            title: 'Report',
            body: 'The CEO said "We expect 25% growth" on Monday.',
            host: 'news.com',
            publishedAt: '2025-12-26T10:00:00Z'
          }
        ]
      };
      
      const map = coverageMap.generateCoverageMap(storyCluster);
      
      expect(map.facts).toHaveLength(1);
      expect(map.facts[0]).toHaveProperty('quotes');
      expect(map.facts[0]).toHaveProperty('statistics');
    });
    
    it('should build timeline from article dates', () => {
      const storyCluster = {
        storyId: 'story-004',
        articles: [
          { id: 1, title: 'A', body: 'Content', host: 'a.com', publishedAt: '2025-12-26T10:00:00Z' },
          { id: 2, title: 'B', body: 'Content', host: 'b.com', publishedAt: '2025-12-26T08:00:00Z' },
          { id: 3, title: 'C', body: 'Content', host: 'c.com', publishedAt: '2025-12-26T12:00:00Z' }
        ]
      };
      
      const map = coverageMap.generateCoverageMap(storyCluster);
      
      expect(map.timeline).toHaveLength(3);
      // Should be sorted chronologically
      expect(map.timeline[0].publishedAt).toBe('2025-12-26T08:00:00Z');
      expect(map.timeline[2].publishedAt).toBe('2025-12-26T12:00:00Z');
    });
    
    it('should generate summary statistics', () => {
      const storyCluster = {
        storyId: 'story-005',
        articles: [
          { id: 1, title: 'A', body: 'Good content', host: 'a.com', publishedAt: '2025-12-26T10:00:00Z' },
          { id: 2, title: 'B', body: 'Bad content', host: 'b.com', publishedAt: '2025-12-26T11:00:00Z' }
        ]
      };
      
      const map = coverageMap.generateCoverageMap(storyCluster);
      
      expect(map.summary).toHaveProperty('totalSources', 2);
      expect(map.summary).toHaveProperty('timeSpanHours');
      expect(map.summary).toHaveProperty('averageTone');
      expect(map.summary).toHaveProperty('toneVariance');
    });
  });
  
  describe('getFullCoverageAnalysis', () => {
    it('should provide complete coverage analysis', () => {
      const storyCluster = {
        storyId: 'story-full',
        articles: [
          {
            id: 1,
            title: 'Event Coverage A',
            body: 'CEO said "We are excited" about the $1 billion project announced December 26.',
            host: 'news-a.com',
            publishedAt: '2025-12-26T10:00:00Z'
          },
          {
            id: 2,
            title: 'Event Coverage B',
            body: 'Critics warn the $1 billion project may face challenges. Analysts are concerned.',
            host: 'news-b.com',
            publishedAt: '2025-12-26T11:00:00Z'
          }
        ]
      };
      
      const analysis = coverageMap.getFullCoverageAnalysis(storyCluster);
      
      expect(analysis).toHaveProperty('storyId');
      expect(analysis).toHaveProperty('coverageMap');
      expect(analysis).toHaveProperty('perspectiveComparisons');
      expect(analysis).toHaveProperty('factComparisons');
      expect(analysis).toHaveProperty('overallAssessment');
    });
    
    it('should compare all pairs of perspectives', () => {
      const storyCluster = {
        storyId: 'story-pairs',
        articles: [
          { id: 1, title: 'A', body: 'Content A', host: 'a.com', publishedAt: '2025-12-26T10:00:00Z' },
          { id: 2, title: 'B', body: 'Content B', host: 'b.com', publishedAt: '2025-12-26T10:00:00Z' },
          { id: 3, title: 'C', body: 'Content C', host: 'c.com', publishedAt: '2025-12-26T10:00:00Z' }
        ]
      };
      
      const analysis = coverageMap.getFullCoverageAnalysis(storyCluster);
      
      // With 3 articles, should have C(3,2) = 3 perspective comparisons
      expect(analysis.perspectiveComparisons).toHaveLength(3);
    });
    
    it('should generate overall assessment', () => {
      const storyCluster = {
        storyId: 'story-assess',
        articles: [
          { id: 1, title: 'A', body: 'Good content', host: 'a.com', publishedAt: '2025-12-26T10:00:00Z' },
          { id: 2, title: 'B', body: 'Bad content', host: 'b.com', publishedAt: '2025-12-26T10:00:00Z' }
        ]
      };
      
      const analysis = coverageMap.getFullCoverageAnalysis(storyCluster);
      
      expect(analysis.overallAssessment).toHaveProperty('coverageBreadth');
      expect(analysis.overallAssessment).toHaveProperty('perspectiveDiversity');
      expect(analysis.overallAssessment).toHaveProperty('factualConsistency');
      expect(analysis.overallAssessment).toHaveProperty('confidence');
    });
  });
  
  describe('articles about same event cluster together', () => {
    it('should show common facts and shared coverage for same event', () => {
      // Simulate 3 different sources covering the same breaking news event
      const sameFlight = {
        storyId: 'flight-delay-story',
        articles: [
          {
            id: 1,
            title: 'Major Airline Delays Hundreds of Flights',
            body: `
              Airline XYZ has delayed over 500 flights today due to a computer system failure.
              CEO John Smith said "We are working around the clock to resolve this issue."
              The outage began at approximately 6:00 AM EST on December 26, 2025.
              Industry experts estimate losses of $50 million.
            `,
            host: 'breaking-news.com',
            publishedAt: '2025-12-26T08:00:00Z'
          },
          {
            id: 2,
            title: 'XYZ Airline System Crash Strands Passengers',
            body: `
              Hundreds of passengers are stranded as Airline XYZ experiences major technical problems.
              The airline confirmed over 500 flights have been affected.
              John Smith apologized to customers, saying "We are working around the clock to resolve this issue."
              The disruption started early this morning on December 26.
            `,
            host: 'travel-news.org',
            publishedAt: '2025-12-26T09:00:00Z'
          },
          {
            id: 3,
            title: 'Computer Glitch Hits XYZ, 500+ Flights Grounded',
            body: `
              A major computer system failure at Airline XYZ has led to the cancellation and delay of 500 flights.
              The incident occurred on December 26, 2025.
              CEO statement: "We are working around the clock to resolve this issue."
              Analysts project financial impact of $50 million.
            `,
            host: 'aviation-today.net',
            publishedAt: '2025-12-26T10:00:00Z'
          }
        ]
      };
      
      const analysis = coverageMap.getFullCoverageAnalysis(sameFlight);
      
      // All three articles should be in the cluster
      expect(analysis.coverageMap.sources).toHaveLength(3);
      
      // Facts should be extracted from all
      expect(analysis.coverageMap.facts).toHaveLength(3);
      
      // The quote "We are working around the clock" should appear in multiple articles
      const allQuotes = analysis.coverageMap.facts.flatMap(f => f.quotes);
      const matchingQuotes = allQuotes.filter(q => 
        q.text.includes('working around the clock')
      );
      expect(matchingQuotes.length).toBeGreaterThanOrEqual(2);
      
      // The statistic "500" and "$50 million" should appear
      const allStats = analysis.coverageMap.facts.flatMap(f => f.statistics);
      expect(allStats.some(s => s.text.includes('500'))).toBe(true);
      expect(allStats.some(s => s.text.includes('50 million'))).toBe(true);
      
      // Timeline should span about 2 hours
      expect(analysis.coverageMap.summary.timeSpanHours).toBeLessThanOrEqual(3);
      
      // Overall assessment should show good coverage
      expect(analysis.overallAssessment.coverageBreadth).toBeGreaterThanOrEqual(3);
    });
  });
  
  describe('getStats', () => {
    it('should return module statistics', () => {
      const stats = coverageMap.getStats();
      
      expect(stats).toHaveProperty('perspectiveAnalyzer');
      expect(stats).toHaveProperty('factExtractor');
    });
  });
});
